import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLogDateString, VALID_SECTIONS } from '@/lib/streak-utils';
import { applyConfidenceSignal, type CoverageStatus, type ConfidenceSignal } from '@/lib/topic-selector';
import { highestStatus, normalizeStatus } from '@/lib/coverage-status';
import { planFullyDone, portionOf } from '@/lib/completion-portion';
import { creditedHours } from '@/lib/study-credit';
import { recordSacredFailure } from '@/lib/os/sacred-failure';
import { sourceForMergedDuration, isStudyDurationSource } from '@/lib/study-duration-source';

const VALID_CONFIDENCE: ConfidenceSignal[] = ['green', 'blue', 'yellow', 'red'];

interface RoutineTaskShape { id: string; section: string; topic: string | null; label: string; estMinutes: number }

// POST /api/routine/complete-task — ticks a task (toggle). When the day's
// routine is fully done (or the single Emergency-Mode task is done), this
// writes ONE daily_reports row via the SAME RPC the manual daily log already
// uses — the existing streak system increments from that, exactly as it does
// today. No second/competing streak counter.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // skip_day_close: the integrated log flow completes topics AFTER writing the
  // daily_report itself (with the student's real hours/mood), so this route
  // must NOT re-write it via the RPC (which would overwrite mood etc.). It
  // still records the completion + advances coverage.
  // close_day: the Home "Do this next" card sends this. Finishing a real
  // 45-minute block IS studying today, and the manual log already accepts a
  // single marked topic as a valid day — so requiring the WHOLE routine before
  // the streak moves held the card to a stricter bar than the log it feeds.
  // Same RPC, same merge rules; only the trigger differs.
  const { task_id: taskId, is_emergency: isEmergency, confidence, skip_day_close: skipDayClose, close_day: closeDay, portion } = (await request.json()) as { task_id?: string; is_emergency?: boolean; confidence?: string; skip_day_close?: boolean; close_day?: boolean; portion?: string };
  if (portion !== undefined && portion !== 'full' && portion !== 'half') {
    return NextResponse.json({ error: "portion must be 'full' or 'half'" }, { status: 400 });
  }
  // How much of the task got done, carried on the EXISTING confidence column
  // using the mapping LoggingModal already established (full -> green, half ->
  // blue). Deliberately no new column: the plan card does not offer a separate
  // confidence control, so there is nothing for this to collide with, and a
  // migration for a two-value flag the sheet already encodes would be adding a
  // second representation of one concept (Incident #23).
  const effectiveConfidence = confidence ?? (portion === 'half' ? 'blue' : portion === 'full' ? 'green' : undefined);
  if (!taskId || typeof taskId !== 'string') return NextResponse.json({ error: 'task_id required' }, { status: 400 });
  if (confidence !== undefined && !VALID_CONFIDENCE.includes(confidence as ConfidenceSignal)) {
    return NextResponse.json({ error: 'confidence must be green, blue, yellow, or red' }, { status: 400 });
  }

  const admin = createAdminClient();
  const today = getLogDateString();

  const { data: routine } = await admin
    .from('daily_routines')
    .select('tasks, est_minutes, generated_hours')
    .eq('student_id', user.id)
    .eq('routine_date', today)
    .maybeSingle();
  if (!routine) return NextResponse.json({ error: 'No routine generated for today yet' }, { status: 404 });

  const tasks = routine.tasks as RoutineTaskShape[];
  if (!tasks.some((t) => t.id === taskId)) {
    return NextResponse.json({ error: 'Unknown task for today\'s routine' }, { status: 400 });
  }

  // Set by either coverage-advance failure branch below (G3/J12). Declared at
  // function scope because the advance happens inside the toggle branches while
  // the response is assembled much later -- the same reach dayClosed needs.
  let coverageAdvanceFailed = false;

  // Toggle: if already complete, un-complete it (a mis-tap shouldn't be permanent).
  const { data: existingCompletion } = await admin
    .from('routine_task_completions')
    .select('id')
    .eq('student_id', user.id)
    .eq('routine_date', today)
    .eq('task_id', taskId)
    .maybeSingle();

  if (existingCompletion) {
    const { error: delErr } = await admin.from('routine_task_completions').delete().eq('id', existingCompletion.id);
    if (delErr) {
      // The tick IS the log. Reporting success on a write that did not happen
      // leaves the card green over an empty table, and the student finds out
      // days later when their streak is wrong. (Backbone audit, 13 Aug.)
      return NextResponse.json({ error: 'Could not un-mark that task — try again.' }, { status: 500 });
    }
  } else {
    const { error: insErr } = await admin.from('routine_task_completions').insert({
      student_id: user.id, routine_date: today, task_id: taskId, is_emergency: !!isEmergency,
      confidence: effectiveConfidence ?? null,
    });
    if (insErr) {
      return NextResponse.json({ error: 'Could not save that tick — try again.' }, { status: 500 });
    }

    // G3 (J12) -- a coverage advance is a derived write on top of a tick that
    // already succeeded. Both of its failure branches were console.error'd and
    // discarded, so the route could not tell the caller anything had gone
    // wrong: the student's tick was saved, the Coverage Matrix silently was
    // not, and tomorrow's Topic Selector read stale state. Surfaced the same
    // way dayClosed already surfaces the RPC's failure -- reported, never
    // repaired by pretending it worked.
    // Confidence-aware planning: a real 🟢/🟡/🔴 tap on a topic-bearing task
    // feeds straight back into the Coverage Matrix — the same table the
    // Topic Selector reads for tomorrow's choice — rather than only ever
    // being editable from a separate self-audit screen.
    const completedTask = tasks.find((t) => t.id === taskId);
    if (effectiveConfidence && completedTask?.topic) {
      const { data: coverageRow, error: readErr } = await admin
        .from('topic_coverage')
        .select('status')
        .eq('student_id', user.id)
        .eq('topic', completedTask.topic)
        .maybeSingle();

      // A FAILED READ IS NOT A BLANK ROW. This error was unchecked, so any
      // transient failure produced `coverageRow === undefined`, which the
      // line below read as "never started" — and a student's 'revising'
      // topic was rewritten to 'learning' by the act of ticking it off.
      // Losing the update is recoverable; corrupting the matrix the whole
      // planner reads is not. (Backbone audit, 13 Aug.)
      if (readErr) {
        console.error('[complete-task] coverage read failed, skipping advance', readErr.message);
        coverageAdvanceFailed = true;
      } else {
        const current = (coverageRow?.status as CoverageStatus | undefined) ?? null;
        const advanced = applyConfidenceSignal(current, effectiveConfidence as ConfidenceSignal);
        // Green/blue are ADVANCING signals and must never move a topic down.
        // applyConfidenceSignal caps them, but the floor belongs here too:
        // this is the one writer that bypasses isForwardMove, which every
        // other student-facing path honours.
        const newStatus = current ? highestStatus(normalizeStatus(current), advanced) : advanced;
        const { error: upsertErr } = await admin.from('topic_coverage').upsert(
          { student_id: user.id, section: completedTask.section, topic: completedTask.topic, status: newStatus, updated_at: new Date().toISOString() },
          { onConflict: 'student_id,section,topic' }
        );
        if (upsertErr) {
          console.error('[complete-task] coverage upsert failed', upsertErr.message);
          coverageAdvanceFailed = true;
        }
      }
    }
  }

  const { data: completions } = await admin
    .from('routine_task_completions')
    .select('task_id, is_emergency, confidence')
    .eq('student_id', user.id)
    .eq('routine_date', today);

  const completedIds = new Set((completions ?? []).map((c) => c.task_id));
  const emergencyDay = (completions ?? []).some((c) => c.is_emergency);
  // A HALF-TICK IS PARTIAL, NEVER FULLY COMPLETE (founder ruling, 18 Aug).
  // This was `tasks.every((t) => completedIds.has(t.id))` -- membership in the
  // completed set, which a "Got halfway" tap also earns. So a student who
  // marked every task halfway closed the day, advanced the streak and was told
  // "Ready for tomorrow", having just said they only got halfway. Twelve lines
  // below, creditedHours counted those same taps at 0.5. One tap, two meanings,
  // in one function.
  const fullyDone = planFullyDone(tasks.map((t) => t.id), completions ?? []);
  // Emergency Mode: completing just the single highest-priority task counts
  // as the day's minimum — distinct from full completion, never disguised as it.
  const emergencyMinimumDone = emergencyDay && completedIds.has(tasks[0].id);

  let dayClosed = false;
  if ((fullyDone || emergencyMinimumDone || closeDay === true) && completions && completions.length > 0 && !skipDayClose) {
    const completedTasks = tasks.filter((t) => completedIds.has(t.id));
    const routineMinutes = completedTasks.reduce((s, t) => s + t.estMinutes, 0);
    const routineSections = [...new Set(completedTasks.map((t) => (t.section === 'General' ? 'Revision' : t.section)))]
      .filter((s): s is string => (VALID_SECTIONS as readonly string[]).includes(s));
    const routineMockTaken = completedTasks.some((t) => /mock/i.test(t.label));

    // upsert_log_and_streak OVERWRITES study_duration/topics_covered/mock_taken/
    // notes — it has no merge semantics. The manual daily log (LoggingModal) and
    // this routine card both write through it, so if a student already logged
    // today by hand (e.g. a real mock this morning) before touching the routine
    // tonight, a blind overwrite here would erase that entry. Merge instead:
    // never let the routine's write shrink what's already recorded.
    const { data: existingLog } = await admin
      .from('daily_reports')
      .select('study_duration, study_duration_source, topics_covered, mock_taken, notes')
      .eq('student_id', user.id)
      .eq('report_date', today)
      .maybeSingle();

    // ONE hours formula for both write paths. The log sheet already prices a
    // day with creditedHours (coverage x the plan's own hours); this route used
    // to run its own rounded minutes/60, so the same day could be worth
    // different amounts depending on which surface recorded it. With a HALF
    // state now reachable from the plan card that divergence would also make
    // the number wrong — half a task credited as a whole one is the log lying
    // about time, which is what Incident #30 was about.
    const halfDone = (completions ?? []).filter((c) => portionOf(c.confidence) === 'half' && completedIds.has(c.task_id)).length;
    const fullDone = completedTasks.length - halfDone;
    const generatedHours = (routine.generated_hours as number | null) ?? routineMinutes / 60;
    const earned = creditedHours({
      generatedHours,
      plannedTasks: tasks.length,
      fullDone,
      halfDone,
      offPlanCount: 0,
    });
    // Never shrink a log the student already made by hand.
    const mergedHours = Math.max(earned, existingLog?.study_duration ?? 0);
    // STAMP THE WINNER, not the write that ran. mergedHours is a Math.max, so
    // the number that lands is not always the credited one — stamping every
    // such write 'credited' would assert that a pre-existing value was priced
    // from coverage. Where credit loses or ties, the surviving value keeps
    // whatever it already meant, including a legacy NULL.
    const existingSourceRaw = (existingLog as { study_duration_source?: unknown } | null)?.study_duration_source;
    const mergedSource = sourceForMergedDuration({
      earned,
      existing: existingLog ? Number(existingLog.study_duration) : null,
      existingSource: isStudyDurationSource(existingSourceRaw) ? existingSourceRaw : null,
    });
    const mergedSections = [...new Set([...(existingLog?.topics_covered ?? []), ...routineSections])];
    const mergedMockTaken = routineMockTaken || !!existingLog?.mock_taken;
    const mergedNotes = existingLog?.notes
      ?? (emergencyMinimumDone && !fullyDone ? 'Less time today — did the essentials.' : null);

    const rpcArgs = {
      p_student_id: user.id,
      p_report_date: today,
      p_study_duration: mergedHours,
      p_topics_covered: mergedSections,
      p_mood_emoji: '💪',
      p_mock_taken: mergedMockTaken,
      p_notes: mergedNotes,
      p_emotional_chips: [],
      p_study_duration_source: mergedSource,
    };
    let { error: rpcError } = await admin.rpc('upsert_log_and_streak', rpcArgs);
    // ONE RETRY before giving up (16 Aug — same principle as the auth-session
    // retry in src/proxy.ts): this RPC is what makes a tick count as a
    // studied day, so a one-off transient failure here must not become a
    // silent, permanent "the day never happened." The retry is idempotent
    // (upsert), so trying again cannot double-count or corrupt anything.
    if (rpcError) {
      ({ error: rpcError } = await admin.rpc('upsert_log_and_streak', rpcArgs));
    }
    dayClosed = !rpcError;
    if (rpcError) {
      // This RPC is what makes a tick count as a studied day — it writes the
      // daily_reports row AND moves the streak. Silently failing here is the
      // worst outcome on this route: the card says "Ready for tomorrow ✅"
      // while the day never happened as far as every other surface is
      // concerned. The tick itself is already saved, so we report the partial
      // truth rather than pretending either way.
      //
      // Both attempts failed — this is now the same class of failure
      // log-daily's route already reports via recordSacredFailure (Incident
      // #30: "alert me always if I face any errors"). This route wrote to the
      // exact same daily_reports/streak_data as that one but was never wired
      // into that alert, so a failure here was invisible to the one system
      // built specifically to catch it.
      console.error('[complete-task] day close failed', rpcError.message);
      void recordSacredFailure(admin, 'log_daily', user.id, rpcError);
    }
  }

  return NextResponse.json({
    completedTaskIds: [...completedIds],
    fullyDone,
    emergencyMinimumDone,
    dayClosed,
    // G3 -- reported, never repaired by pretending it worked. The tick IS
    // saved; what failed is the derived coverage write on top of it.
    coverageAdvanceFailed,
  });
}
