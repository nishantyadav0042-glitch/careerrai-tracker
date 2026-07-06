import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { type Section, type Stage } from '@/lib/routine-engine';
import { type Blocker } from '@/lib/mission-engine';
import { ROADMAP_PHASES, currentRoadmapIndex, weeksToExam } from '@/lib/study-plan';
import { callGemini, geminiEnabled, stripNames } from '@/lib/gemini';
import { computePrepMemory } from '@/lib/prep-memory-data';
import { computeBlueprintConfidence } from '@/lib/prep-memory';

// GET /api/blueprint — the Study Blueprint: a single page that reads as "my
// study plan," not the daily task list. Every fact here is already decided
// by the deterministic engines (routine-engine, mission-engine, study-plan) —
// this endpoint only gathers and (optionally) narrates them. AI is used the
// same way it already is for buddy briefings: it may summarize and phrase,
// it may NEVER invent a plan, task, or fact that isn't in the data below.
const BLUEPRINT_NARRATION_RULE = `You are writing a short "Study Blueprint" summary directly for a CAT exam aspirant inside CareerRai, a CAT-prep app.

ABSOLUTE RULES — these define the product and may never be broken:
1. You may ONLY summarize, organize, and present the facts you are given below. Never invent a fact, statistic, study technique, or plan detail that isn't explicitly provided.
2. The study plan itself is already decided by the app's own planning logic — your only job is to narrate it clearly and warmly, never to propose a different plan, task, or sequence.
3. Never diagnose a psychological or emotional state beyond what's explicitly given.
4. Second person ("you"), plain language, no jargon, no bullet points, no headers. 3-4 short sentences.
5. If a fact is missing below, omit it — never guess or fabricate to fill a gap.`;

const BLOCKER_LABEL: Record<Blocker, string> = {
  inconsistency: "staying consistent",
  dont_know_what: 'knowing what to study',
  mock_anxiety: 'mock anxiety',
  time_wasting: 'time management',
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const [{ data: profile }] = await Promise.all([
    admin.from('profiles')
      .select(`
        full_name, target_percentile, attempt_year, is_working_professional, is_repeater,
        self_reported_weakest_section, self_reported_strongest_section, self_reported_weak_topic,
        current_stage, biggest_blocker, created_at
      `)
      .eq('id', user.id).single(),
  ]);
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const [{ data: coverage }, { data: streak }, { prepMemory, weeklyEvolution, healthScore }] = await Promise.all([
    admin.from('topic_coverage').select('status').eq('student_id', user.id),
    admin.from('streak_data').select('current_streak').eq('student_id', user.id).maybeSingle(),
    computePrepMemory(
      admin, user.id,
      { isRepeater: !!profile.is_repeater, isWorkingProfessional: !!profile.is_working_professional },
      (profile.created_at as string | null)?.split('T')[0] ?? null
    ),
  ]);

  const weak = profile.self_reported_weakest_section as Section | null;
  const weakTopic = profile.self_reported_weak_topic as string | null;
  const stage = profile.current_stage as Stage | null;
  const blocker = profile.biggest_blocker as Blocker | null;

  const weeksRemaining = weeksToExam(new Date(), profile.attempt_year as number | null);
  const roadmapIndex = currentRoadmapIndex(weeksRemaining, stage);
  const phase = ROADMAP_PHASES[roadmapIndex];

  const coverageTally = { not_started: 0, started: 0, completed: 0, strong: 0 } as Record<string, number>;
  for (const row of coverage ?? []) coverageTally[row.status as string] = (coverageTally[row.status as string] ?? 0) + 1;
  const coverageTotal = coverageTally.not_started + coverageTally.started + coverageTally.completed + coverageTally.strong;

  const blueprintConfidence = computeBlueprintConfidence({
    mockCount: prepMemory.mockTrend.count,
    coverageTotal,
    hasStage: stage != null,
    hasWeakTopic: weakTopic != null,
    daysStudiedLast30: prepMemory.last30.daysStudied,
  });

  const facts = [
    `Target CAT year: ${profile.attempt_year ?? 'not set'}`,
    `Weeks remaining to exam: ${weeksRemaining}`,
    `Current phase: ${phase.label} (${phase.weekRange}) — ${phase.objective}`,
    weak ? `Weakest section: ${weak}${weakTopic ? ` (toughest topic: ${weakTopic})` : ''}` : null,
    `Coverage matrix: ${coverageTally.not_started} never started, ${coverageTally.started} started, ${coverageTally.completed} completed, ${coverageTally.strong} strong`,
    blocker ? `Self-reported biggest blocker: ${BLOCKER_LABEL[blocker]}` : null,
    streak?.current_streak ? `Current daily streak: ${streak.current_streak} days` : null,
    profile.target_percentile ? `Target percentile: ${profile.target_percentile}` : null,
  ].filter((f): f is string => f != null).join('\n');

  let narrative: string;
  let source: 'ai' | 'fallback' = 'fallback';
  if (await geminiEnabled()) {
    const safeFacts = stripNames(facts, [profile.full_name as string | null]);
    const ai = await callGemini({
      parts: [{ text: `Here are the facts:\n${safeFacts}\n\nWrite the Study Blueprint summary.` }],
      system: BLUEPRINT_NARRATION_RULE,
      maxTokens: 220,
      temperature: 0.4,
    });
    if (ai) {
      narrative = stripNames(ai, [profile.full_name as string | null]);
      source = 'ai';
    } else {
      narrative = fallbackNarrative(phase.label, weeksRemaining, weak, weakTopic, blocker);
    }
  } else {
    narrative = fallbackNarrative(phase.label, weeksRemaining, weak, weakTopic, blocker);
  }

  return NextResponse.json({
    narrative,
    source,
    phase,
    weeksRemaining,
    weakestSection: weak,
    weakTopic,
    currentStage: stage,
    biggestBlocker: blocker,
    coverageTally,
    currentStreak: streak?.current_streak ?? 0,
    targetPercentile: profile.target_percentile,
    prepMemory,
    weeklyEvolution,
    healthScore,
    blueprintConfidence,
  });
}

function fallbackNarrative(
  phaseLabel: string,
  weeksRemaining: number,
  weak: Section | null,
  weakTopic: string | null,
  blocker: Blocker | null
): string {
  const focus = weak ? `${weak}${weakTopic ? ` — ${weakTopic}` : ''}` : 'a balanced spread across sections';
  const blockerLine = blocker ? ` You told us ${BLOCKER_LABEL[blocker]} is your biggest blocker — that's shaping what today leads with.` : '';
  return `You're ${weeksRemaining} weeks out, in the ${phaseLabel} phase. Right now the plan is built around ${focus}.${blockerLine}`;
}
