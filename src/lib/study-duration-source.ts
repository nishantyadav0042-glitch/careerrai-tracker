// ── Where a stored study_duration actually came from (0C.3G / J6-A) ─────────
//
// `daily_reports.study_duration` is NUMERIC(4,1) NOT NULL DEFAULT 0. It has no
// way to say "we never asked" — so a check-in day (the gate deliberately posts
// hours: 0, "a check-in is not a study claim") is indistinguishable from an
// honest zero, from a legacy typed number, and from a credited zero.
//
// J6-A, the amended contract: a duration may be presented as self-reported or
// as credited ONLY when its provenance is actually established; where
// provenance has already been erased it stays explicitly unknown, and no
// historical value is ever rewritten to fit the model.
//
// This module is the single authority for that vocabulary. NULL — not a fifth
// label — carries "unknown": it is what an un-stamped row honestly is, it needs
// no backfill, and it maps onto the Fact Registry's first-class UNKNOWN.

export const STUDY_DURATION_SOURCES = [
  /** Priced from plan coverage by creditedHours(). */
  'credited',
  /** A duration the student stated. Reserved: no writer produces it today —
   *  the hours input was removed on 9 Aug (1bb4f56). Kept in the vocabulary
   *  because the API still accepts arbitrary `hours` and the product may
   *  reintroduce self-report; its first appearance should be a signal. */
  'self_reported',
  /** The surface never asked for a duration (the daily check-in gate). */
  'not_collected',
  /** The student said they did not study (the log sheet's Rest toggle). */
  'declared_zero',
] as const;

export type StudyDurationSource = (typeof STUDY_DURATION_SOURCES)[number];

export function isStudyDurationSource(v: unknown): v is StudyDurationSource {
  return typeof v === 'string' && (STUDY_DURATION_SOURCES as readonly string[]).includes(v);
}

/**
 * STAMP THE WINNER.
 *
 * `complete-task` stores `Math.max(earned, existingLog?.study_duration ?? 0)`,
 * so the number that lands is not always the credited one. Stamping every such
 * write 'credited' because the credit path *ran* would assert that a
 * pre-existing 6-hour value was priced from coverage — manufacturing precisely
 * the false provenance J6-A forbids.
 *
 * The stamp must therefore describe the value that actually survived the merge:
 *
 *   · nothing to merge against, or credit wins → 'credited'
 *   · the pre-existing value wins or ties      → whatever IT already carried,
 *                                                including NULL
 *
 * A tie preserves the existing source deliberately: the stored number does not
 * change, so neither does what it means. And a legacy NULL stays NULL — an
 * unknown that survives a merge is still unknown, never upgraded to a guess.
 */
export function sourceForMergedDuration(input: {
  /** creditedHours() for this request. */
  earned: number;
  /** The already-stored duration, or null when no row exists yet. */
  existing: number | null;
  /** The already-stored provenance. NULL for every historical row. */
  existingSource: StudyDurationSource | null;
}): StudyDurationSource | null {
  if (input.existing == null) return 'credited';
  return input.earned > input.existing ? 'credited' : input.existingSource;
}

/**
 * What the LOG SHEET can honestly say about the duration it just posted.
 *
 * The sheet does not collect self-reported hours — that input was removed on
 * 9 Aug, and what it posts is `creditedHours(...)` computed on the CLIENT
 * (LoggingModal:187). The server receives a bare number in `body.hours` and
 * cannot verify where it came from, so:
 *
 *   · hours 0 + an explicit "no work" outcome → 'declared_zero'. Established:
 *     the student's own outcome answer says there was nothing to measure.
 *   · hours 0 + anything else                 → 'not_collected'. Established:
 *     no duration was captured. This is the 65-row state that reads as a
 *     literal zero everywhere downstream.
 *   · hours > 0                               → NULL. NOT established. The
 *     server did not compute this number and will not assert 'credited' for
 *     it. Claiming provenance we cannot demonstrate is the exact defect J6-A
 *     forbids, and NULL already means "unknown" honestly.
 *
 * `complete-task` is different and stamps 'credited' for real: there the
 * server computes creditedHours() itself.
 */
export function sourceForLoggedDuration(input: {
  hours: number;
  dayOutcome?: string | null;
}): StudyDurationSource | null {
  if (input.hours > 0) return null;
  return input.dayOutcome === 'not_studied' || input.dayOutcome === 'skipped'
    ? 'declared_zero'
    : 'not_collected';
}
