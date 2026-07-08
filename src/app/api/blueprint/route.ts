import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { type Section, type Stage } from '@/lib/routine-engine';
import { type Blocker } from '@/lib/mission-engine';
import { ROADMAP_PHASES, currentRoadmapIndex, weeksToExam, projectSyllabusFinish, phaseBoundaryDates } from '@/lib/study-plan';
import { catExamDate } from '@/lib/routine-engine';
import { callGemini, geminiEnabled, stripNames } from '@/lib/gemini';
import { computePrepMemory, computeTopicMemory } from '@/lib/prep-memory-data';
import { computeBlueprintConfidence } from '@/lib/prep-memory';
import { isPremium } from '@/lib/access';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { selectBuddyBanner } from '@/lib/buddy-banner';

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
        full_name, target_percentile, attempt_year, exam_target, is_working_professional, is_repeater,
        self_reported_weakest_section, self_reported_strongest_section, self_reported_weak_topic,
        current_stage, biggest_blocker, created_at, buddy_id, is_premium
      `)
      .eq('id', user.id).single(),
  ]);
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const archetype = { isRepeater: !!profile.is_repeater, isWorkingProfessional: !!profile.is_working_professional };
  const [{ data: coverage }, { data: streak }, { prepMemory, weeklyEvolution, healthScore }, topicMemory] = await Promise.all([
    admin.from('topic_coverage').select('status').eq('student_id', user.id),
    admin.from('streak_data').select('current_streak').eq('student_id', user.id).maybeSingle(),
    computePrepMemory(admin, user.id, archetype, (profile.created_at as string | null)?.split('T')[0] ?? null),
    computeTopicMemory(admin, user.id, archetype),
  ]);

  const weak = profile.self_reported_weakest_section as Section | null;
  const weakTopic = profile.self_reported_weak_topic as string | null;
  const stage = profile.current_stage as Stage | null;
  const blocker = profile.biggest_blocker as Blocker | null;

  const weeksRemaining = weeksToExam(new Date(), profile.attempt_year as number | null);
  const roadmapIndex = currentRoadmapIndex(weeksRemaining, stage);
  const phase = ROADMAP_PHASES[roadmapIndex];

  const coverageTally = { not_started: 0, learning: 0, practicing: 0, revising: 0, exam_ready: 0 } as Record<string, number>;
  for (const row of coverage ?? []) coverageTally[row.status as string] = (coverageTally[row.status as string] ?? 0) + 1;
  const coverageTotal = coverageTally.not_started + coverageTally.learning + coverageTally.practicing + coverageTally.revising + coverageTally.exam_ready;

  const blueprintConfidence = computeBlueprintConfidence({
    mockCount: prepMemory.mockTrend.count,
    coverageTotal,
    hasStage: stage != null,
    hasWeakTopic: weakTopic != null,
    daysStudiedLast30: prepMemory.last30.daysStudied,
  });

  // ── My CAT Plan: studied/revision/not-started, finish date, this week ──
  // All of it reads off topicMemory (all 46 exam topics, defaulted to
  // not_started when a topic has no coverage row at all) rather than the raw
  // coverageTally above, which only counts topics that already have a row.
  const totalTopics = Object.keys(TOPIC_METADATA).length;
  const notStartedTopics = topicMemory.filter((t) => t.status === 'not_started');
  const notStartedCount = notStartedTopics.length;
  const studiedOnceCount = totalTopics - notStartedCount;
  const dueForRevision = topicMemory
    .filter((t) => t.revisionOverdue)
    .sort((a, b) => (b.lastTouchedDaysAgo ?? 0) - (a.lastTouchedDaysAgo ?? 0));

  const today = new Date();
  let examYear = (profile.attempt_year as number | null) ?? today.getFullYear();
  if (today > catExamDate(examYear)) examYear += 1;
  const topicsStartedLast21Days = topicMemory.filter(
    (t) => t.status !== 'not_started' && t.firstTouchedDaysAgo != null && t.firstTouchedDaysAgo <= 21
  ).length;
  const finishProjection = projectSyllabusFinish({
    today,
    examDate: catExamDate(examYear),
    topicsRemaining: notStartedCount,
    topicsStartedLast21Days,
  });
  const { mockIntensiveStart, revisionSprintStart } = phaseBoundaryDates(catExamDate(examYear));
  const dateLabel = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const roadmapDates = {
    mockIntensiveStart: dateLabel(mockIntensiveStart),
    revisionSprintStart: dateLabel(revisionSprintStart),
  };

  const notStartedBySection: Partial<Record<Section, number>> = {};
  for (const t of notStartedTopics) {
    const section = TOPIC_METADATA[t.topic]?.section;
    if (section) notStartedBySection[section] = (notStartedBySection[section] ?? 0) + 1;
  }
  const sectionToFinish = (Object.entries(notStartedBySection) as [Section, number][])
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const thisWeek: { label: string; href: string }[] = [];
  for (const t of dueForRevision) {
    if (thisWeek.length >= 1) break; // first slot: most-overdue revision, if any
    thisWeek.push({ label: `Revise ${t.topic}`, href: '/student/analysis' });
  }
  thisWeek.push({ label: 'Take your next mock', href: '/student/tracker' });
  if (sectionToFinish) thisWeek.push({ label: `Finish ${sectionToFinish}`, href: '/student/analysis' });
  let extraRevisionIdx = 1;
  while (thisWeek.length < 3 && dueForRevision[extraRevisionIdx]) {
    thisWeek.push({ label: `Revise ${dueForRevision[extraRevisionIdx].topic}`, href: '/student/analysis' });
    extraRevisionIdx++;
  }

  // One rules-generated diagnosis, priority order, or nothing — never a
  // generic line. "Mocks need attention" only fires once mock cadence
  // actually matters (Mock Intensive / Revision Sprint) and none landed
  // this week — there's no invented "planned mocks" target to compare to.
  const revRatio = studiedOnceCount > 0 ? dueForRevision.length / studiedOnceCount : 0;
  const notStartedRatio = notStartedCount / totalTopics;
  const inMockCadencePhase = phase.id === 'mock_intensive' || phase.id === 'revision_sprint';
  let biggestPriority: string | null = null;
  if (inMockCadencePhase && prepMemory.last7.mocksLogged === 0) {
    biggestPriority = 'Mocks need more attention this week.';
  } else if (revRatio > 0.45) {
    biggestPriority = 'Revision needs more attention than new topics right now.';
  } else if (notStartedRatio > 0.3) {
    biggestPriority = `Finish the remaining ${notStartedCount} topics before increasing mock frequency.`;
  } else if (dueForRevision.length > 0) {
    biggestPriority = "You're covering new topics well. Focus on revision next.";
  }

  const buddyBanner = selectBuddyBanner({
    mocksCount: prepMemory.mockTrend.count,
    latestPercentile: prepMemory.mockTrend.latestPercentile,
    previousPercentile: prepMemory.mockTrend.previousPercentile,
    dueForRevisionCount: dueForRevision.length,
    daysStudiedLast30: prepMemory.last30.daysStudied,
    isRepeater: archetype.isRepeater,
    isWorkingProfessional: archetype.isWorkingProfessional,
  });

  const facts = [
    `Target CAT year: ${profile.attempt_year ?? 'not set'}`,
    `Weeks remaining to exam: ${weeksRemaining}`,
    `Current phase: ${phase.label} (${phase.weekRange}) — ${phase.objective}`,
    weak ? `Weakest section: ${weak}${weakTopic ? ` (toughest topic: ${weakTopic})` : ''}` : null,
    `Preparation map: ${coverageTally.not_started} not started, ${coverageTally.learning} learning concepts, ${coverageTally.practicing} practicing questions, ${coverageTally.revising} in revision, ${coverageTally.exam_ready} exam ready`,
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
    examTarget: profile.exam_target ?? null,
    attemptYear: profile.attempt_year ?? null,
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
    topicMemory,
    hasBuddy: !!profile.buddy_id,
    isPremium: isPremium(profile),
    totalTopics,
    studiedOnceCount,
    notStartedCount,
    dueForRevisionCount: dueForRevision.length,
    mocksCompleted: prepMemory.mockTrend.count,
    finishProjection,
    roadmapDates,
    thisWeek,
    biggestPriority,
    buddyBanner,
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
