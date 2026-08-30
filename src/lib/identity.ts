// ── WHO A CAREERRAI ACCOUNT BELONGS TO ──────────────────────────────────────
//
// One student is one account, and the thing that makes them one is a VERIFIED
// PHONE NUMBER. Not an email, not a Google identity — a phone we sent a code to
// and watched them type back.
//
// This file is the only place that decision is expressed. It is pure on
// purpose: every rule below is a fact about identity, not about Supabase, HTTP
// or React, so it can be mutation-tested rather than merely read.
//
// ── WHY THIS EXISTS (Incident #62) ──────────────────────────────────────────
//
// "Continue with Google" went live 28 Aug as the primary CTA on /start. Two
// days later production held 5 Google accounts and EVERY ONE of them had no
// phone identity at all. One of them (a real, onboarded, returning student)
// could not be reached by SMS or WhatsApp and never will be.
//
// The mechanism is arithmetic, not bad luck. Supabase attaches a Google
// identity to an existing user ONLY when the email matches and is confirmed.
// 963 of 969 student profiles have no email on file, because this product sold
// phone-first auth for a year. So for essentially every existing student there
// is nothing to match on, and Google sign-in mints a SECOND account: new
// profile, streak 0, no plan, no buddy, no payment history — while the real one
// still exists under a different id. `/auth/callback` already carried a comment
// saying exactly this, and shipped anyway.
//
// The fix is not a better matching heuristic. Guessing which account a stranger
// belongs to is how you hand one student's history to another. The fix is to
// stop treating Google as a door that can CREATE anything, and require the
// anchor before an account is usable.

/**
 * The shape `/auth/callback` and the student layout can both see cheaply.
 * `phoneVerifiedAt` is the authority; a phone STRING is not evidence of
 * anything, because until Incident #62 the onboarding form let a student type
 * any ten digits straight into `profiles.phone` over the verified one.
 */
export interface AccountAnchor {
  /** profiles.phone_verified_at — stamped only by a verified OTP round-trip. */
  phoneVerifiedAt: string | null | undefined;
}

/**
 * Is this account anchored to a real, proven phone number?
 *
 * The single question every gate below reduces to. Deliberately NOT "does it
 * have a phone string": the 54 abandoned signups in production all have
 * `auth.users.phone` set and never confirmed an OTP, and 92 profiles carry a
 * phone that a form wrote rather than a verification.
 */
export function isAnchored(a: AccountAnchor | null | undefined): boolean {
  if (!a) return false;
  const v = a.phoneVerifiedAt;
  return typeof v === 'string' && v.length > 0;
}

/**
 * Does THIS account have to be anchored before it may use the product?
 *
 * Scoped deliberately narrowly, because a gate is a lockout and the blast
 * radius of getting it wrong is worse than the bug it closes. Checked against
 * production before writing (30 Aug), the accounts that are signed in and NOT
 * phone-confirmed are:
 *
 *   · the 5 Google students — the population this exists for.           GATED
 *   · `appreview@careerrai.in` and `buddydemo@careerrai.in` — the Apple
 *     App Store REVIEWER and demo logins, both is_test_account/is_demo.
 *     Gating these fails the next iOS review with a login the reviewer
 *     cannot complete: they have no Indian SIM to receive an OTP on.     EXEMPT
 *   · Neelam Singh, an active sales counsellor on the email door, whose
 *     phone was never OTP-confirmed. Locking a working counsellor out of
 *     the queue mid-shift is not a correctness fix, it is an outage.     EXEMPT
 *
 * So: students only, real accounts only. Buddy and sales identity requirements
 * are enforced where those accounts are ACTIVATED, not by evicting people who
 * are already working.
 */
export function requiresPhoneAnchor(p: {
  role: string | null | undefined;
  isTestAccount?: boolean | null;
  isDemo?: boolean | null;
  anchor: AccountAnchor | null | undefined;
}): boolean {
  if (p.role !== 'student') return false;
  if (p.isTestAccount === true || p.isDemo === true) return false;
  return !isAnchored(p.anchor);
}

// ── ARRIVING THROUGH GOOGLE ─────────────────────────────────────────────────

