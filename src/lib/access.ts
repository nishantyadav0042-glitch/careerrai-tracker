// Single source of truth for the freemium paywall.
// The real buddy (chat, sessions, mock debriefs, feedback) is premium-only;
// free students get the "buddy-taste" locked UI instead. Gate every real-buddy
// surface on isPremium(profile) — never check is_premium inline elsewhere.

export interface AccessProfile {
  is_premium?: boolean | null;
  is_demo?: boolean | null;
}

/** True when the student has a paid (or backfilled-active) membership. */
export function isPremium(profile: AccessProfile | null | undefined): boolean {
  return !!profile?.is_premium;
}

/** Free (non-premium) and not the read-only demo account — i.e. a real free user
 *  who should see the buddy-taste / unlock prompts. */
export function isFreeRealUser(profile: AccessProfile | null | undefined): boolean {
  return !!profile && !profile.is_premium && !profile.is_demo;
}
