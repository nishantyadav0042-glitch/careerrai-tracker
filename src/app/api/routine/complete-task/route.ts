import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLogDateString, VALID_SECTIONS } from '@/lib/streak-utils';

interface RoutineTaskShape { id: string; section: string; label: string; estMinutes: number }

// POST /api/routine/complete-task — ticks a task (toggle). When the day's
// routine is fully done (or the single Emergency-Mode task is done), this
// writes ONE daily_reports row via the SAME RPC the manual daily log already
// uses — the existing streak system increments from that, exactly as it does
// today. No second/competing streak counter.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { task_id: taskId, is_emergency: isEmergency } = (await request.json()) as { task_id?: string; is_emergency?: boolean };
  if (!taskId || typeof taskId !== 'string') return NextResponse.json({ error: 'task_id required' }, { status: 400 });

  const admin = createAdminClient();
  const today = getLogDateString();

  const { data: routine } = await admin
    .from('daily_routines')
    .select('tasks, est_minutes')
    .eq('student_id', user.id)
    .eq('routine_date', today)
    .maybeSingle();
  if (!routine) return NextResponse.json({ error: 'No routine generated for today yet' }, { status: 404 });

  const tasks = routine.tasks as RoutineTaskShape[];
  if (!tasks.some((t) => t.id === taskId)) {
    return NextResponse.json({ error: 'Unknown task for today\'s routine' }, { status: 400 });
  }

  // Toggle: if already complete, un-complete it (a mis-tap shouldn't be permanent).
  const { data: existingCompletion } = await admin
    .from('routine_task_completions')
    .select('id')
    .eq('student_id', user.id)
    .eq('routine_date', today)
    .eq('task_id', taskId)
    .maybeSingle();

  if (existingCompletion) {
    await admin.from('routine_task_completions').delete().eq('id', existingCompletion.id);
  } else {
    await admin.from('routine_task_completions').insert({
      student_id: user.id, routine_date: today, task_id: taskId, is_emergency: !!isEmergency,
    });
  }

  const { data: completions } = await admin
    .from('routine_task_completions')
    .select('task_id, is_emergency')
    .eq('student_id', user.id)
    .eq('routine_date', today);

  const completedIds = new Set((completions ?? []).map((c) => c.task_id));
  const emergencyDay = (completions ?? []).some((c) => c.is_emergency);
  const fullyDone = tasks.every((t) => completedIds.has(t.id));
  // Emergency Mode: completing just the single highest-priority task counts
  // as the day's minimum — distinct from full completion, never disguised as it.
  const emergencyMinimumDone = emergencyDay && completedIds.has(tasks[0].id);

  let dayClosed = false;
  if ((fullyDone || emergencyMinimumDone) && completions && completions.length > 0) {
    const completedTasks = tasks.filter((t) => completedIds.has(t.id));
    const minutesDone = completedTasks.reduce((s, t) => s + t.estMinutes, 0);
    const sections = [...new Set(completedTasks.map((t) => (t.section === 'General' ? 'Revision' : t.section)))]
      .filter((s): s is string => (VALID_SECTIONS as readonly string[]).includes(s));
    const mockTaken = completedTasks.some((t) => /mock/i.test(t.label));

    const { error: rpcError } = await admin.rpc('upsert_log_and_streak', {
      p_student_id: user.id,
      p_report_date: today,
      p_study_duration: Math.max(1, Math.round(minutesDone / 60)),
      p_topics_covered: sections,
      p_mood_emoji: '💪',
      p_mock_taken: mockTaken,
      p_notes: emergencyMinimumDone && !fullyDone ? 'Emergency-mode minimum day' : null,
      p_emotional_chips: [],
    });
    dayClosed = !rpcError;
  }

  return NextResponse.json({
    completedTaskIds: [...completedIds],
    fullyDone,
    emergencyMinimumDone,
    dayClosed,
  });
}
