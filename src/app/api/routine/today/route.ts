import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateRoutine, personalizationSummary, archetypeRevisionMultiplier, type RoutineProfile, type Section, type Stage, type HistoryInput } from '@/lib/routine-engine';
import { pickMission, mockPendingAnalysisSignal, revisionOverdueSignal, baselineRoutineSignal, blockerBiasSignal, type Blocker } from '@/lib/mission-engine';
import { chooseTopicForSection, type TopicChoice, type CoverageStatus } from '@/lib/topic-selector';
import { remainingSyllabusHours, remainingMockHours } from '@/lib/study-pace';
import { ROADMAP_PHASES, currentRoadmapIndex, weeksToExam } from '@/lib/study-plan';
import { TOPIC_METADATA, QUANT_TOPICS, VERBAL_TOPICS, LRDI_TOPICS, QA_GROUPS } from '@/lib/topics-constants';
import { getLogDateString } from '@/lib/streak-utils';

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
  ] = await Promise.all([
    admin
      .from('profiles')
      .select(`
        is_working_professional, is_repeater, target_percentile,
        hours_available, study_target_hours, weekend_hours_available, syllabus_target_date,
        self_reported_weakest_section, self_reported_strongest_section, self_reported_weak_topic,
        baseline_varc, baseline_dilr, baseline_qa, coaching_enrolled, attempt_year, current_stage, biggest_blocker, start_with
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
      .select('phase, tasks, est_minutes, calibration')
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

  // ONE source of truth for "how big is today": the same pace math as the
  // Home ring. When a target date exists, hours/day = remaining syllabus
  // hours ÷ days left — so rescheduling the date instantly resizes today's
  // plan too, and the ring's number and the plan below it can never disagree
  // (founder: a 6h ring above a 3.5h plan reads as a bogus plan).
  const targetIso = profile.syllabus_target_date as string | null;
  let paceHours: number | null = null;
  if (targetIso) {
    const daysLeft = Math.max(1, Math.ceil((new Date(targetIso + 'T00:00:00').getTime() - Date.now()) / 86_400_000));
    const remaining = remainingSyllabusHours(coverageRows ?? []);
    // Syllabus + the mock budget (a full mock ≈ 4h incl. analysis) — the daily
    // plan itself contains mock/sectional tasks, so the pace must fund them.
    if (remaining > 0) paceHours = Math.min(12, Math.max(1, Math.round(((remaining + remainingMockHours(remaining)) / daysLeft) * 2) / 2));
  }

  const routineProfile: RoutineProfile = {
    isWorkingProfessional: !!profile.is_working_professional,
    isRepeater: !!profile.is_repeater,
    targetPercentile: profile.target_percentile as number | null,
    weekdayHours: paceHours ?? ((profile.study_target_hours ?? profile.hours_available) as number | null),
    weekendHours: paceHours ?? (profile.weekend_hours_available as number | null),
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
  const topicChoices = buildTopicChoices(coverageRows ?? [], routineProfile, history, profile.start_with as string | null);

  // A routine frozen earlier today at DIFFERENT hours (the student just
  // rescheduled their target) is stale — regenerate it, but only while
  // nothing is ticked off yet: completed work is never wiped by a resize.
  let routine = existing;
  if (routine && (completions ?? []).length === 0 && paceHours != null) {
    const expectedMinutes = Math.round(paceHours * 60);
    if (Math.abs((routine.est_minutes as number) - expectedMinutes) > 45) routine = null;
  }
  if (!routine) {
    const generated = generateRoutine(routineProfile, new Date(), history, topicChoices);
    const { data: inserted, error } = await admin
      .from('daily_routines')
      .upsert(
        { student_id: user.id, routine_date: today, phase: generated.phase, tasks: generated.tasks, est_minutes: generated.estMinutes },
        { onConflict: 'student_id,routine_date' }
      )
      .select('phase, tasks, est_minutes, calibration')
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
  // list was already frozen.
  const nowDay = new Date().getDay();
  const isWeekendToday = nowDay === 0 || nowDay === 6;
  const hoursToday = (isWeekendToday ? routineProfile.weekendHours : routineProfile.weekdayHours)
    ?? (isWeekendToday
      ? (routineProfile.isWorkingProfessional ? 4 : 3)
      : (routineProfile.isWorkingProfessional ? 1.5 : 2.5));
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

  // Task copy ("Solve 5 RC questions") barely changes day to day even
  // though the topic's coverage status genuinely advances underneath it —
  // the engine adapts, but that's invisible unless it's said out loud. Coverage
  // status is looked up fresh here (never baked into the stored routine,
  // which is frozen once per day) so a status tap made after the routine
  // generated still shows up immediately, same as whySummary above.
  const coverageByTopic = new Map<string, CoverageStatus>();
  for (const row of (coverageRows ?? [])) coverageByTopic.set(row.topic, row.status as CoverageStatus);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasksWithStatus = (routine.tasks as any[]).map((t) => ({
    ...t,
    coverageStatus: t.topic ? coverageByTopic.get(t.topic) ?? null : null,
    // Memory tag — "Last done Nd ago" / "First time" / "Nth revision".
    // Reads the same 14-routine lookback whySummary/mission already use, so
    // "first time" means first time within that window, not literally ever —
    // same honest scoping as the rest of this file's recency signals.
    lastTouchedDaysAgo: t.topic ? history.daysSinceLastPracticedByTopic[t.topic] ?? null : null,
    timesPracticed: t.topic ? history.timesPracticedByTopic[t.topic] ?? 0 : 0,
  }));

  return NextResponse.json({
    routine: { ...routine, tasks: tasksWithStatus },
    whySummary,
    mission,
    roadmap,
    completions: completions ?? [],
    currentStreak: streak?.current_streak ?? 0,
    isCatchUp: gapDays != null && gapDays >= 2,
    yesterday: history.yesterday,
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
function computeWeakestFromCoverage(rows: { section: string; status: string }[]): Section | null {
  if (rows.length === 0) return null;
  const tieOrder: Section[] = ['DILR', 'QA', 'VARC'];
  let best: { s: Section; score: number } | null = null;
  for (const s of tieOrder) {
    const sectionRows = rows.filter((r) => r.section === s);
    if (sectionRows.length === 0) continue;
    const gap = sectionRows.reduce((sum, r) => sum + (r.status === 'not_started' ? 2 : r.status === 'learning' ? 1 : 0), 0);
    const score = gap / sectionRows.length;
    if (best == null || score > best.score) best = { s, score };
  }
  return best?.s ?? null;
}

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
async function buildHistory(admin: any, studentId: string): Promise<HistoryInput & { daysSinceLastPracticedByTopic: Record<string, number | null>; timesPracticedByTopic: Record<string, number>; postponedTopics: string[]; yesterday: { total: number; done: number } | null }> {
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

  const daysSince: Record<Section, number | null> = { VARC: null, DILR: null, QA: null };
  // Per-topic recency, keyed by topic name — only populated going forward,
  // since it reads the `topic` field routine-engine.ts now stores on every
  // task (older rows generated before this shipped won't have it, and
  // simply won't match here, which is the correct honest behavior for data
  // that didn't exist yet).
  const daysSinceByTopic: Record<string, number | null> = {};
  const timesPracticedByTopic: Record<string, number> = {};
  const today = getLogDateString();
  for (const r of (pastRoutines ?? [])) {
    const completedTaskIds = completedByDate.get(r.routine_date) ?? new Set();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (r.tasks as any[])) {
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
  return { daysSinceLastPracticed: daysSince, daysSinceLastPracticedByTopic: daysSinceByTopic, timesPracticedByTopic, postponedTopics, yesterday };
}

// The Topic Selector's DB-facing wiring: fetches Coverage Matrix status for
// this student, then picks one topic per section using chooseTopicForSection
// (topic-selector.ts) — Coverage Matrix + prerequisites + weightage +
// revision-due + (weak section only) the self-reported bonus. This is what
// replaced the old behavior where the two non-weakest sections used the
// exact same static topic for every student in the product.
function buildTopicChoices(coverageRows: { topic: string; status: string; is_priority?: boolean | null }[], profile: RoutineProfile, history: HistoryInput & { daysSinceLastPracticedByTopic: Record<string, number | null>; postponedTopics: string[] }, startWith?: string | null): Record<Section, TopicChoice> {
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

  const revisionMultiplier = archetypeRevisionMultiplier(profile);
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
    }));
    result[section] = chooseTopicForSection(candidates, revisionMultiplier);
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
