import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { type Section, type Stage } from '@/lib/routine-engine';
import { type Blocker } from '@/lib/mission-engine';
import { ROADMAP_PHASES, currentRoadmapIndex, weeksToExam, projectSyllabusFinish, phaseBoundaryDates } from '@/lib/study-plan';
import { catExamDate } from '@/lib/routine-engine';
import { computePrepMemory, computeTopicMemory, buildCompletionRecords } from '@/lib/prep-memory-data';
import { computeBlueprintConfidence } from '@/lib/prep-memory';
import { isPremium } from '@/lib/access';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { selectBuddyBanner } from '@/lib/buddy-banner';

// GET /api/blueprint — the Study Blueprint: a single page that reads as "my
// study plan," not the daily task list. Every fact here is already decided
// by the deterministic engines (routine-engine, mission-engine, study-plan) —
// this endpoint only gathers them. The Gemini narration that used to run
// here was removed from the critical path (see the narrative comment below).
const BLOCKER_LABEL: Record<Blocker, string> = {
  inconsistency: "staying consistent",
  dont_know_what: 'knowing what to study',
  mock_anxiety: 'mock anxiety',
  time_wasting: 'time management',
};

export async function GET() {
  // Local JWT verification — the middleware already paid the network auth
  // round-trip for this request.
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // One wave: this route used to fetch topic_coverage 3× (its own tally +
  // once inside each memory engine) and build completion records twice
  // (30-day + full-history). Coverage and the full-history records are now
  // fetched ONCE here and passed into both engines — same rows, same
  // arithmetic, ~5 fewer round-trips.
  const [{ data: profile }, { data: coverageRows }, { data: streak }, allCompletions] = await Promise.all([
    admin.from('profiles')
      .select(`
        full_name, target_percentile, attempt_year, exam_target, is_working_professional, is_repeater,
        self_reported_weakest_section, self_reported_strongest_section, self_reported_weak_topic,
        current_stage, biggest_blocker, created_at, buddy_id, is_premium
      `)
      .eq('id', user.id).single(),
    admin.from('topic_coverage').select('topic, status, updated_at').eq('student_id', user.id),
    admin.from('streak_data').select('current_streak').eq('student_id', user.id).maybeSingle(),
    buildCompletionRecords(admin, user.id, '2000-01-01'),
  ]);
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const archetype = { isRepeater: !!profile.is_repeater, isWorkingProfessional: !!profile.is_working_professional };
  const prefetched = { coverageRows: coverageRows ?? [], completionRecords: allCompletions };
  const coverage = coverageRows;
  const [{ prepMemory, weeklyEvolution, healthScore }, topicMemory] = await Promise.all([
    computePrepMemory(admin, user.id, archetype, (profile.created_at as string | null)?.split('T')[0] ?? null, prefetched),
    computeTopicMemory(admin, user.id, archetype, prefetched),
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

  // The AI narration is gone from the blocking path — nothing in the app
  // renders `narrative` anymore (the narrative UI was removed in the
  // Conclusions-layer iteration; the generation outlived it), yet every
  // caller — My CAT Plan AND the onboarding Reveal, the most emotionally
  // loaded screen in the product — was waiting 1-3s for Gemini to write a
  // sentence nobody displays, and paying the API cost per view. The
  // deterministic fallback line (microseconds, pure template) stays in the
  // payload so any stale client bundle that still reads the field keeps
  // working. If a narrated summary ever returns to the UI, fetch it from a
  // separate non-blocking endpoint — never on this page's critical path.
  const narrative = fallbackNarrative(phase.label, weeksRemaining, weak, weakTopic, blocker);
  const source: 'ai' | 'fallback' = 'fallback';

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
