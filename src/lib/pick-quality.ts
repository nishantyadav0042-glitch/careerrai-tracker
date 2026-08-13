// ── Pick quality — how student votes decide what students see next ─────────
//
// Founder, 13 Aug: "students create → students solve → students vote → best
// questions rise → CareerRai serves the best ones." And the constraint that
// makes it honest: "don't rank purely by percentage — 100% helpful from 3
// votes must not beat 91% helpful from 500."
//
// That constraint has a standard, boring, correct answer: the Wilson score
// lower bound — the same confidence-adjusted ranking Reddit's "best" sort
// uses. It asks "given this many votes, what helpfulness rate can we be 95%
// sure the item actually has?" Three votes, all helpful → we can only be sure
// of ~44%. Five hundred votes, 91% helpful → we're sure of ~88%. The big
// honest sample wins, exactly as it should.
//
// Nothing here is shown to students as a formula. They see the three states
// (NEW → RISING → TOP PICK); the backend sees the score. Content is ranked,
// never students — a leaderboard of people turns a study community into a
// popularity contest, and the monthly contributor reward already handles
// recognition through rank alone.

/** 95% Wilson lower bound on the true helpful rate. 0 when unvoted. */
export function wilsonLower(helpful: number, total: number): number {
  if (total <= 0) return 0;
  const z = 1.96;
  const p = helpful / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return Math.max(0, (centre - margin) / denom);
}

export type PickState = 'new' | 'rising' | 'top';

/** Votes below this, the item is simply NEW — no judgement either way. */
export const RISING_MIN_VOTES = 5;
/** Votes and confidence needed before an item may wear the TOP badge. */
export const TOP_MIN_VOTES = 15;
export const TOP_MIN_SCORE = 0.7;
export const RISING_MIN_SCORE = 0.5;

/**
 * The three public states of a submission's life. Deliberately no public
 * "bad" state — an item students didn't find useful just stays quiet and
 * sinks in the ranking; branding it would punish the student who tried.
 */
export function pickState(helpful: number, total: number): PickState {
  const score = wilsonLower(helpful, total);
  if (total >= TOP_MIN_VOTES && score >= TOP_MIN_SCORE) return 'top';
  if (total >= RISING_MIN_VOTES && score >= RISING_MIN_SCORE) return 'rising';
  return 'new';
}

export const PICK_STATE_LABEL: Record<PickState, string | null> = {
  new: null, // fresh items carry no badge — absence of evidence is not a state worth announcing
  rising: '🔥 Rising Pick',
  top: '🏆 Top Pick — rated by students',
};
