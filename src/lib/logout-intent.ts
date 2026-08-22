// ── Was this logout the student's own decision? ─────────────────────────────
//
// The session-loss notice exists for the case where the browser threw away the
// auth session WITHOUT the student asking. auth-js emits the same SIGNED_OUT
// event either way, so the event alone cannot tell those apart — and telling
// someone who just tapped "Log out" that their session ended unexpectedly is
// worse than saying nothing at all.
//
// So intent is recorded at the only place that knows it: the moment the button
// is pressed. sessionStorage, not a module variable, because logging out is a
// full page navigation to /api/auth/logout — every module variable dies with
// the document. It is scoped to the tab and cleared on read, so a stale mark
// can never suppress a genuine future session loss.

const KEY = 'cr_logout_intent';
/** A mark older than this was not the navigation we are looking at. */
const MAX_AGE_MS = 30_000;

export function markLogoutIntent(now: number): void {
  try {
    sessionStorage.setItem(KEY, String(now));
  } catch {
    // Private mode / storage disabled. The notice may show on a deliberate
    // logout, which is a cosmetic miss — never a broken logout.
  }
}

/** True when a deliberate logout was started moments ago. Clears the mark. */
export function consumeLogoutIntent(now: number): boolean {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return false;
    sessionStorage.removeItem(KEY);
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return now - at >= 0 && now - at <= MAX_AGE_MS;
  } catch {
    return false;
  }
}

/** The one decision the session-loss notice makes, kept out of the component
 *  so it can be tested deterministically — this repo has no DOM test
 *  environment, and a decision that can only be exercised by rendering React
 *  is a decision with no regression cover. */
export function shouldShowSessionLoss(args: {
  event: string;
  alreadyShown: boolean;
  /** Result of consumeLogoutIntent — true when the student chose to log out. */
  wasIntentional: boolean;
}): boolean {
  // INITIAL_SESSION fires on subscribe; TOKEN_REFRESHED on every healthy
  // rotation. Only an actual sign-out is a loss.
  if (args.event !== 'SIGNED_OUT') return false;
  // Once per page life: SIGNED_OUT can arrive repeatedly, and a notice that
  // reappears reads as the app breaking over and over.
  if (args.alreadyShown) return false;
  // Their own decision is not a fault.
  if (args.wasIntentional) return false;
  return true;
}
