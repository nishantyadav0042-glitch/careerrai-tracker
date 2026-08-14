import { weakestFromCoverage } from '@/lib/section-weakness';
import { mockInformedFocus, type DebriefRow } from '@/lib/mock-informed-focus';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateRoutine, personalizationSummary, archetypeRevisionMultiplier, getPhase, type RoutineProfile, type Section, type Stage, type Phase, type HistoryInput } from '@/lib/routine-engine';
import { buildDayPlan } from '@/lib/plan-day';
import { pickMission, mockPendingAnalysisSignal, revisionOverdueSignal, baselineRoutineSignal, blockerBiasSignal, type Blocker } from '@/lib/mission-engine';
import { type CoverageStatus } from '@/lib/topic-selector';
import { buildTopicChoices } from '@/lib/day-topics';
import { plannerRecency } from '@/lib/plan-history';
import { computeCapacity, CAPACITY_WINDOW_DAYS } from '@/lib/capacity-engine';
import { computeAdaptation } from '@/lib/adaptation-engine';
import { assembleIntelligence, momentumProxy } from '@/lib/intelligence';
import { ROADMAP_PHASES, currentRoadmapIndex, weeksToExam } from '@/lib/study-plan';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { getLogDateString } from '@/lib/streak-utils';
import { planReason } from '@/lib/plan-reason';
import { planStaleReason } from '@/lib/plan-freshness';
import { coachingTopicsForDate } from '@/lib/timetable-month';
import type { TimetableBlock } from '@/lib/timetable';
import { dailyHours, hoursForDay } from '@/lib/daily-hours';

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
    { data: recentDebriefRows },
  ] = await Promise.all([
    admin
      .from('profiles')
      .select(`
        is_working_professional, is_repeater, target_percentile,
        hours_available, study_target_hours, weekend_hours_available, syllabus_target_date,
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
      .select('blocks, confirmed_at')
      .eq('student_id', user.id)
      .maybeSingle(),
    // Real mock results, newest first — the strongest evidence we hold about
    // where a student actually loses marks. Five rows is plenty: the focus
    // rule only ever reads back to the latest COMPLETE one.
    admin
      .from('mock_debriefs')
      .select('taken_on, varc, dilr, qa')
      .eq('student_id', user.id)
      .order('taken_on', { ascending: false })
      .limit(5),
  ]);
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  // Weakest-section chain: MEASURED mock performance (founder, 13 Aug:
  // "mock score performance is significantly important" — a recent,
  // complete, decisive debrief outranks everything, because evidence beats
  // memory) → explicit self-report (legacy accounts that answered the old
  // tap) → baseline mock scores → derived from the student's own declared
  // Coverage grid (the Blueprint Builder no longer asks the single-section
  // question — the full grid answers it better).
  // Falls back to 'DILR' — the same deterministic, stated default the
  // tie-break in computeWeakestFromCoverage already uses — when nothing is
  // derivable (a true beginner: no self-report, no baselines, and an
  // honestly-empty Coverage grid). This replaced the legacy quick-setup
  // gate that used to re-interrogate exactly those students on the home
  // screen ("Which section is toughest?") even though they'd just finished
  // the mandatory Builder.
  // The override is never silent: focusBasis rides the response so the plan
  // says "Your last mock (VARC 89 · DILR 99 · QA 99) — VARC needs the work"
  // instead of quietly contradicting what the student typed at signup.
  // ── ONE DAY-BUILDER (lib/plan-day) ──────────────────────────────────────
  //
  // Focus, hours, the profile mapping, today's class topics, target pacing,
  // the timetable fork and the engine call all live in ONE function that the
  // notification cron also uses. Sharing the individual helpers was not
  // enough: the ASSEMBLY was written twice, and that is exactly where the
  // two-writer bug lived — the cron's focus chain silently had no mock branch
  // for weeks while every part it called was already "shared".
  // Signals the RESPONSE needs that are not plan inputs — the Mission engine,
  // the capacity reading and the adaptation note all render alongside the plan
  // without ever sizing it.
  const biggestBlocker = profile.biggest_blocker as Blocker | null;
  const claimedHours = dailyHours(profile).weekday;
  const recentStudyHours = (recentReports ?? []).map((r: { study_duration: unknown }) => Number(r.study_duration) || 0);
  const capacity = computeCapacity(recentStudyHours, recentStudyHours.length, claimedHours);

  const recentPlanFits = (recentReports ?? [])
    .map((r: { plan_fit: unknown }) => r.plan_fit)
    .filter((f: unknown): f is string => typeof f === 'string');

  const plan = buildDayPlan({
    profile,
    coverageRows: (coverageRows ?? []) as { section: string; topic: string; status: string; is_priority?: boolean | null }[],
    debriefRows: (recentDebriefRows ?? []) as DebriefRow[],
    timetableRow: timetableRow ?? null,
    history,
    today,
    now: new Date(),
  });
  const { routineProfile, focus, hoursToday, todayClassTopics, daysToTarget: daysToSyllabusTarget } = plan;
  const weakest = focus.weakest;
  const strongest = focus.strongest;
  const adaptation = computeAdaptation(recentPlanFits, history.completedTasks, history.plannedTasks, history.planDays);

  // Weekend-ness comes from the STUDY DAY, not a server-local weekday — the
  // same rule plan-day uses to size the day, so the copy can never describe a
  // different day than the one that was built.
  const isWeekendToday = (() => {
    const dow = new Date(today + 'T00:00:00Z').getUTCDay();
    return dow === 0 || dow === 6;
  })();

  // The lead topic of the weak section, read from the plan that was actually
  // built rather than recomputed from the selector — one source, so the "why"
  // line can never name a topic the student was not given.
  const weakLeadTopic = plan.tasks.find((t) => t.section === weakest && t.topic)?.topic
    ?? plan.tasks.find((t) => t.topic)?.topic
    ?? null;

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
    // ── ONE PLAN PER STUDENT (founder, 14 Aug) ────────────────────────────
    //
    // "If someone uploads their timetable it must be implemented then and
    // there, and the timetable built through the coverage matrix should
    // become dead instantly."
    //
    // When the sheet speaks for today, it IS the day — its blocks, its
    // topics, its own minutes. generateRoutine is not consulted at all, so
    // the coverage matrix cannot append a block the coaching never assigned.
    // That appended block was the real bug: Vedashri's 13 Aug sheet planned
    // three sessions (7h) and the app served four (8h), the fourth invented,
    // because the day was sized from her profile and only then filled.
    //
    // Silence still falls back. A date the sheet says nothing about — a rest
    // day, or past the end of the month it covers — returns null here and the
    // engine plans as usual. An empty screen is not a plan.
    const generated = { phase: plan.phase, tasks: plan.tasks, estMinutes: plan.estMinutes };
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
  const whySummary = personalizationSummary(routineProfile, isWeekendToday, hoursToday, weakLeadTopic ?? '');

  // Today's Mission — a small, explainable scoring layer (same additive
  // pattern as buddy-match.ts's rankBuddies) on top of data that already
  // exists. Deliberately not a rewrite of the routine itself: this can
  // outrank the default weakest-section task (e.g. a mock sitting unanalyzed
  // for 2 days) without needing a new event-sourcing pipeline underneath it.
  // Revision frequency is the ACTUAL topic the selector chose (which may
  // differ from the raw self-report once Coverage Matrix data matters), and
  // is adjusted by the same archetype multiplier the selector itself used —
  // a repeater's topic is flagged overdue sooner, a working professional's later.
  const weakTopicChosen = weakLeadTopic ?? '';
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

  // Proof the mock landed. Founder, 13 Aug, after filling the score sheet:
  // "my mock score is getting recorded nowhere — for sure." It WAS recorded
  // (mock_debriefs row, correct percentiles) — but nothing on the screen he
  // filled it from ever said so, and a save the student cannot see is
  // indistinguishable from a save that failed. The card uses this to turn
  // the mock task's button into the recorded score.
  const { data: todayDebrief } = await admin
    .from('mock_debriefs')
    .select('overall_percentile')
    .eq('student_id', user.id)
    .eq('log_date', today)
    .maybeSingle();

  return NextResponse.json({
    routine: { ...routine, tasks: tasksWithStatus },
    // Why the plan's focus is what it is, when a mock decided it. The card
    // renders this over the task list — the payoff loop for entering a
    // score: mock in, plan visibly moves.
    // Suppressed on the day the mock was entered: today's routine froze at
    // generation time, BEFORE that score existed, and this line may only
    // ever render when it is true of the plan on screen (the plan-reason
    // rule). From tomorrow's build onward the mock has actually steered it.
    // The same-day suppression now lives in the resolver, so both writers
    // agree about when a mock may be claimed as the reason.
    focusBasis: focus.mockBasis,
    todayMock: todayDebrief
      ? { overallPercentile: todayDebrief.overall_percentile != null ? Number(todayDebrief.overall_percentile) : null }
      : null,
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
async function buildHistory(admin: any, studentId: string): Promise<HistoryInput & { daysSinceLastPracticedByTopic: Record<string, number | null>; daysSincePlannedByTopic: Record<string, number | null>; timesPracticedByTopic: Record<string, number>; postponedTopics: string[]; yesterday: { total: number; done: number } | null; yesterdayUnfinishedTopics: string[]; completedTasks: number; plannedTasks: number; planDays: number }> {
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
  // postpone" — come from plannerRecency below, with the rest of the planner's
  // memory. lastPastDay is still needed here for yesterday's score.
  const today = getLogDateString();
  const lastPastDay = (pastRoutines ?? []).find((r: { routine_date: string }) => r.routine_date < today);
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

  // The three PLANNER signals come from the ONE implementation (plan-history),
  // so this route, the 6am cron and the Whole Plan are fed identically. What
  // stays here is the fuel nothing else needs: per-SECTION recency for the
  // Mission Engine, practice counts, and the Adaptation Engine's completion
  // ratio.
  const recency = plannerRecency(pastRoutines ?? [], pastCompletions ?? [], today);

  const daysSince: Record<Section, number | null> = { VARC: null, DILR: null, QA: null };
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
      if (topic) timesPracticedByTopic[topic] = (timesPracticedByTopic[topic] ?? 0) + 1;
    }
  }
  return { daysSinceLastPracticed: daysSince, ...recency, timesPracticedByTopic, yesterday, yesterdayUnfinishedTopics, completedTasks, plannedTasks, planDays };
}

// The Topic Selector's DB-facing wiring: fetches Coverage Matrix status for
// this student, then picks one topic per section using chooseTopicForSection
// (topic-selector.ts) — Coverage Matrix + prerequisites + weightage +
// revision-due + (weak section only) the self-reported bonus. This is what
// replaced the old behavior where the two non-weakest sections used the
// exact same static topic for every student in the product.
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
