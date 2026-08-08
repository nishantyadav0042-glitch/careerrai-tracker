import { weakestFromCoverage } from '@/lib/section-weakness';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateRoutine, personalizationSummary, archetypeRevisionMultiplier, type RoutineProfile, type Section, type Stage, type Phase, type HistoryInput } from '@/lib/routine-engine';
import { pickMission, mockPendingAnalysisSignal, revisionOverdueSignal, baselineRoutineSignal, blockerBiasSignal, type Blocker } from '@/lib/mission-engine';
import { chooseTopicForSection, type TopicChoice, type CoverageStatus } from '@/lib/topic-selector';
import { computeCapacity, CAPACITY_WINDOW_DAYS } from '@/lib/capacity-engine';
import { computeAdaptation } from '@/lib/adaptation-engine';
import { assembleIntelligence, momentumProxy } from '@/lib/intelligence';
import { ROADMAP_PHASES, currentRoadmapIndex, weeksToExam } from '@/lib/study-plan';
import { TOPIC_METADATA, QUANT_TOPICS, VERBAL_TOPICS, LRDI_TOPICS, QA_GROUPS } from '@/lib/topics-constants';
import { getLogDateString } from '@/lib/streak-utils';
import { planReason } from '@/lib/plan-reason';
import { planStaleReason } from '@/lib/plan-freshness';
import { todaysTaughtTopics } from '@/lib/timetable-align';
import type { TimetableBlock } from '@/lib/timetable';
import { badDayFloorMinutes, dailyHours, hoursForDay } from '@/lib/daily-hours';

const TOPICS_BY_SECTION: Record<Section, string[]> = { VARC: VERBAL_TOPICS, DILR: LRDI_TOPICS, QA: QUANT_TOPICS };

