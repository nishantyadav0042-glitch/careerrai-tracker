import { PAYMENT_RETURNS, type PaymentReturnKey } from '@/lib/payment-return';

// ── CHECKOUT MAY ONLY RUN WHERE RAZORPAY WILL TRANSACT ──────────────────────
//
// Incident #59, 29 Aug 2026. CareerRai serves from TWO live origins on one
// deployment — careerrai.in and careerrai-daily.vercel.app — and the legacy one
// is deliberately not redirected, because installed PWAs and their push
// subscriptions live on it (see lib/site.ts and the note in proxy.ts).
//
// Razorpay does not accept payments from it. The evidence, recovered from the
// payment ledger once #58 stopped discarding failure reasons:
//
//   order_TTc9Xwf45TqoaR  upi / payment_initiation / source=INTERNAL
//   order_TTcAJRnVkWzuXC  upi / payment_initiation / source=INTERNAL
//     "Payment blocked as website does not match registered website(s)"
//
// Both belong to one student, on careerrai-daily.vercel.app, 44 seconds apart.
// NINE MINUTES LATER the same student paid — same plan, same amount, same
// phone — on careerrai.in (order_TTcJEq49Hgv5h3). That is as close to a
// controlled experiment as production ever offers, and the ledger agrees across
// the whole history: 13 orders minted from the legacy origin, ZERO paid; 20
// from the canonical origin, 5 paid.
//
// 101 students used the legacy origin in the seven days to 29 Aug.
//
// WHY THIS IS A CODE FIX AND NOT ONLY A DASHBOARD FIX. Registering the second
// domain in the Razorpay account would also clear the block, and should be done
// — but it leaves the product one console setting away from silently losing
// every payment again, on any origin anyone adds later. A payment page belongs
// on the payment domain. This module makes that a property of the code.
//
// FAIL-CLOSED IS THE WHOLE DESIGN. `needsCheckoutHandoff` returns true ONLY for
// an origin we have positively established cannot transact. localhost, preview
// deployments, an unknown host, a malformed value — all return false and change
// nothing, because the cost of a false positive here is bouncing a paying
// student off a working checkout, which is worse than the bug being fixed.

/** The one origin Razorpay is known to accept payments from. */
export const CHECKOUT_ORIGIN = 'https://careerrai.in';

/**
 * Origins that serve the app but that Razorpay refuses to transact from.
 *
 * An explicit deny-list, never "anything that isn't CHECKOUT_ORIGIN" — that
 * inverted rule would fire on localhost and on every preview deployment and
 * would send developers and reviewers into a hand-off to production.
 */
export const NON_TRANSACTABLE_ORIGINS: readonly string[] = Object.freeze([
  'https://careerrai-daily.vercel.app',
]);

/** Trailing slashes only; case and scheme must already match. */
function normalise(origin: string): string {
  return origin.replace(/\/+$/, '');
}

/**
 * Must this page move to the checkout origin before starting a payment?
 *
 * True only for an origin proven non-transactable. Everything else — including
 * anything unrecognised — is left alone.
 */
export function needsCheckoutHandoff(origin: string | null | undefined): boolean {
  if (typeof origin !== 'string' || origin.length === 0) return false;
  return NON_TRANSACTABLE_ORIGINS.includes(normalise(origin));
}

/**
 * Where to send the student so checkout runs on a transactable origin.
 *
 * `dest` is a KEY, not a path, and it is resolved against the SAME allow-list
 * the payment callback uses (lib/payment-return). One allow-list, so a screen
 * can never be reachable by the hand-off but not by the return, and neither can
 * become an open redirect.
 *
 * The token is the one-time, 15-minute, encrypted-at-rest session hand-off that
 * already exists for carrying a session into an installed PWA
 * (/api/install/handoff). This reuses it rather than inventing a second way to
 * move a session between origins.
 */
export function checkoutHandoffUrl(token: string, dest: PaymentReturnKey): string {
  const path = PAYMENT_RETURNS[dest];
  return `${CHECKOUT_ORIGIN}/pay/continue?k=${encodeURIComponent(token)}&to=${encodeURIComponent(dest)}&next=${encodeURIComponent(path)}`;
}
