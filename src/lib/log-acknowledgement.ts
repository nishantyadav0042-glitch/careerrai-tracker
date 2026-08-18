// ── What the student is told must match what was committed ──────────────────
//
// P0-1. Found by the 0C.3F.1 provenance audit (attack H6) and confirmed
// against the route: `log-daily` rate-limits a resubmission within 15 seconds
// and answers HTTP 429. No caller special-cases it, so the full sheet shows
// "Too many requests" and check-in-gate shows "Couldn't save that. Check your
// connection and try again." — both while the log is SAFELY SAVED.
//
// A student who believes their log was lost resubmits, and is rate-limited
// again. That is not a metric defect; it attacks trust at the one moment the
// product is asking to be trusted.
//
// This module answers one question, purely: **is the incoming payload already
// what is stored?** If it is, the honest acknowledgement is success — the state
// the student asked for is the state that exists. If it is not, the request is
// a genuine edit that the rate limit declined, and the honest acknowledgement
// says so: the log is saved, this change was not applied.
//
// Deliberately NOT changed: the rate limit still blocks the write. This fixes
// what the student is told, not what the database does.

/** The fields `upsert_log_and_streak` actually commits — the ones a resubmission would rewrite. */
export interface LoggedState {
  hours: number;
  sections: string[];
  mockTaken: boolean;
  notes: string | null;
  energy: string | null;
  emotionalChips: string[];
}

/**
 * Sections and chips are compared as SETS.
 *
 * The client rebuilds these arrays from checkbox state, so order is an artefact
 * of the UI and not evidence. A repeated entry is the same claim stated twice —
 * the same reasoning the Fact Registry's duplicate-topic collapse uses.
 */
function sameSet(a: string[], b: string[]): boolean {
  const x = new Set(a);
  const y = new Set(b);
  if (x.size !== y.size) return false;
  for (const v of x) if (!y.has(v)) return false;
  return true;
}

/**
 * Is this exact payload already committed?
 *
 * `null` persisted means no row: nothing was committed, so nothing may be
 * acknowledged as saved. Absence is not agreement.
 */
export function isAlreadyPersisted(incoming: LoggedState, persisted: LoggedState | null): boolean {
  if (!persisted) return false;
  return (
    Number(incoming.hours) === Number(persisted.hours)
    && incoming.mockTaken === persisted.mockTaken
    && (incoming.notes ?? null) === (persisted.notes ?? null)
    && (incoming.energy ?? null) === (persisted.energy ?? null)
    && sameSet(incoming.sections, persisted.sections)
    && sameSet(incoming.emotionalChips, persisted.emotionalChips)
  );
}

/**
 * What a blocked resubmission is told.
 *
 * It names both truths in one sentence: the log exists, and this particular
 * change did not land. Neither half may be dropped — "saved" alone would hide
 * the lost edit, and "failed" alone is the defect this fixes.
 */
export const EDIT_TOO_FAST_MESSAGE =
  'Your log is saved. That change came in too quickly to apply — give it a few seconds and try again.';
