// ── WHOSE EXAM IS THIS YEAR ─────────────────────────────────────────────────
//
// Founder's call, 15 Sep 2026, after the base was counted properly for the
// first time:
//
//   attempt year   students   active 7d   studied 7d
//   2026              703        119          33
//   2027              201         31           8
//   (never set)       299         10           1
//   2028                5          0           0
//
// Only 703 of 1,208 are sitting CAT 2026. The counsellors' own notes say the
// rest in their own words — "2nd year college, will prepare for 2027",
// "currently he will prepare for 2027" — and those students are not failing to
// study. Their exam is next year.
//
// `call-queue`, `lead-intake` and `sales-day` contained no reference to
// `attempt_year` at all, so this year's scarce calls were being spent at equal
// priority on next year's students and on 299 accounts that never answered the
// question (of whom 10 opened the app last week and 1 studied).
//
// ══ WHAT THIS IS AND IS NOT ═════════════════════════════════════════════════
//
// It moves 2027 students DOWN the day. It does not remove them from anyone's
// book, and the free product does not change for them by a single pixel —
// MISSION: the product has to be better for a student who will never pay, and
// a 2027 aspirant is a 2026 student who arrived early, not a worse one.
//
// AND IT NEVER TOUCHES A PROMISE. A callback owed to a 2027 student is owed
// exactly as much as one owed to a 2026 student: the weighting applies only to
// the lanes where WE choose who to call. Reordering commitments by how
// commercially interesting someone is would be the precise thing SALES-OS §0
// exists to forbid.

/** Lanes where the counsellor's attention is ours to direct. */
const DISCRETIONARY = new Set(['fresh', 'rotation', 'attention', 'new_never_logged']);

/** The attempt year the product is currently built around. */
export const CURRENT_ATTEMPT_YEAR = 2026;

/**
 * Sort adjustment for a candidate.
 *
 * Deliberately small relative to the lane bands (going_cold sits at 4,000,000)
 * — this decides who goes first WITHIN a lane, never which lane someone is in.
 * A 2027 student in a retention lane still outranks a 2026 student in
 * rotation, because a student slipping away is the more urgent fact.
 */
export function attemptYearBoost(input: {
  lane: string;
  attemptYear: number | null | undefined;
}): number {
  if (!DISCRETIONARY.has(input.lane)) return 0;   // promises are untouched
  const y = input.attemptYear;
  if (y === CURRENT_ATTEMPT_YEAR) return 40_000;
  // Never answered. Not evidence of anything except a question we did not get
  // an answer to, so it sits between the two rather than at the bottom — and
  // the first real conversation is what settles it.
  if (y == null) return 0;
  // A future year. Down, never out.
  if (y > CURRENT_ATTEMPT_YEAR) return -40_000;
  // A past year: they sat the exam already, or the field is stale.
  return -20_000;
}

/** What the card says, so the counsellor opens with the right sentence. */
export function attemptYearNote(attemptYear: number | null | undefined): string | null {
  if (attemptYear == null) return 'Attempt year unknown — worth asking first';
  if (attemptYear > CURRENT_ATTEMPT_YEAR) return `Sitting CAT ${attemptYear}, not this year`;
  return null;
}
