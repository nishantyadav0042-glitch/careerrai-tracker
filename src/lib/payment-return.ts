// ── Where a student may be sent after paying ────────────────────────────────
//
// The return destination travels in the callback URL's query string, which
// means it is attacker-controlled: Razorpay POSTs back to whatever URL we gave
// it, and anyone can craft a link to our own callback with a `dest` of their
// choosing. Redirecting to that value unchecked is a textbook open redirect —
// and this one would carry the credibility of the payment flow, which is
// exactly the context a phishing page wants to inherit.
//
// So the destination is validated against an ALLOW-LIST of the three screens a
// payment can legitimately land on, not merely checked for "starts with /".
// `//evil.com` starts with a slash. So does `/\evil.com` in some parsers.

export const PAYMENT_RETURNS = {
  profile: '/student/profile',
  buddy: '/student/buddy',
  home: '/student/home',
} as const;

export type PaymentReturnKey = keyof typeof PAYMENT_RETURNS;

export function isPaymentReturnKey(v: unknown): v is PaymentReturnKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PAYMENT_RETURNS, v);
}

/**
 * The path to land on, and the status to show when we get there.
 *
 * An unknown key is not an error the student should meet — their money has
 * already moved. It falls back to the buddy screen, which is where every
 * current purchase belongs.
 */
export function paymentReturnPath(
  key: unknown,
  outcome: 'paid' | 'failed' | 'unverified',
): string {
  const base = isPaymentReturnKey(key) ? PAYMENT_RETURNS[key] : PAYMENT_RETURNS.buddy;
  return `${base}?pay=${outcome}`;
}
