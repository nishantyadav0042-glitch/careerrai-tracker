import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { liveStreak } from '@/lib/streak-utils';
import { type Section, type Stage } from '@/lib/routine-engine';
import { type Blocker } from '@/lib/mission-engine';
import { ROADMAP_PHASES, currentRoadmapIndex, weeksToExam, projectSyllabusFinish, phaseBoundaryDates } from '@/lib/study-plan';
import { catExamDate } from '@/lib/routine-engine';
import { MOCKS_PER_WEEK, mocksForWeekOf, phaseOn } from '@/lib/exam-calendar';
import { computePrepMemory, computeTopicMemory, buildCompletionRecords } from '@/lib/prep-memory-data';
import { computeBlueprintConfidence } from '@/lib/prep-memory';
import { isPremium } from '@/lib/access';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { selectBuddyBanner } from '@/lib/buddy-banner';
import { buildWeekPlan } from '@/lib/study-forecast';
import { remainingSyllabusHours, remainingMockHours, computeRequiredPace, studentEffortMultiplier } from '@/lib/study-pace';

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
        current_stage, biggest_blocker, created_at, buddy_id, is_premium, study_target_hours, syllabus_target_date,
        last_year_percentile
      `)
      .eq('id', user.id).single(),
    admin.from('topic_coverage').select('topic, status, updated_at, is_priority').eq('student_id', user.id),
    admin.from('streak_data').select('current_streak, last_log_date').eq('student_id', user.id).maybeSingle(),
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
  // 'learning' = concepts just begun, NOT a finished study pass. Counting it
  // as "studied once" made a student who merely tapped through onboarding land
  // on "46/46 studied · Syllabus done" with nothing left to do — a fake plan.
  // A topic is "studied once" only once it reaches practicing/revising/exam_ready;
  // 'learning' is surfaced as its own in-progress bucket, and BOTH not_started
  // and learning count as still-to-finish for the syllabus projection.
  const notStartedTopics = topicMemory.filter((t) => t.status === 'not_started');
  const learningTopics = topicMemory.filter((t) => t.status === 'learning');
  const notStartedCount = notStartedTopics.length;
  const learningCount = learningTopics.length;
  // Topics with a genuine study pass behind them.
  const studiedOnceCount = topicMemory.filter(
    (t) => t.status === 'practicing' || t.status === 'revising' || t.status === 'exam_ready'
  ).length;
  // Everything not yet studied through — drives the finish projection and the
  // "syllabus done" gate, so neither fires while topics are still in learning.
  const remainingTopics = notStartedCount + learningCount;
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
    topicsRemaining: remainingTopics,
    topicsStartedLast21Days,
  });
  // Phase dates INTEGRATE with the student's own target (founder: standalone
  // calendar dates next to a personal target read as a bogus plan). Mock
  // Intensive begins the day after THEIR syllabus finish date — mocks start
  // when your syllabus ends, that's the whole point of the date. Revision
  // Sprint stays anchored to the exam (the final consolidation weeks), but
  // never collapses to less than two weeks of mocks if the target runs late.
  const exam = catExamDate(examYear);
  const defaults = phaseBoundaryDates(exam);
  const targetDateIso = profile.syllabus_target_date as string | null;
  const mockIntensiveStart = targetDateIso
    ? new Date(new Date(targetDateIso + 'T00:00:00').getTime() + 86_400_000)
    : defaults.mockIntensiveStart;
  const minRevision = new Date(mockIntensiveStart.getTime() + 14 * 86_400_000);
  const maxRevision = new Date(exam.getTime() - 7 * 86_400_000);
  const revisionSprintStart = new Date(Math.min(Math.max(defaults.revisionSprintStart.getTime(), minRevision.getTime()), maxRevision.getTime()));
  const dateLabel = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const roadmapDates = {
    mockIntensiveStart: dateLabel(mockIntensiveStart),
    revisionSprintStart: dateLabel(revisionSprintStart),
  };

  // "Finish X" spans every not-yet-studied-through topic — not_started AND
  // still-in-learning — so the suggestion doesn't vanish the moment a student
  // has merely opened every topic.
  const remainingBySection: Partial<Record<Section, number>> = {};
  for (const t of [...notStartedTopics, ...learningTopics]) {
    const section = TOPIC_METADATA[t.topic]?.section;
    if (section) remainingBySection[section] = (remainingBySection[section] ?? 0) + 1;
  }
  const sectionToFinish = (Object.entries(remainingBySection) as [Section, number][])
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const thisWeek: { label: string; href: string }[] = [];
  for (const t of dueForRevision) {
    if (thisWeek.length >= 1) break; // first slot: most-overdue revision, if any
    thisWeek.push({ label: `Revise ${t.topic}`, href: '/student/plan/topics?status=revision' });
  }
  thisWeek.push({ label: 'Take your next mock', href: '/student/tracker' });
  if (sectionToFinish) thisWeek.push({ label: `Finish ${sectionToFinish}`, href: '/student/plan/topics?status=remaining' });
  let extraRevisionIdx = 1;
  while (thisWeek.length < 3 && dueForRevision[extraRevisionIdx]) {
    thisWeek.push({ label: `Revise ${dueForRevision[extraRevisionIdx].topic}`, href: '/student/plan/topics?status=revision' });
    extraRevisionIdx++;
  }

  // One rules-generated diagnosis, priority order, or nothing — never a
  // generic line. "Mocks need attention" only fires once mock cadence
  // actually matters (Mock Intensive / Revision Sprint) and none landed
  // this week — there's no invented "planned mocks" target to compare to.
  const revRatio = studiedOnceCount > 0 ? dueForRevision.length / studiedOnceCount : 0;
  const remainingRatio = remainingTopics / totalTopics;
  const inMockCadencePhase = phase.id === 'mock_intensive' || phase.id === 'revision_sprint';
  let biggestPriority: string | null = null;
  if (inMockCadencePhase && prepMemory.last7.mocksLogged === 0) {
    biggestPriority = 'Mocks need more attention this week.';
  } else if (revRatio > 0.45) {
    biggestPriority = 'Revision needs more attention than new topics right now.';
  } else if (remainingRatio > 0.3) {
    biggestPriority = `Finish the remaining ${remainingTopics} topics before increasing mock frequency.`;
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
  // The pace the ring reports — recomputed here so the 7-day plan is capped by
  // the same number the student sees on Home, not by their declared capacity.
  // Same helper the ring uses, fed the same per-topic coverage rows.
  const syllabusLeft = remainingSyllabusHours(coverage ?? [], studentEffortMultiplier({
    isRepeater: profile.is_repeater as boolean | null,
    lastYearPercentile: profile.last_year_percentile as number | null,
  }));
  const weekPace = profile.syllabus_target_date
    ? computeRequiredPace({
        remainingHours: syllabusLeft,
        today,
        targetDate: new Date(`${profile.syllabus_target_date as string}T00:00:00`),
        committedPerDay: (profile.study_target_hours as number | null) ?? null,
        mockHours: remainingMockHours(syllabusLeft),
      })
    : null;

  const narrative = fallbackNarrative(phase.label, weeksRemaining, weak, weakTopic, blocker);
  const source: 'ai' | 'fallback' = 'fallback';

  // Additive fields for the Blueprint Reveal hero (S1 restyle, 13 Aug) — every
  // one of these reuses a value or function this route already computed above;
  // none of it is new date/phase/mock-cadence math (see docs/CODEMAP.md's rule
  // on the exam calendar's one authority).
  const daysToExam = Math.max(0, Math.round((exam.getTime() - today.getTime()) / 86_400_000));
  const mocksPerWeekNow = mocksForWeekOf(today, exam);
  // Only worth a "bumps to N from <month>" note when the cadence is still
  // going to change — once already in the higher cadence there is nothing to
  // announce.
  const mocksPerWeekRisesTo = phaseOn(today, exam) === 'build' && mocksPerWeekNow < MOCKS_PER_WEEK.intensive
    ? MOCKS_PER_WEEK.intensive
    : null;

  return NextResponse.json({
    narrative,
    source,
    examTarget: profile.exam_target ?? null,
    attemptYear: profile.attempt_year ?? null,
    daysToExam,
    mocksPerWeekNow,
    mocksPerWeekRisesTo,
    studyTargetHoursPerDay: (profile.study_target_hours as number | null) ?? null,
    phase,
    weeksRemaining,
    weakestSection: weak,
    weakTopic,
    currentStage: stage,
    biggestBlocker: blocker,
    coverageTally,
    currentStreak: liveStreak(streak?.current_streak, streak?.last_log_date),
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
    learningCount,
    notStartedCount,
    // Pass the SAME requiredPerDay the pace ring shows, so the 7-day schedule
    // and the ring can't disagree about what a day looks like. Before this the
    // schedule filled the student's whole declared capacity (12h/day for some)
    // while the ring on the same screen said 4.5h/day was enough.
    weekPlan: buildWeekPlan(
      coverage ?? [],
      (profile.study_target_hours as number | null) ?? null,
      today,
      // The same multiplier syllabusLeft above was computed with — the week
      // schedule and the pace ring price the identical syllabus.
      studentEffortMultiplier({
        isRepeater: profile.is_repeater as boolean | null,
        lastYearPercentile: profile.last_year_percentile as number | null,
      }),
      7,
      weekPace?.requiredPerDay ?? null,
      // The same inputs Home's plan is built from, so this strip is a WINDOW on
      // the one planner rather than a lookalike of it: the weakest section it
      // leans on, the date its syllabus clock is paced against, the archetype
      // that shapes the day, and the topics the student starred themselves.
      {
        weakestSection: weak,
        daysToSyllabusTarget: targetDateIso
          ? Math.round((Date.parse(targetDateIso.slice(0, 10)) - Date.parse(today.toISOString().slice(0, 10))) / 86_400_000)
          : null,
        isWorkingProfessional: !!profile.is_working_professional,
        isRepeater: !!profile.is_repeater,
        priorityTopics: (coverage ?? [])
          .filter((r: { is_priority?: boolean | null }) => r.is_priority === true)
          .map((r: { topic: string }) => r.topic),
      },
    ),
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