export type GoogleArrival =
  /** Known account, already anchored. Sign in exactly as before. */
  | { kind: 'sign_in' }
  /**
   * Authenticated by Google, but no verified phone on this account. The account
   * is INERT: it exists (Supabase created it before we were consulted) but it
   * cannot be used until a phone is attached to THIS id. Never a second account.
   */
  | { kind: 'gate_link_phone' }
  /**
   * This Google email already belongs to a DIFFERENT CareerRai account. Merging
   * two auth identities is an admin operation with real failure modes and is
   * never something to attempt silently on a login. Refuse and say so.
   */
  | { kind: 'refuse_account_exists' };

/**
 * What to do when someone lands on /auth/callback having authenticated with
 * Google.
 *
 * ORDER MATTERS. The duplicate-email refusal is checked FIRST: an account that
 * belongs to someone else must never be routed into a phone-linking flow, which
 * would invite them to attach their own number to it.
 */
export function decideGoogleArrival(s: {
  /** A different profile id already carries this Google email. */
  emailOwnedByAnotherAccount: boolean;
  /**
   * The account being signed into. Role and the test/demo flags are part of
   * the decision, not a second check bolted on by the caller — a gate applied
   * in one place and scoped in another is how the App Store reviewer gets
   * locked out by a change nobody thought touched them.
   */
  profile: {
    role: string | null | undefined;
    isTestAccount?: boolean | null;
    isDemo?: boolean | null;
    anchor: AccountAnchor | null | undefined;
  };
}): GoogleArrival {
  if (s.emailOwnedByAnotherAccount) return { kind: 'refuse_account_exists' };
  if (requiresPhoneAnchor(s.profile)) return { kind: 'gate_link_phone' };
  return { kind: 'sign_in' };
}

// ── ATTACHING A PHONE TO AN EXISTING ACCOUNT ────────────────────────────────

export type PhoneLinkRefusal =
  /** Not a valid Indian mobile. */
  | 'invalid_phone'
  /**
   * The number is already the anchor of a different CareerRai account. This is
   * THE case the whole design exists to catch, and the one thing we must never
   * resolve by guessing: auto-merging here would move one student's streak,
   * plan, buddy and payment history onto an account someone else just proved
   * control of. Refuse, name it, and send them to sign in with the OTP door
   * they already own.
   */
  | 'phone_belongs_to_another_account';

export type PhoneLinkPlan =
  | { kind: 'attach'; e164: string }
  | { kind: 'already_anchored'; e164: string }
  | { kind: 'refuse'; reason: PhoneLinkRefusal };

/**
 * Decide what linking this phone to this account means, before any write.
 *
 * IDEMPOTENT BY CONSTRUCTION: re-running the link with the number already
 * anchored to this same account is `already_anchored`, not a refusal and not a
 * second attach. A student who double-taps, or whose network retried, must not
 * see an error for succeeding twice.
 *
 * @param e164            normalised phone, or null if it did not normalise
 * @param ownerAccountId  which account currently holds this number, if any
 * @param thisAccountId   the signed-in account asking to attach it
 */
export function planPhoneLink(s: {
  e164: string | null;
  ownerAccountId: string | null | undefined;
  thisAccountId: string;
}): PhoneLinkPlan {
  if (!s.e164) return { kind: 'refuse', reason: 'invalid_phone' };
  if (s.ownerAccountId) {
    // Compared as ids, never as phone strings: '+919876543210' and
    // '9876543210' are the same human and the same anchor, and a string
    // comparison of the two would report a conflict with oneself.
    return s.ownerAccountId === s.thisAccountId
      ? { kind: 'already_anchored', e164: s.e164 }
      : { kind: 'refuse', reason: 'phone_belongs_to_another_account' };
  }
  return { kind: 'attach', e164: s.e164 };
}

// ── WHERE AN UNANCHORED ACCOUNT IS ALLOWED TO GO ────────────────────────────

/** The one gate destination, so no caller invents a second spelling of it. */
export const LINK_PHONE_PATH = '/auth/link-phone';

/**
 * Paths an account with no verified phone may still reach. Everything else
 * under /student, /buddy and /admin is closed to it.
 *
 * Kept deliberately short. It is not a convenience list — each entry is a route
 * the gate itself needs in order to be escapable (the gate page, its API, and
 * the way out). Adding a product page here re-opens the hole.
 */
export const ANCHOR_EXEMPT_PREFIXES: readonly string[] = Object.freeze([
  LINK_PHONE_PATH,
  '/api/auth/',
  '/logout',
]);

export function isAnchorExempt(pathname: string): boolean {
  return ANCHOR_EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}