// GET /api/routine/today — fetch (generating on first call of the day) the
// student's prescriptive routine + which tasks are already ticked, plus
// catch-up context (days since last full completion) so the client can show
// "welcome back" instead of a guilt-trip after a gap.
export async function GET() {
  // getAuthUser verifies the JWT locally (cached JWKS) — the middleware
  // already paid the network auth round-trip for this request.
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const today = getLogDateString();

  try {
  // Every read below depends only on user.id, so this is ONE concurrent
  // wave instead of the ~9 serial round-trips this route used to make —
  // the single biggest latency cut on the home screen's study card.
  const [
    { data: profile },
    { data: coverageRows },
    { data: existing },
    { data: completions },
    { data: streak },
    history,
    { daysSincePendingMock, pendingMockName },
    { data: recentReports },
    { data: timetableRow },
  ] = await Promise.all([
    admin
      .from('profiles')
      .select(`
        is_working_professional, is_repeater, target_percentile,
        hours_available, study_target_hours, weekend_hours_available, bad_day_floor_minutes, syllabus_target_date,
        self_reported_weakest_section, self_reported_strongest_section, self_reported_weak_topic,
        baseline_varc, baseline_dilr, baseline_qa, coaching_enrolled, attempt_year, current_stage, biggest_blocker, start_with, plan_source
      `)
      .eq('id', user.id)
      .single(),
    // Coverage grid — both the modern source of the weakest-section signal
    // AND what buildTopicChoices scores topics with (passed down so it
    // isn't queried twice).
    admin
      .from('topic_coverage')
      .select('section, topic, status, is_priority')
      .eq('student_id', user.id),
    admin
      .from('daily_routines')
      // created_at is needed to answer "was today's plan built BEFORE the
      // student told us about yesterday?" — see the regeneration rule below.
      .select('phase, tasks, est_minutes, calibration, generated_hours, created_at')
      .eq('student_id', user.id)
      .eq('routine_date', today)
      .maybeSingle(),
    admin
      .from('routine_task_completions')
      .select('task_id, completed_at, is_emergency')
      .eq('student_id', user.id)
      .eq('routine_date', today),
    admin
      .from('streak_data')
      .select('current_streak, last_log_date')
      .eq('student_id', user.id)
      .maybeSingle(),
    buildHistory(admin, user.id),
    buildMissionInputs(admin, user.id, today),
    // Capacity + Adaptation input: actual study hours (size the plan to what
    // this student sustains) and the plan_fit tap (learn their real pace) over
    // the recent window.
    admin
      .from('daily_reports')
      .select('study_duration, plan_fit, report_date, mock_taken, day_outcome, blocker_reason, updated_at')
      .eq('student_id', user.id)
      .gte('report_date', new Date(Date.now() - CAPACITY_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)),
    // The coaching timetable, so TODAY's class topics can lead today's plan —
    // the founder's one-line spec for this feature: "when your class teaches
    // Percentages, your plan here says Percentages too."
    admin
      .from('student_timetables')
      .select('blocks')
      .eq('student_id', user.id)
      .maybeSingle(),
  ]);
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  // Weakest-section chain: explicit self-report (legacy accounts that
  // answered the old tap) → baseline mock scores → derived from the
  // student's own declared Coverage grid (the Blueprint Builder no longer
  // asks the single-section question — the full grid answers it better).
  // Falls back to 'DILR' — the same deterministic, stated default the
  // tie-break in computeWeakestFromCoverage already uses — when nothing is
  // derivable (a true beginner: no self-report, no baselines, and an
  // honestly-empty Coverage grid). This replaced the legacy quick-setup
  // gate that used to re-interrogate exactly those students on the home
  // screen ("Which section is toughest?") even though they'd just finished
  // the mandatory Builder.
  const weakest = (profile.self_reported_weakest_section as Section | null)
    ?? computeWeakestFromBaseline(profile)
    ?? computeWeakestFromCoverage(coverageRows ?? [])
    ?? 'DILR';
  const strongest = (profile.self_reported_strongest_section as Section | null)
    ?? computeStrongestFromBaseline(profile);

  // null = never asked (the legacy quick-setup that used to collect this is
  // gone; the topic selector derives per-section topics from the Coverage
  // grid regardless, so null costs nothing).
  const weakTopicRaw = profile.self_reported_weak_topic as string | null;
  const weakTopic = weakTopicRaw ? weakTopicRaw : null;

  // null = never asked. One tap, cheap, and it fixes a real gap: phase used
  // to come from the calendar alone, so a student already mock-testing and
  // one who hasn't started got identical "foundation" framing if their
  // attempt_year matched. See getPhase()'s advance-only override.
  const currentStage = profile.current_stage as Stage | null;

  // null = never asked. Seeds the Mission Score Engine's cold-start bias —
  // see blockerBiasSignal in mission-engine.ts. Required, no skip: unlike
  // the topic tap, there's no defensible universal default for "what's
  // blocking you," so this is asked once and answered, not defaulted.
  const biggestBlocker = profile.biggest_blocker as Blocker | null;

  const targetIso = profile.syllabus_target_date as string | null;

  // Capacity is still computed — the buddy dossier and admin surfaces want to
  // know how a student's logged hours compare to their commitment. It just no
  // longer touches the plan.
  const recentStudyHours = (recentReports ?? []).map((r: { study_duration: unknown }) => Number(r.study_duration) || 0);
  const claimedHours = dailyHours(profile).weekday;
  const capacity = computeCapacity(recentStudyHours, recentStudyHours.length, claimedHours);

  // Adaptation reads the same behaviour it always did — the explicit plan_fit
  // taps and how much of the plan gets finished — but it no longer resizes
  // anything. It is an observation surfaced to coaches, not a lever on the
  // student's day. (Founder, 6 Aug: "keep their hours fixed and remove
  // volumeFactor.")
  const recentPlanFits = (recentReports ?? [])
    .map((r: { plan_fit: unknown }) => r.plan_fit)
    .filter((f: unknown): f is string => typeof f === 'string');
  const adaptation = computeAdaptation(recentPlanFits, history.completedTasks, history.plannedTasks, history.planDays);

  const routineProfile: RoutineProfile = {
    isWorkingProfessional: !!profile.is_working_professional,
    isRepeater: !!profile.is_repeater,
    targetPercentile: profile.target_percentile as number | null,
    // THE STUDENT'S OWN HOURS. Nothing else. Read through lib/daily-hours, the
    // one module that owns this number for the whole app.
    //
    // Founder, 6 Aug: "keep the daily hours same... don't change the hours on
    // your own, unless the student themselves makes the change or plans again.
    // You won't take any action yourself."
    //
    // Three layers used to sit between the student's number and their plan:
    //   · `paceHours` — what the DATE demanded (remaining syllabus ÷ days left).
    //     A tight date demanded 12 hrs/day and built a list nobody finishes.
    //   · `capBudget` — capacity shrinking that toward logged behaviour.
    //   · `volumeFactor` — and then task counts scaled ±30% on top.
    // Each was defensible; stacked, they meant the number on the ring and the
    // number in the plan were computed from different inputs and disagreed.
    //
    // Falling behind no longer changes the day. It moves the FINISH DATE, once
    // a week, with the arithmetic attached. See /api/cron/weekly-plan-reconcile.
    weekdayHours: claimedHours,
    weekendHours: dailyHours(profile).weekend,
    // Stage A: the bad-day floor sizes the day when set. Null for accounts
    // that predate it — those students keep hours-based planning, unchanged.
    floorMinutes: badDayFloorMinutes(profile as Record<string, unknown>),
    weakestSection: weakest,
    strongestSection: strongest,
    weakTopic,
    currentStage,
    coachingEnrolled: profile.coaching_enrolled as boolean | null,
    attemptYear: profile.attempt_year as number | null,
  };

  // Computed unconditionally (not just on generation) — the Mission and the
  // fresh whySummary below both need current recency/coverage data every
  // request, the same reasoning as whySummary already being recomputed
  // fresh rather than frozen at generation time. (history itself is fetched
  // in the parallel wave above.)
  const todayClassTopics = (profile.plan_source === 'coaching')
    ? todaysTaughtTopics((timetableRow?.blocks as TimetableBlock[] | null) ?? [], today)
    : [];
  const topicChoices = buildTopicChoices(coverageRows ?? [], routineProfile, history, profile.start_with as string | null, todayClassTopics);

  // The number today's plan is built to, decided ONCE here and used for both
  // generating the plan and judging whether a stored one is stale.
  const nowDay = new Date().getDay();
  const isWeekendToday = nowDay === 0 || nowDay === 6;
  const hoursToday = (isWeekendToday ? routineProfile.weekendHours : routineProfile.weekdayHours)
    ?? (isWeekendToday
      ? (routineProfile.isWorkingProfessional ? 4 : 3)
      : (routineProfile.isWorkingProfessional ? 1.5 : 2.5));

  // A routine frozen earlier today at DIFFERENT hours is stale — regenerate it,
  // but only while nothing is ticked off yet: completed work is never wiped.
  //
  // What this comparator watches matters more than it looks. It used to compare
  // a date-derived pace against a stored date-derived pace, which was correct
  // only while the plan was ALSO built from that pace. Once the plan started
  // following the student's own hours, this was watching a number that no
  // longer influenced anything — free to swing past the 0.5h threshold on a
  // day the student changed nothing, tear down their plan mid-morning and hand
  // them different topics. Now it compares the hours the stored plan was built
  // to against the hours it would be built to right now, so the ONLY thing that
  // triggers a rebuild is the student changing their own number. Which is
  // exactly the one case where a rebuild is what they asked for.
  //
  // Legacy rows have generated_hours = null and are treated as "not stale"
  // rather than force-regenerated. Staleness lives in lib/plan-freshness (pure
  // + tested) so the rule has one implementation.
  const yStrForFreshness = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10);
  const yesterdayReport = ((recentReports ?? []) as { report_date: string; updated_at?: string | null }[])
    .find((r) => r.report_date === yStrForFreshness);

  let routine = existing;
  const staleReason = existing
    ? planStaleReason({
        completionCount: (completions ?? []).length,
        routineCreatedAt: (existing.created_at as string | null) ?? null,
        generatedHours: (existing.generated_hours as number | null) ?? null,
        currentHours: hoursToday,
        yesterdayReportUpdatedAt: yesterdayReport?.updated_at ?? null,
      })
    : null;
  // 'checked_in_after_build' is the founder-approved same-day rebuild: the
  // student told us about yesterday AFTER today's plan was already generated,
  // so the plan could not have used it. Both reasons are gated inside
  // planStaleReason on nothing being ticked yet — completed work is never wiped.
  if (staleReason) routine = null;

  if (!routine) {
    const generated = generateRoutine(routineProfile, new Date(), history, topicChoices);
    const { data: inserted, error } = await admin
      .from('daily_routines')
      .upsert(
        // created_at is written EXPLICITLY, not left to the column default.
        // On the upsert's conflict path this is an UPDATE, which would keep the
        // original created_at — and then the "was the plan built before the
        // check-in?" test below would stay true forever and regenerate the plan
        // on every single request. Stamping it here is what makes that rule
        // self-terminating: one rebuild per check-in, then the plan is newer
        // than the report and the condition goes quiet.
        { student_id: user.id, routine_date: today, phase: generated.phase, tasks: generated.tasks, est_minutes: generated.estMinutes, generated_hours: hoursToday, created_at: new Date().toISOString() },
        { onConflict: 'student_id,routine_date' }
      )
      .select('phase, tasks, est_minutes, calibration, generated_hours, created_at')
      .single();
    if (error || !inserted) return NextResponse.json({ error: 'Could not generate routine' }, { status: 500 });
    routine = inserted;
  }

  // Catch-up context: days since the student last fully completed a routine day.
  const gapDays = streak?.last_log_date
    ? Math.round((Date.parse(today) - Date.parse(streak.last_log_date as string)) / 86_400_000)
    : null;

  // Recomputed fresh each request (cheap, pure) rather than stored on the row —
  // it's the "how did you plan this" answer, and should reflect the student's
  // CURRENT setup (and Coverage Matrix / revision state) even if today's task
  // list was already frozen. hoursToday was decided above, before generation.
  const weak = routineProfile.weakestSection ?? 'DILR';
  const whySummary = personalizationSummary(routineProfile, isWeekendToday, hoursToday, topicChoices[weak].topic);

  // Today's Mission — a small, explainable scoring layer (same additive
  // pattern as buddy-match.ts's rankBuddies) on top of data that already
  // exists. Deliberately not a rewrite of the routine itself: this can
  // outrank the default weakest-section task (e.g. a mock sitting unanalyzed
  // for 2 days) without needing a new event-sourcing pipeline underneath it.
  // Revision frequency is the ACTUAL topic the selector chose (which may
  // differ from the raw self-report once Coverage Matrix data matters), and
  // is adjusted by the same archetype multiplier the selector itself used —
  // a repeater's topic is flagged overdue sooner, a working professional's later.
  const weakTopicChosen = topicChoices[weak].topic;
  const revisionMultiplier = archetypeRevisionMultiplier(routineProfile);
  const weakRevisionFrequency = TOPIC_METADATA[weakTopicChosen]
    ? TOPIC_METADATA[weakTopicChosen].revisionFrequencyDays * revisionMultiplier
    : undefined;
  const mission = pickMission([
    {
      id: 'mock-analysis',
      label: pendingMockName ? `Analyze ${pendingMockName}` : 'Analyze your last mock',
      signals: [mockPendingAnalysisSignal(daysSincePendingMock), blockerBiasSignal(biggestBlocker, 'mock-analysis')],
    },
    {
      id: 'weak-revision',
      label: `Revise ${weak}`,
      signals: [revisionOverdueSignal(weak, history.daysSinceLastPracticed[weak], weakRevisionFrequency), blockerBiasSignal(biggestBlocker, 'weak-revision')],
    },
    {
      id: 'routine-baseline',
      label: "Today's routine",
      signals: [baselineRoutineSignal(), blockerBiasSignal(biggestBlocker, 'routine-baseline')],
    },
  ]);

  // Your CAT Roadmap — the first visible piece of the Study Plan Generator
  // design (see docs/product-vision-notes.md). Anchored to weeks REMAINING
  // to the exam (attempt_year always known), then advanced — never
  // regressed — by the same current_stage signal that already overrides
  // getPhase(). Purely presentational for now: it does not change what
  // tasks get generated, only where the student sees themselves on the
  // 5-phase canonical strategy.
  const weeksRemaining = weeksToExam(new Date(), routineProfile.attemptYear);
  const roadmap = {
    weeksRemaining,
    currentIndex: currentRoadmapIndex(weeksRemaining, routineProfile.currentStage),
    phases: ROADMAP_PHASES,
  };

  // Intelligence layer (LIS 2 + 5 + 10): the Constraint profile (biggest
  // bottleneck), the Performance heartbeat (Learning Velocity + direction), and
  // — composed from both — the Coaching Decision: the single highest-leverage
  // call for today that frames the plan below it. All from data already
  // fetched; purely additive to the response (does not reshape the task list).
  const activeDays21 = recentStudyHours.filter((h: number) => h > 0).length;
  const tenAgoStr = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
  const twentyAgoStr = new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10);
  let recentActive10 = 0, priorActive10 = 0;
  for (const r of (recentReports ?? []) as { study_duration: unknown; report_date: string }[]) {
    if ((Number(r.study_duration) || 0) <= 0) continue;
    if (r.report_date > tenAgoStr) recentActive10++;
    else if (r.report_date > twentyAgoStr) priorActive10++;
  }
  const covRows = (coverageRows ?? []) as { status: string }[];
  const coverage = covRows.length > 0
    ? {
        total: covRows.length,
        notStarted: covRows.filter((r) => r.status === 'not_started').length,
        confident: covRows.filter((r) => r.status === 'exam_ready' || r.status === 'mastered').length,
      }
    : null;
  const recencyVals = Object.values(history.daysSinceLastPracticed).filter((v): v is number => v != null);
  const maxDaysSincePracticed = recencyVals.length ? Math.max(...recencyVals) : null;
  const mocksTaken = ((recentReports ?? []) as { mock_taken: unknown }[]).filter((r) => r.mock_taken === true).length;
  const baselines = [profile.baseline_varc, profile.baseline_dilr, profile.baseline_qa]
    .map((v) => v as number | null)
    .filter((v): v is number => v != null);
  const weakestBaseline = baselines.length ? Math.min(...baselines) : null;
  const capacityGapHours = capacity.claimedHours != null && capacity.sustainableHours != null
    ? Math.max(0, Math.round((capacity.claimedHours - capacity.sustainableHours) * 2) / 2)
    : 0;

  const intelligence = assembleIntelligence({
    phase: routine.phase as Phase,
    loggedDays: recentStudyHours.length,
    activeDays21,
    recentActive10,
    priorActive10,
    capacityTrust: capacity.trust,
    capacityGapHours,
    completionRatio: adaptation.completionRatio,
    tooMuchRatio: adaptation.tooMuchRatio,
    momentumScore: momentumProxy(gapDays, activeDays21),
    coverage,
    maxDaysSincePracticed,
    daysSincePendingMock,
    mocksTaken,
    weakestBaseline,
    blocker: biggestBlocker,
    targetPercentile: routineProfile.targetPercentile,
    weeksToExam: weeksRemaining,
    gapDays,
  });

  // Task copy ("Solve 5 RC questions") barely changes day to day even
  // though the topic's coverage status genuinely advances underneath it —
  // the engine adapts, but that's invisible unless it's said out loud. Coverage
  // status is looked up fresh here (never baked into the stored routine,
  // which is frozen once per day) so a status tap made after the routine
  // generated still shows up immediately, same as whySummary above.
  const coverageByTopic = new Map<string, CoverageStatus>();
  for (const row of (coverageRows ?? [])) coverageByTopic.set(row.topic, row.status as CoverageStatus);
  // Same guard as buildHistory — never trust a stored routine's tasks column
  // to be a well-formed array.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasksWithStatus = (Array.isArray(routine.tasks) ? (routine.tasks as any[]) : []).map((t) => ({
    ...t,
    coverageStatus: t.topic ? coverageByTopic.get(t.topic) ?? null : null,
    // Memory tag — "Last done Nd ago" / "First time" / "Nth revision".
    // Reads the same 14-routine lookback whySummary/mission already use, so
    // "first time" means first time within that window, not literally ever —
    // same honest scoping as the rest of this file's recency signals.
    lastTouchedDaysAgo: t.topic ? history.daysSinceLastPracticedByTopic[t.topic] ?? null : null,
    timesPracticed: t.topic ? history.timesPracticedByTopic[t.topic] ?? 0 : 0,
  }));

  // The because-line: the single specific, TRUE reason today looks the way it
  // does. Null when no specific claim is true — the card then falls back to
  // its generic narration. Yesterday's check-in comes from the same reports
  // window the capacity engine already fetched.
  const yStr = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10);
  const yReport = ((recentReports ?? []) as { report_date: string; day_outcome?: string | null; blocker_reason?: string | null }[])
    .find((r) => r.report_date === yStr);
  const because = planReason({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    todayTasks: (tasksWithStatus as any[]).map((t) => ({ topic: (t.topic as string | null) ?? null })),
    yesterday: history.yesterday,
    yesterdayUnfinishedTopics: history.yesterdayUnfinishedTopics,
    postponedTopics: history.postponedTopics,
    dayOutcome: (yReport?.day_outcome as 'studied' | 'partial' | 'not_studied' | 'skipped' | null) ?? null,
    blockerReason: yReport?.blocker_reason ?? null,
  });

  // The number the plan was built to, and WHY it is that number.
  //
  // "Bhaiya 11 hr ka plan bnwayi hu aur sirf 4 hr ka task milta hai?" — a real
  // student, 6 Aug. She was right to ask: we sized her day down (correctly)
  // and never said so. A plan that silently disagrees with what the student
  // asked for reads as a broken app, not as coaching.
  const claimedForToday = hoursForDay(profile, isWeekendToday);
  // Always equal to what the student set now, so `trimmed` is permanently
  // false. The field stays so the client keeps rendering the hours badge — and
  // so anything that starts silently resizing a day again shows up here.
  const todayBudget = {
    hours: Math.round(hoursToday * 2) / 2,
    claimedHours: claimedForToday,
    trimmed: false,
    reason: null as string | null,
  };

  return NextResponse.json({
    routine: { ...routine, tasks: tasksWithStatus },
    todayBudget,
    because,
    whySummary,
    mission,
    roadmap,
    completions: completions ?? [],
    currentStreak: streak?.current_streak ?? 0,
    isCatchUp: gapDays != null && gapDays >= 2,
    yesterday: history.yesterday,
    // Adaptation is now a READING, not a change: "your days are running heavy"
    // is information the student can act on. Nothing was resized behind it.
    adaptation: adaptation.trust === 'learning'
      ? { reading: adaptation.reading, note: adaptation.note }
      : null,
    // Coaching Decision (LIS L5) — the one call framing today; Performance
    // heartbeat + the ranked bottlenecks behind it.
    decision: intelligence.decision,
    performance: intelligence.performance,
    constraints: intelligence.constraints.ranked,
  });
  } catch (err) {
    // Observability: Vercel's log drain is not configured, so a thrown error
    // here was INVISIBLE (Vedprakash's blank plan). Persist it where we can
    // SELECT it, and return the message so the card can show it.
    const msg = err instanceof Error ? `${err.message}` : String(err);
    const stack = err instanceof Error ? (err.stack ?? '').slice(0, 1500) : null;
    try {
      await admin.from('security_events').insert({
        event_type: 'api_error', severity: 'error',
        metadata: { route: 'routine/today', user: user.id, msg, stack },
      });
    } catch { /* never mask the original error */ }
    return NextResponse.json({ error: `Plan engine error: ${msg}` }, { status: 500 });
  }
}

