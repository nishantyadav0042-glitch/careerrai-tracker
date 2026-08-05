import { phaseForTopic, targetPhrase, type Section, type Phase } from '@/lib/routine-engine';
import type { CoverageStatus } from '@/lib/topic-selector';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { QUANT_TOPICS, VERBAL_TOPICS, LRDI_TOPICS } from '@/lib/topics-constants';
import { getLogDateString } from '@/lib/streak-utils';
import { serverError } from '@/lib/api-error';

const TOPICS_BY_SECTION: Record<string, string[]> = { VARC: VERBAL_TOPICS, DILR: LRDI_TOPICS, QA: QUANT_TOPICS };

// POST /api/routine/swap-topic { taskId, topic } — student feedback: "if I
// want to change today's topic from Geometry to Number System, I can."
// Swaps the topic on ONE of today's frozen tasks, same section only (the
// day's section balance is the plan's job; which topic within it is the
// student's right). Blocked once the task is completed. The task's label,
// target and reason are rewritten so the card reads honestly.
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { taskId?: unknown; topic?: unknown };
  const taskId = typeof body.taskId === 'string' ? body.taskId : null;
  const newTopic = typeof body.topic === 'string' ? body.topic : null;
  if (!taskId || !newTopic) return NextResponse.json({ error: 'taskId and topic required' }, { status: 400 });

  const admin = createAdminClient();
  const today = getLogDateString();

  const [{ data: routine }, { data: completions }] = await Promise.all([
    admin.from('daily_routines').select('tasks, swapped_out, phase').eq('student_id', user.id).eq('routine_date', today).maybeSingle(),
    admin.from('routine_task_completions').select('task_id').eq('student_id', user.id).eq('routine_date', today),
  ]);
  if (!routine) return NextResponse.json({ error: 'No routine for today yet.' }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = routine.tasks as any[];
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  if (!task.topic) return NextResponse.json({ error: 'This task has no topic to swap.' }, { status: 400 });
  if ((completions ?? []).some((c) => c.task_id === taskId)) {
    return NextResponse.json({ error: 'Already completed — nothing to swap.' }, { status: 400 });
  }

  const sectionTopics = TOPICS_BY_SECTION[task.section as string];
  if (!sectionTopics?.includes(newTopic)) {
    return NextResponse.json({ error: `Pick a ${task.section} topic.` }, { status: 400 });
  }
  if (newTopic === task.topic) return NextResponse.json({ ok: true, tasks });

  // Rewrite the task around the student's choice — same minutes, same slot.
  // The instruction comes from the SAME engine that generated the plan
  // (targetPhrase): unit-aware (RC = passages, DILR = sets) and phase-aware.
  // The old inline minutes/3 formula told students to solve "15 Reading
  // Comprehension questions".
  const oldTopic = task.topic as string;
  task.topic = newTopic;
  task.label = `${task.section} — ${newTopic}`;
  // Verb follows the NEW topic's own status, not the day's calendar phase —
  // swapping to a topic you already practise must not say "Learn" it.
  // Same fault as Incident #20, which shipped from the generator side.
  const { data: swapCoverage } = await admin
    .from('topic_coverage')
    .select('status')
    .eq('student_id', user.id)
    .eq('topic', newTopic)
    .maybeSingle();
  task.target = targetPhrase(
    task.section as Section, newTopic, task.estMinutes as number,
    phaseForTopic(swapCoverage?.status as CoverageStatus | null, (routine.phase as Phase) ?? 'foundation'),
  );
  task.reason = 'You picked this today — your plan, your call.';

  // Never delete, always postpone: the swapped-out topic is recorded and
  // tomorrow's generation gives it a decisive selector bonus, so a swap can
  // never quietly lose work.
  const swappedOut = Array.isArray(routine.swapped_out) ? (routine.swapped_out as string[]) : [];
  if (!swappedOut.includes(oldTopic)) swappedOut.push(oldTopic);

  const { error } = await admin
    .from('daily_routines')
    .update({ tasks, swapped_out: swappedOut })
    .eq('student_id', user.id)
    .eq('routine_date', today);
  if (error) return serverError('swap-topic', error);

  return NextResponse.json({ ok: true, tasks, note: `${oldTopic} will automatically come back tomorrow — nothing gets lost.` });
}
