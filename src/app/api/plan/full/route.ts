import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildFullPlan, feasibilityLine } from '@/lib/full-plan';
import { studentEffortMultiplier } from '@/lib/study-pace';
import { dailyHours } from '@/lib/daily-hours';
import { computeTopicMemory, buildCompletionRecords } from '@/lib/prep-memory-data';
import { PLAN_WINDOW_DAYS, anchorToMonth } from '@/lib/timetable-month';
import { checkPlanIntegrity } from '@/lib/plan-integrity';
import type { TimetableBlock } from '@/lib/timetable';
import { resolveFocusSections } from '@/lib/focus-sections';
import type { DebriefRow } from '@/lib/mock-informed-focus';
import { plannerRecency } from '@/lib/plan-history';
import { getLogDateString } from '@/lib/streak-utils';
import type { Stage } from '@/lib/routine-engine';

// GET /api/plan/full — the student's whole plan.
//
// Founder, 8 Aug: every student, coaching or not, should be able to open the
// app and see the entire plan — "I want to check what my next fifteen days
// look like." So this is deliberately NOT gated on plan_source. What differs is
// the horizon: a self-prep student's plan runs to CAT day, a coaching
// student's runs to the end of the month they uploaded, because past that we
// genuinely do not know what their class will teach and inventing it would be
// the confident-and-wrong failure this whole feature exists to avoid.

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const [{ data: profile }, { data: coverageRows }, completionRecords, { data: timetable }, { data: pastRoutines }, { data: pastCompletions }, { data: debriefRows }] =
    await Promise.all([
      admin.from('profiles')
        .select('is_repeater, is_working_professional, last_year_percentile, study_target_hours, hours_available, weekend_hours_available, attempt_year, current_stage, plan_source, full_name, self_reported_weakest_section, self_reported_strongest_section, baseline_varc, baseline_dilr, baseline_qa, syllabus_target_date')
        .eq('id', user.id).maybeSingle(),
      admin.from('topic_coverage').select('section, topic, status, updated_at, is_priority').eq('student_id', user.id),
      buildCompletionRecords(admin, user.id, '2000-01-01'),
      admin.from('student_timetables').select('confirmed_at, blocks').eq('student_id', user.id).maybeSingle(),
      // The planner's memory — the same window Home reads, so the Whole Plan's
      // day 0 is Home's today and not a lookalike of it.
      admin.from('daily_routines').select('routine_date, tasks, swapped_out')
        .eq('student_id', user.id).order('routine_date', { ascending: false }).limit(14),
      admin.from('routine_task_completions').select('routine_date, task_id')
        .eq('student_id', user.id).order('routine_date', { ascending: false }).limit(200),
      // The Whole Plan must lean the SAME way as Home, which means it needs
      // the same evidence Home has — see the weakestSection note below.
      admin.from('mock_debriefs').select('taken_on, varc, dilr, qa')
        .eq('student_id', user.id).order('taken_on', { ascending: false }).limit(5),
    ]);
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const archetype = {
    isRepeater: !!profile.is_repeater,
    isWorkingProfessional: !!profile.is_working_professional,
  };
  // The revision queue is READ from the engine that already computes it
  // (prep-memory's revisionOverdue, per-topic cadence scaled per archetype).
  // Recomputing it here with a second rule is how two surfaces start
  // disagreeing about what is due.
  const topicMemory = await computeTopicMemory(admin, user.id, archetype, {
    completionRecords,
    coverageRows: coverageRows ?? [],
  });
  const revisionDue = topicMemory
    .filter((t) => t.revisionOverdue)
    .sort((a, b) => (b.lastTouchedDaysAgo ?? 0) - (a.lastTouchedDaysAgo ?? 0))
    .map((t) => t.topic);

  // A coaching student's horizon is the month they gave us, counted from the
  // day they uploaded — not from today, or a sheet uploaded three weeks ago
  // would appear to stretch another full month into the future.
  let horizonDays: number | null = null;
  if (profile.plan_source === 'coaching' && timetable?.confirmed_at) {
    const started = Date.parse(String(timetable.confirmed_at).slice(0, 10) + 'T00:00:00Z');
    const elapsed = Math.floor((Date.now() - started) / 86_400_000);
    horizonDays = Math.max(1, PLAN_WINDOW_DAYS - elapsed);
  }

  // The coaching calendar is resolved BEFORE the plan is built, because the
  // plan has to be built AROUND it.
  //
  // This used to be computed after buildFullPlan and handed only to the
  // integrity checker — so the plan was laid out from our own ordering and then
  // graded against the student's sheet. That is a check designed to fail, and
  // it failed for every coaching student: "20 topics are not on the date your
  // coaching teaches them", on the very screen the founder built so a student
  // could hold their photo next to our plan and see them agree.
  let coachingByDate: Record<string, string[]> | undefined;
  if (profile.plan_source === 'coaching' && timetable?.blocks && timetable?.confirmed_at) {
    const cal = anchorToMonth(
      (timetable.blocks as TimetableBlock[] | null) ?? [],
      String(timetable.confirmed_at).slice(0, 10),
    );
    coachingByDate = {};
    for (const d of cal) if (d.topics.length) coachingByDate[d.date] = d.topics;
  }

  // ── Today is a FACT (12 Aug) ────────────────────────────────────────────
  //
  // Once the 6am cron persists today's routine, that row IS today — Home
  // renders it, the student is studying it. This route used to recompute day 0
  // from scratch AND feed that very row back into the planner's memory as
  // "planned 0 days ago" — so the whole plan punished its own topics and
  // re-rolled the day the student was already holding (Abhishek's Wednesday,
  // three surfaces, three answers). Now: day 0 = the persisted row, the memory
  // sees only days BEFORE today, and the projection advances from the fact.
  const todayIso = getLogDateString();
  const todayRow = (pastRoutines ?? []).find((r) => r.routine_date === todayIso);
  const todayPlan = Array.isArray(todayRow?.tasks)
    ? (todayRow!.tasks as { topic?: string | null; estMinutes?: number }[])
        .filter((t) => typeof t.topic === 'string' && t.topic)
        .map((t) => ({ topic: t.topic as string, hours: Math.round(((t.estMinutes ?? 0) / 60) * 10) / 10 }))
    : null;
  const historyRows = (pastRoutines ?? []).filter((r) => r.routine_date < todayIso);

  const plan = buildFullPlan({
    coverage: (coverageRows ?? []).map((r: { topic: string; status: string | null }) => ({ topic: r.topic, status: r.status })),
    effort: studentEffortMultiplier({
      isRepeater: profile.is_repeater as boolean | null,
      lastYearPercentile: profile.last_year_percentile as number | null,
    }),
    weekdayHours: dailyHours(profile).weekday,
    today: new Date(),
    attemptYear: profile.attempt_year as number | null,
    // The phase FLOORS, so the long view runs the same phase rule as Home.
    // Without these the projection used the bare calendar season and a
    // repeater in July was 'intensive' on Home and 'build' here — a different
    // day shape for the same student on the same date.
    isRepeater: !!profile.is_repeater,
    currentStage: (profile.current_stage as Stage | null) ?? null,
    revisionDue,
    horizonDays,
    coachingByDate,
    // The two signals that make this the SAME plan Home builds, not a
    // lookalike: the date the syllabus clock is paced against, and the topics
    // the student starred themselves. Without them the Whole Plan would run the
    // one authority on different inputs — a subtler version of the same bug.
    daysToSyllabusTarget: profile.syllabus_target_date
      ? Math.round((Date.parse(String(profile.syllabus_target_date).slice(0, 10)) - Date.parse(new Date().toISOString().slice(0, 10))) / 86_400_000)
      : null,
    priorityTopics: (coverageRows ?? [])
      .filter((r: { is_priority?: boolean | null }) => r.is_priority === true)
      .map((r: { topic: string }) => r.topic),
    ...plannerRecency(historyRows, pastCompletions ?? [], todayIso),
    todayPlan,
    // THE SAME weakest section the daily plan leans on — now literally, via
    // the one shared resolver, not a hand-rolled lookalike.
    //
    // This used to be a three-link chain (self-report -> coverage -> DILR)
    // with NO mock branch and no baseline branch, under a comment claiming it
    // matched the daily plan. It did not. A student whose latest mock says
    // VARC got a VARC-led Home and a DILR-led Whole Plan, on the same screen
    // session — the exact two-writer bug that lib/focus-sections was created
    // to kill, still alive one surface out because the guard tests only
    // covered the two daily_routines writers.
    weakestSection: resolveFocusSections(
      profile,
      (coverageRows ?? []) as { section: string; status: string }[],
      (debriefRows ?? []) as DebriefRow[],
      todayIso,
    ).weakest,
  });

  const integrity = checkPlanIntegrity({
    plan,
    committedHours: dailyHours(profile).weekday,
    coachingByDate,
    isCoachingMonth: horizonDays != null,
  });

  return NextResponse.json({
    ...plan,
    integrity,
    verdict: feasibilityLine(plan.feasibility),
    planSource: profile.plan_source ?? 'careerrai',
    // Coaching students are told WHY their view stops where it does, rather
    // than being shown a plan that quietly ends.
    horizonReason: horizonDays != null ? 'coaching_month' : 'exam_day',
  });
}