// Weakest section from the student's own declared Coverage grid: the
// section with the most ground left to cover, weighting untouched topics
// double vs in-progress ones. Ratio-based (not raw count) so VARC's 5
// topics and DILR's 4 compare fairly. Ties break DILR → QA → VARC (DILR is
// the most commonly feared CAT section — a deterministic, stated default,
// not a guess about this student). Null when nothing is declared at all.
// The rule itself lives in section-weakness.ts — one implementation for the
// route, the cron companion, and anything else that asks the question.
const computeWeakestFromCoverage = weakestFromCoverage;

function computeWeakestFromBaseline(p: { baseline_varc: unknown; baseline_dilr: unknown; baseline_qa: unknown }): Section | null {
  const scores = [
    { s: 'VARC' as const, v: p.baseline_varc as number | null },
    { s: 'DILR' as const, v: p.baseline_dilr as number | null },
    { s: 'QA' as const, v: p.baseline_qa as number | null },
  ].filter((x): x is { s: Section; v: number } => x.v != null);
  if (scores.length < 2) return null;
  return scores.reduce((a, b) => (b.v < a.v ? b : a)).s;
}

function computeStrongestFromBaseline(p: { baseline_varc: unknown; baseline_dilr: unknown; baseline_qa: unknown }): Section | null {
  const scores = [
    { s: 'VARC' as const, v: p.baseline_varc as number | null },
    { s: 'DILR' as const, v: p.baseline_dilr as number | null },
    { s: 'QA' as const, v: p.baseline_qa as number | null },
  ].filter((x): x is { s: Section; v: number } => x.v != null);
  if (scores.length < 2) return null;
  return scores.reduce((a, b) => (b.v > a.v ? b : a)).s;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildHistory(admin: any, studentId: string): Promise<HistoryInput & { daysSinceLastPracticedByTopic: Record<string, number | null>; timesPracticedByTopic: Record<string, number>; postponedTopics: string[]; yesterday: { total: number; done: number } | null; yesterdayUnfinishedTopics: string[]; completedTasks: number; plannedTasks: number; planDays: number }> {
  const [{ data: pastRoutines }, { data: pastCompletions }] = await Promise.all([
    admin
      .from('daily_routines')
      .select('routine_date, tasks, swapped_out')
      .eq('student_id', studentId)
      .order('routine_date', { ascending: false })
      .limit(14),
    admin
      .from('routine_task_completions')
      .select('routine_date, task_id')
      .eq('student_id', studentId)
      .order('routine_date', { ascending: false })
      .limit(200),
  ]);

  const completedByDate = new Map<string, Set<string>>();
  for (const c of pastCompletions ?? []) {
    if (!completedByDate.has(c.routine_date)) completedByDate.set(c.routine_date, new Set());
    completedByDate.get(c.routine_date)!.add(c.task_id);
  }

  // Topics swapped OUT of the most recent past day — "never delete, always
  // postpone": these get a decisive bonus today so nothing is ever lost.
  const today = getLogDateString();
  const lastPastDay = (pastRoutines ?? []).find((r: { routine_date: string }) => r.routine_date < today);
  const postponedTopics: string[] = Array.isArray(lastPastDay?.swapped_out)
    ? (lastPastDay.swapped_out as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];
  // Yesterday's score — powers the "1 of 3 done -> today's plan already
  // adjusted" narration that makes the daily auto-adjustment VISIBLE.
  const yesterday = lastPastDay
    ? {
        total: Array.isArray(lastPastDay.tasks) ? (lastPastDay.tasks as unknown[]).length : 0,
        done: (completedByDate.get(lastPastDay.routine_date) ?? new Set()).size,
      }
    : null;
  // Topic names on yesterday's plan whose task never got completed — the raw
  // material of the because-line ("Geometry first — it didn't get finished
  // yesterday"). Legacy rows without a topic field simply don't contribute,
  // the same honest scoping as the recency signals below.
  const yesterdayDoneIds = lastPastDay ? (completedByDate.get(lastPastDay.routine_date) ?? new Set()) : new Set();
  const yesterdayUnfinishedTopics: string[] = lastPastDay && Array.isArray(lastPastDay.tasks)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (lastPastDay.tasks as any[])
        .filter((t) => t && typeof t.topic === 'string' && t.topic.length > 0 && !yesterdayDoneIds.has(t.id))
        .map((t) => t.topic as string)
    : [];

  const daysSince: Record<Section, number | null> = { VARC: null, DILR: null, QA: null };
  // Per-topic recency, keyed by topic name — only populated going forward,
  // since it reads the `topic` field routine-engine.ts now stores on every
  // task (older rows generated before this shipped won't have it, and
  // simply won't match here, which is the correct honest behavior for data
  // that didn't exist yet).
  const daysSinceByTopic: Record<string, number | null> = {};
  const timesPracticedByTopic: Record<string, number> = {};
  // Adaptation Engine fuel: how much of each past day's plan the student
  // actually finished. Today is excluded (still in progress); completions are
  // capped at the day's task count so a regenerated routine can't push the
  // ratio above 100%.
  let completedTasks = 0, plannedTasks = 0, planDays = 0;
  for (const r of (pastRoutines ?? [])) {
    const completedTaskIds = completedByDate.get(r.routine_date) ?? new Set();
    const taskCount = Array.isArray(r.tasks) ? (r.tasks as unknown[]).length : 0;
    if (r.routine_date < today && taskCount > 0) {
      planDays++;
      plannedTasks += taskCount;
      completedTasks += Math.min(taskCount, completedTaskIds.size);
    }
    // Guard against legacy/corrupt rows where tasks is null or not an array
    // (bug audit, 14 July) — an unguarded for-of here throws, rejecting the
    // top-level Promise.all and 500ing the ENTIRE plan for any student with
    // even one such row: the same failure class as the earlier TDZ crash.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (Array.isArray(r.tasks) ? (r.tasks as any[]) : [])) {
      if (!completedTaskIds.has(t.id)) continue;
      const section = t.section as Section;
      const daysAgo = Math.round((Date.parse(today) - Date.parse(r.routine_date)) / 86_400_000);
      if (['VARC', 'DILR', 'QA'].includes(section) && daysSince[section] == null) {
        daysSince[section] = daysAgo;
      }
      const topic = t.topic as string | null | undefined;
      if (topic) {
        if (daysSinceByTopic[topic] == null) daysSinceByTopic[topic] = daysAgo;
        timesPracticedByTopic[topic] = (timesPracticedByTopic[topic] ?? 0) + 1;
      }
    }
  }
  return { daysSinceLastPracticed: daysSince, daysSinceLastPracticedByTopic: daysSinceByTopic, timesPracticedByTopic, postponedTopics, yesterday, yesterdayUnfinishedTopics, completedTasks, plannedTasks, planDays };
}

