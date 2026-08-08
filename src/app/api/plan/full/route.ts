import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildFullPlan, feasibilityLine } from '@/lib/full-plan';
import { studentEffortMultiplier } from '@/lib/study-pace';
import { dailyHours } from '@/lib/daily-hours';
import { computeTopicMemory, buildCompletionRecords } from '@/lib/prep-memory-data';
import { PLAN_WINDOW_DAYS } from '@/lib/timetable-month';

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
  const [{ data: profile }, { data: coverageRows }, completionRecords, { data: timetable }] =
    await Promise.all([
      admin.from('profiles')
        .select('is_repeater, is_working_professional, last_year_percentile, study_target_hours, hours_available, weekend_hours_available, attempt_year, plan_source, full_name')
        .eq('id', user.id).maybeSingle(),
      admin.from('topic_coverage').select('topic, status, updated_at').eq('student_id', user.id),
      buildCompletionRecords(admin, user.id, '2000-01-01'),
      admin.from('student_timetables').select('confirmed_at').eq('student_id', user.id).maybeSingle(),
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

  const plan = buildFullPlan({
    coverage: (coverageRows ?? []).map((r: { topic: string; status: string | null }) => ({ topic: r.topic, status: r.status })),
    effort: studentEffortMultiplier({
      isRepeater: profile.is_repeater as boolean | null,
      lastYearPercentile: profile.last_year_percentile as number | null,
    }),
    weekdayHours: dailyHours(profile).weekday,
    today: new Date(),
    attemptYear: profile.attempt_year as number | null,
    revisionDue,
    horizonDays,
  });

  return NextResponse.json({
    ...plan,
    verdict: feasibilityLine(plan.feasibility),
    planSource: profile.plan_source ?? 'careerrai',
    // Coaching students are told WHY their view stops where it does, rather
    // than being shown a plan that quietly ends.
    horizonReason: horizonDays != null ? 'coaching_month' : 'exam_day',
  });
}
