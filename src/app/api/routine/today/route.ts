import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateRoutine, type RoutineProfile, type Section, type HistoryInput } from '@/lib/routine-engine';
import { getLogDateString } from '@/lib/streak-utils';

// GET /api/routine/today — fetch (generating on first call of the day) the
// student's prescriptive routine + which tasks are already ticked, plus
// catch-up context (days since last full completion) so the client can show
// "welcome back" instead of a guilt-trip after a gap.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const today = getLogDateString();

  const { data: profile } = await admin
    .from('profiles')
    .select(`
      is_working_professional, is_repeater, target_percentile,
      hours_available, study_target_hours, weekend_hours_available,
      self_reported_weakest_section, self_reported_strongest_section,
      baseline_varc, baseline_dilr, baseline_qa, coaching_enrolled, attempt_year
    `)
    .eq('id', user.id)
    .single();
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  // Explicit self-report wins (fast onboarding tap); baseline scores are the
  // fallback for students who filled the diagnostic but skipped the tap.
  const weakest = (profile.self_reported_weakest_section as Section | null)
    ?? computeWeakestFromBaseline(profile);
  const strongest = (profile.self_reported_strongest_section as Section | null)
    ?? computeStrongestFromBaseline(profile);

  const routineProfile: RoutineProfile = {
    isWorkingProfessional: !!profile.is_working_professional,
    isRepeater: !!profile.is_repeater,
    targetPercentile: profile.target_percentile as number | null,
    weekdayHours: (profile.study_target_hours ?? profile.hours_available) as number | null,
    weekendHours: profile.weekend_hours_available as number | null,
    weakestSection: weakest,
    strongestSection: strongest,
    coachingEnrolled: profile.coaching_enrolled as boolean | null,
    attemptYear: profile.attempt_year as number | null,
  };

  // Existing routine for today?
  const { data: existing } = await admin
    .from('daily_routines')
    .select('phase, tasks, est_minutes')
    .eq('student_id', user.id)
    .eq('routine_date', today)
    .maybeSingle();

  // Minimum-friction onboarding: weakest section drives ~40% of the day's time
  // budget, so it's the one thing worth a single explicit tap rather than a
  // guessed default. Don't generate (and don't burn today's one-shot slot on
  // a guess) until the student has answered it — everything else has a
  // reasonable silent fallback and is never worth blocking on.
  if (!existing && weakest == null) {
    return NextResponse.json({
      needsSetup: true,
      needsWeekendHours: profile.weekend_hours_available == null,
    });
  }

  let routine = existing;
  if (!routine) {
    const history = await buildHistory(admin, user.id);
    const generated = generateRoutine(routineProfile, new Date(), history);
    const { data: inserted, error } = await admin
      .from('daily_routines')
      .upsert(
        { student_id: user.id, routine_date: today, phase: generated.phase, tasks: generated.tasks, est_minutes: generated.estMinutes },
        { onConflict: 'student_id,routine_date' }
      )
      .select('phase, tasks, est_minutes')
      .single();
    if (error || !inserted) return NextResponse.json({ error: 'Could not generate routine' }, { status: 500 });
    routine = inserted;
  }

  const { data: completions } = await admin
    .from('routine_task_completions')
    .select('task_id, completed_at, is_emergency')
    .eq('student_id', user.id)
    .eq('routine_date', today);

  // Catch-up context: days since the student last fully completed a routine day.
  const { data: streak } = await admin
    .from('streak_data')
    .select('current_streak, last_log_date')
    .eq('student_id', user.id)
    .maybeSingle();
  const gapDays = streak?.last_log_date
    ? Math.round((Date.parse(today) - Date.parse(streak.last_log_date as string)) / 86_400_000)
    : null;

  return NextResponse.json({
    routine,
    completions: completions ?? [],
    currentStreak: streak?.current_streak ?? 0,
    isCatchUp: gapDays != null && gapDays >= 2,
  });
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
async function buildHistory(admin: any, studentId: string): Promise<HistoryInput> {
  const { data: pastRoutines } = await admin
    .from('daily_routines')
    .select('routine_date, tasks')
    .eq('student_id', studentId)
    .order('routine_date', { ascending: false })
    .limit(14);
  const { data: pastCompletions } = await admin
    .from('routine_task_completions')
    .select('routine_date, task_id')
    .eq('student_id', studentId)
    .order('routine_date', { ascending: false })
    .limit(200);

  const completedByDate = new Map<string, Set<string>>();
  for (const c of pastCompletions ?? []) {
    if (!completedByDate.has(c.routine_date)) completedByDate.set(c.routine_date, new Set());
    completedByDate.get(c.routine_date)!.add(c.task_id);
  }

  const daysSince: Record<Section, number | null> = { VARC: null, DILR: null, QA: null };
  const today = getLogDateString();
  for (const r of (pastRoutines ?? [])) {
    const completedTaskIds = completedByDate.get(r.routine_date) ?? new Set();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (r.tasks as any[])) {
      if (!completedTaskIds.has(t.id)) continue;
      const section = t.section as Section;
      if (!['VARC', 'DILR', 'QA'].includes(section)) continue;
      if (daysSince[section] != null) continue; // already found the most recent
      daysSince[section] = Math.round((Date.parse(today) - Date.parse(r.routine_date)) / 86_400_000);
    }
  }
  return { daysSinceLastPracticed: daysSince };
}
