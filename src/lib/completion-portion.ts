// ── THE portion a stored completion carries ─────────────────────────────────
//
// ONE authority for what a `routine_task_completions` row means, in the same
// spirit as coverage-status.ts: the moment a second file re-spells `'blue'`,
// the two copies drift and a third meaning appears. This repo has paid for
// that failure on the coverage ladder twice.
//
// Founder ruling, 18 Aug: **a half-tick is PARTIAL, never fully complete.**
//
// The plan card offers three states — not-marked / half / done — and labels
// the middle one "Got halfway". Before this module the tap was read three
// different ways, four lines apart in one function: hours counted it 0.5
// (correct), the coverage ladder advanced it one rung capped at `practicing`
// (correct), and day closure counted it FULLY DONE (wrong, undocumented, and
// contradicting the label the student reads).
//
// THE HISTORICAL RULE — stated here, not only in a commit message:
//
//   A completion with `confidence = null` PREDATES the portion control. All 29
//   such rows in production are 12–15 Jul; the first green tick is 13 Jul.
//   When they were written the UI had no half option, so "ticked" meant
//   "done". They are FULL. They are not silently upgraded into a semantic they
//   never carried, and this is why `portionOf(null)` is `'full'` rather than
//   `'unknown'` — the provenance is known, and it is known to be full.
//
// NOT ruled here, and deliberately unchanged: `yellow` and `red` mark a
// COMPLETED task the student found hard. They keep counting as done. Ruling
// them would be the opportunistic cleanup the gate forbids.
//
// This module is a LEAF: it imports nothing, so anything may import it.

/** The confidence value the plan card and the log sheet both write for "Got halfway". */
export const HALF_TICK_SIGNAL = 'blue' as const;

export type CompletionPortion = 'full' | 'half';

/** How much of the task the stored row says was done. */
export function portionOf(confidence: string | null | undefined): CompletionPortion {
  return confidence === HALF_TICK_SIGNAL ? 'half' : 'full';
}

/**
 * May this completion count toward "the whole day is done"?
 *
 * Half may not. Everything else may — which preserves all 248 existing
 * production rows exactly, because none of them is a half.
 */
export function countsAsFullyDone(confidence: string | null | undefined): boolean {
  return portionOf(confidence) === 'full';
}

// ── The wire shape (P0-2.1) ─────────────────────────────────────────────────
//
// The server knowing a tick is partial is worth nothing if the client is handed
// a bare "done". `/api/routine/today` used to select `task_id, completed_at,
// is_emergency` and never `confidence`, so both consumers collapsed every
// completion into one done-set and rendered a half-tick as fully done.
//
// The route maps through THIS function rather than reading `confidence` and
// deciding for itself, and the raw signal never crosses the wire: a copy of the
// meaning on the client is a second place for it to drift, which is the
// eleven-coverage-producers failure one layer out.

export interface CompletionRow {
  task_id: string;
  is_emergency?: boolean | null;
  confidence?: string | null;
}

export interface ClientCompletion {
  task_id: string;
  is_emergency: boolean;
  portion: CompletionPortion;
}

export function toClientCompletions(rows: CompletionRow[]): ClientCompletion[] {
  return rows.map((r) => ({
    task_id: r.task_id,
    is_emergency: !!r.is_emergency,
    portion: portionOf(r.confidence),
  }));
}