// The Topic Selector's DB-facing wiring: fetches Coverage Matrix status for
// this student, then picks one topic per section using chooseTopicForSection
// (topic-selector.ts) — Coverage Matrix + prerequisites + weightage +
// revision-due + (weak section only) the self-reported bonus. This is what
// replaced the old behavior where the two non-weakest sections used the
// exact same static topic for every student in the product.
function buildTopicChoices(coverageRows: { topic: string; status: string; is_priority?: boolean | null }[], profile: RoutineProfile, history: HistoryInput & { daysSinceLastPracticedByTopic: Record<string, number | null>; postponedTopics: string[] }, startWith?: string | null, todayClassTopics: string[] = []): Record<Section, TopicChoice> {
  const coverageByTopic = new Map<string, CoverageStatus>();
  const prioritySet = new Set<string>();
  for (const row of coverageRows) {
    coverageByTopic.set(row.topic, row.status as CoverageStatus);
    if (row.is_priority === true) prioritySet.add(row.topic);
  }

  // "Start my preparation with <cluster>" → every topic in that QA cluster
  // gets the focus bonus. Null/unknown = "Let CareerRai decide" (no bias).
  const focusUnits = new Set<string>(
    startWith ? (QA_GROUPS.find((g) => g.label === startWith)?.units ?? []) : []
  );
  const postponed = new Set(history.postponedTopics);
  const todayClass = new Set(todayClassTopics);

  const revisionMultiplier = archetypeRevisionMultiplier(profile);
  // Revision season: from 1 September of the exam year, overdue revision of
  // high-weightage topics outranks starting new material (topic-selector.ts).
  const seasonYear = profile.attemptYear ?? new Date().getFullYear();
  const revisionSeason = new Date() >= new Date(seasonYear, 8, 1);
  const sections: Section[] = ['VARC', 'DILR', 'QA'];
  const result = {} as Record<Section, TopicChoice>;

  for (const section of sections) {
    const isWeakSection = section === profile.weakestSection;
    const candidates = TOPICS_BY_SECTION[section].map((topic) => ({
      topic,
      coverageStatus: coverageByTopic.get(topic) ?? null,
      daysSinceLastPracticed: history.daysSinceLastPracticedByTopic[topic] ?? null,
      selfReportedBonus: isWeakSection && topic === profile.weakTopic,
      priorityBonus: prioritySet.has(topic),
      focusBonus: focusUnits.has(topic),
      postponedBonus: postponed.has(topic),
      todayClassBonus: todayClass.has(topic),
    }));
    result[section] = chooseTopicForSection(candidates, revisionMultiplier, revisionSeason);
  }
  return result;
}

