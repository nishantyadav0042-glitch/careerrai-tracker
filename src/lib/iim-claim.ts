// ── The IIM claim needs a verification, not a self-report ───────────────────
//
// Founder, 19 Aug, on the buddy CTA wording: "Talk to an IIM Buddy", not "Book
// a mentor" — and, in the same breath, the rule that makes it safe:
//
//     iim_verified_at != null  ->  eligible for the "IIM Buddy" claim
//     otherwise                ->  do not make the IIM claim
//
// Why this needs a gate rather than a convention. Checked against production
// on 19 Aug, all eight buddies:
//
//   · 7 of 8 have an IIM named in `iim_converted` — by SELF-REPORT
//   · CAT percentiles 98 to 99.5 — all genuinely high
//   · `iim_verified_at` is NULL for every single one
//   · 0 have a photo, 1 has a bio
//
// The column exists precisely because someone intended to verify and it never
// happened. Meanwhile the unlock sheet was telling students "Verified IIM
// alumni" — a claim about verification, made with nothing verified. That is
// the exact defect class this codebase has spent a week removing, and it is
// worse than the others because it is a promise to a student about to pay.
//
// This module is the gate. It does not decide copy and it does not soften the
// positioning: once the founder verifies a buddy and the timestamp lands, the
// strong claim becomes available for that buddy automatically.

export interface IimClaimSource {
  iim_converted?: string | null;
  iim_verified_at?: string | null;
  cat_percentile?: string | number | null;
}

/**
 * May we say "IIM" about this specific person?
 *
 * Requires BOTH a named institute and a verification timestamp. A timestamp
 * alone proves nothing about which IIM; a name alone is what we already had.
 */
export function canClaimIim(m: IimClaimSource | null | undefined): boolean {
  if (!m) return false;
  return Boolean(m.iim_verified_at) && Boolean(m.iim_converted && String(m.iim_converted).trim());
}

/**
 * How to describe a mentor truthfully today.
 *
 * Verified  -> the IIM is named. This is the claim the founder wants.
 * Otherwise -> the CAT percentile, which is a real stored number and is a
 *              strong credential in its own right. NEVER the institute.
 *
 * Deliberately returns a percentile line rather than nothing: the honest
 * fallback for an unverified claim is a different true fact, not silence, and
 * "cleared CAT at 99 percentile" is a perfectly good reason to talk to someone.
 */
export function mentorCredential(m: IimClaimSource | null | undefined): string | null {
  if (canClaimIim(m)) return String(m!.iim_converted).trim();
  const pct = m?.cat_percentile;
  if (pct == null || String(pct).trim() === '') return null;
  return `${String(pct).trim()} percentile in CAT`;
}

/**
 * The CTA label. "Talk to an IIM Buddy" only when at least one mentor on the
 * screen can actually carry the claim.
 */
export function buddyCtaLabel(mentors: IimClaimSource[]): string {
  return mentors.some(canClaimIim) ? 'Talk to an IIM Buddy' : 'Talk to a Buddy';
}
