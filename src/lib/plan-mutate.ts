// ── Editing today's plan without losing an edit ─────────────────────────────
//
// Two routes change a plan that already exists — add-block and busy-day.
// (swap-topic was a third until the founder removed the feature on 14 Aug,
// which deleted a whole class of plan mutation rather than guarding it.)
// Both did the same unsafe thing: read the JSONB task array,
// change it in memory, and write the whole array back filtered only by
// (student_id, routine_date). Nothing detects that the row moved in between.
//
// So two overlapping edits silently lose one. Tap "one more block" while a
// busy-day is still in flight and either the postponement or the block simply
// is not there, with no error on screen and nothing in the logs. add-block also
// derived est_minutes from its own stale read, so the row's stated minutes
// could drift out of agreement with the tasks it actually holds — which the
// integrity gate then reports as a corrupt plan, with no trace of how it got
// that way.
//
// This is narrow (it needs two writes inside one round trip) but it is a
// genuine "one student's plan is wrong" failure, and the founder's standard
// has no room for those.
//
// The fix is a compare-and-swap on a version counter, not a lock. The writer
// says which version it read; the UPDATE matches on it; a write that lost the
// race changes zero rows, and we retry against fresh state rather than
// overwrite. Retrying is safe because the mutator re-runs from the row it just
// re-read — it never replays a decision made against stale data.
//
// Deliberately NOT a transaction or an advisory lock: these are single-row
// edits behind PostgREST, retries are cheap, and a lock held across an HTTP
// round trip is how a slow client becomes everyone's outage.

/** The shape a mutator sees and returns. `null` = nothing to change. */
export interface PlanRow {
  tasks: unknown[];
  est_minutes: number;
  swapped_out: unknown;
  version: number;
}

export interface PlanPatch {
  tasks?: unknown[];
  est_minutes?: number;
  swapped_out?: unknown;
}

export type MutateResult<T> =
  | { ok: true; value: T; patch: PlanPatch }
  | { ok: false; status: number; error: string };

/** How many times a losing writer re-reads and tries again. */
export const MAX_PLAN_MUTATE_ATTEMPTS = 4;

/**
 * Read → decide → conditionally write, retried on conflict.
 *
 * `mutate` receives the CURRENT row every attempt and returns the patch to
 * apply plus whatever the caller wants back. It must be pure with respect to
 * the row it is handed — no decisions carried over from a previous attempt —
 * because it will be re-run verbatim against fresher state.
 */
export async function mutatePlanTasks<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  studentId: string,
  routineDate: string,
  mutate: (row: PlanRow) => MutateResult<T>,
): Promise<{ ok: true; value: T } | { ok: false; status: number; error: string }> {
  for (let attempt = 0; attempt < MAX_PLAN_MUTATE_ATTEMPTS; attempt++) {
    const { data: row, error: readErr } = await admin
      .from('daily_routines')
      .select('tasks, est_minutes, swapped_out, version')
      .eq('student_id', studentId)
      .eq('routine_date', routineDate)
      .maybeSingle();

    // A read failure is never treated as "no plan" — that mistake already cost
    // this codebase a coverage regression (Incident: complete-task rewrote
    // 'revising' down to 'learning' on a transient error).
    if (readErr) return { ok: false, status: 500, error: 'Could not read your plan — try again.' };
    if (!row) return { ok: false, status: 404, error: 'No routine for today yet.' };

    const current: PlanRow = {
      tasks: Array.isArray(row.tasks) ? row.tasks : [],
      est_minutes: Number(row.est_minutes) || 0,
      swapped_out: row.swapped_out,
      version: Number(row.version) || 0,
    };

    const decided = mutate(current);
    if (!decided.ok) return decided;

    const { data: updated, error: writeErr } = await admin
      .from('daily_routines')
      .update({ ...decided.patch, version: current.version + 1 })
      .eq('student_id', studentId)
      .eq('routine_date', routineDate)
      .eq('version', current.version)
      .select('version');

    if (writeErr) return { ok: false, status: 500, error: 'Could not save that — try again.' };
    // Zero rows means someone else wrote first. Re-read and decide again.
    if (Array.isArray(updated) && updated.length > 0) return { ok: true, value: decided.value };
  }

  // Losing four times in a row is not contention, it is a client hammering the
  // endpoint. Say so plainly rather than looping.
  return { ok: false, status: 409, error: 'Your plan was being updated — try that once more.' };
}