// "Mock pending analysis" — a mock was logged (daily_reports.mock_taken)
// but no matching mock_debriefs row exists for that date yet. Mirrors the
// same taken_on/log_date correlation the mock-debrief route itself writes
// (unique on student_id, log_date), so this stays consistent with how a
// debrief is actually recorded rather than inventing a second definition.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildMissionInputs(admin: any, studentId: string, today: string): Promise<{ daysSincePendingMock: number | null; pendingMockName: string | null }> {
  const [{ data: recentReports }, { data: recentDebriefs }] = await Promise.all([
    admin
      .from('daily_reports')
      .select('report_date, mock_taken, mock_name')
      .eq('student_id', studentId)
      .order('report_date', { ascending: false })
      .limit(14),
    admin
      .from('mock_debriefs')
      .select('taken_on')
      .eq('student_id', studentId)
      .order('taken_on', { ascending: false })
      .limit(5),
  ]);

  const debriefDates = new Set((recentDebriefs ?? []).map((d: { taken_on: string }) => d.taken_on));
  const lastMockReport = (recentReports ?? []).find((r: { mock_taken: boolean | null }) => r.mock_taken);
  if (!lastMockReport || debriefDates.has(lastMockReport.report_date)) {
    return { daysSincePendingMock: null, pendingMockName: null };
  }
  return {
    daysSincePendingMock: Math.round((Date.parse(today) - Date.parse(lastMockReport.report_date)) / 86_400_000),
    pendingMockName: (lastMockReport.mock_name as string | null) ?? null,
  };
}
