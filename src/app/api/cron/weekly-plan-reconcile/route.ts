import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { sendNotification } from '@/lib/notifications';
import { resolveCatExamDate } from '@/lib/routine-engine';
import { reconcileWeek } from '@/lib/plan-extension';

export const dynamic = 'force-dynamic';

// The weekly reckoning. Sunday evening, IST.
//
// Founder, 6 Aug: "you can extend the syllabus completion date and inform the
// student with a warning, and the warning should be weekly not daily."
//
// This is the ONLY place the app ever changes something on a student's behalf,
// and it changes exactly one thing: the finish date. Their hours are untouched
// and their routine is untouched. Miss the week, the date moves; make the
// week, nothing happens and they never hear from this job at all.
//
// Runs once a week on purpose. The old behaviour put a red banner in front of
// a nine-day-streak student every single morning, which is nagging dressed as
// coaching. Once a week, with the arithmetic, is a coach.

const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Monday..Sunday of the week that just ended, in IST. */
function lastWeekIST(now: Date): { start: string; end: string; days: string[] } {
  const istNow = new Date(now.getTime() + 5.5 * 3_600_000);
  // getUTCDay on the shifted clock gives the IST weekday. Sunday = 0.
  const dow = istNow.getUTCDay();
  // Sunday is the day we run, so the week that just ended is Mon..today.
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(Date.parse(iso(istNow) + 'T00:00:00Z') - daysSinceMonday * DAY_MS);
  const days = Array.from({ length: 7 }, (_, i) => iso(new Date(monday.getTime() + i * DAY_MS)));
  return { start: days[0], end: days[6], days };
}

export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();
  const week = lastWeekIST(now);

  const { data: students, error } = await admin
    .from('profiles')
    .select('id, full_name, study_target_hours, weekend_hours_available, syllabus_target_date, attempt_year, created_at')
    .eq('role', 'student')
    .not('is_demo', 'is', true)  // test accounts stay IN: this cron IS the student experience (founder tests as a student); demo accounts are shared logins and stay out
    .not('syllabus_target_date', 'is', null);

  if (error) {
    console.error('[weekly-reconcile]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (students ?? []).map((s) => s.id);
  if (ids.length === 0) return NextResponse.json({ ok: true, examined: 0, extended: 0 });

  const { data: reports } = await admin
    .from('daily_reports')
    .select('student_id, report_date, study_duration')
    .in('student_id', ids)
    .gte('report_date', week.start)
    .lte('report_date', week.end);

  const hoursByStudentDay = new Map<string, number>();
  for (const r of reports ?? []) {
    hoursByStudentDay.set(`${r.student_id}|${r.report_date}`, Number(r.study_duration ?? 0));
  }

  const isWeekendByDay = week.days.map((d) => {
    const dow = new Date(Date.parse(d + 'T00:00:00Z')).getUTCDay();
    return dow === 0 || dow === 6;
  });

  let extended = 0;
  let warned = 0;
  const results: { studentId: string; daysAdded: number; newDate: string }[] = [];

  for (const s of students ?? []) {
    const weekdayHours = Number(s.study_target_hours ?? 0);
    if (!weekdayHours || weekdayHours <= 0) continue; // nothing was ever committed to

    const result = reconcileWeek({
      weekdayHours,
      weekendHours: s.weekend_hours_available as number | null,
      loggedHoursByDay: week.days.map((d) => hoursByStudentDay.get(`${s.id}|${d}`) ?? 0),
      isWeekendByDay,
      currentTargetDate: s.syllabus_target_date as string,
      examDate: iso(resolveCatExamDate(now, s.attempt_year as number | null)),
      // Never blame a student for days before they joined. Three students who
      // signed up mid-week would otherwise have been told, in their first week,
      // that they had missed four days and lost a week off their date.
      joinedOn: s.created_at ? String(s.created_at).slice(0, 10) : null,
      daysInWeek: week.days,
    });

    // They kept up. Say nothing — the best version of this job is invisible.
    if (!result.warning) continue;

    // Record BEFORE mutating: the unique index on (student, week) is what makes
    // a re-run safe. If this insert conflicts, the week was already handled and
    // the date must not move a second time.
    const { error: logError } = await admin.from('plan_extensions').insert({
      student_id: s.id,
      week_start: week.start,
      week_end: week.end,
      expected_hours: result.expectedHours,
      actual_hours: result.actualHours,
      deficit_hours: result.deficitHours,
      days_added: result.daysAdded,
      previous_date: result.previousDate,
      new_date: result.newDate,
      hit_exam_wall: result.hitExamWall,
    });
    if (logError) {
      // 23505 = already reconciled this week. Any other error means we could
      // not record it, and an unrecorded date change is one the student cannot
      // check — so we skip rather than move it silently.
      if (logError.code !== '23505') {
        console.error('[weekly-reconcile] could not record', s.id, logError.message);
      }
      continue;
    }

    if (result.daysAdded > 0) {
      const { error: updError } = await admin
        .from('profiles')
        .update({ syllabus_target_date: result.newDate })
        .eq('id', s.id);
      if (updError) {
        console.error('[weekly-reconcile] date update failed', s.id, updError.message);
      } else {
        extended++;
      }
    }

    await sendNotification({
      userId: s.id,
      type: 'plan_extended',
      title: result.hitExamWall ? 'Your date cannot move again' : 'Your finish date has moved',
      body: result.warning,
      channels: ['in_app', 'push'],
      data: { url: '/student/tracker', newDate: result.newDate, daysAdded: result.daysAdded },
    }).catch((e) => console.error('[weekly-reconcile] notify failed', s.id, String(e)));

    warned++;
    results.push({ studentId: s.id, daysAdded: result.daysAdded, newDate: result.newDate });
  }

  return NextResponse.json({
    ok: true,
    week: { start: week.start, end: week.end },
    examined: students?.length ?? 0,
    extended,
    warned,
    results,
  });
}

export { POST as GET };
