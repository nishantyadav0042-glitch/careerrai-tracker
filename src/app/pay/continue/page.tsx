'use client';

import { useEffect } from 'react';
import { isPaymentReturnKey, PAYMENT_RETURNS } from '@/lib/payment-return';

// ── THE LANDING HALF OF THE CHECKOUT-ORIGIN HAND-OFF (Incident #59) ─────────
//
// A student on careerrai-daily.vercel.app cannot pay: Razorpay refuses the
// origin outright ("Payment blocked as website does not match registered
// website(s)"). lib/checkout-origin-guard sends them here, on careerrai.in,
// carrying a one-time session token. This screen exchanges it and drops them
// back on the same paywall — signed in, on the domain that transacts.
//
// WHY NOT /app?k=. That route exists for the same token but only consumes it
// when `display-mode: standalone` matches, because its job is to log in an
// installed PWA on first launch. A student arriving here is in an ordinary
// browser tab, so /app would show them the install guide and swallow the
// hand-off. Two different jobs; the token format is shared, the destination is
// not.
//
// `to` is an allow-list KEY resolved against PAYMENT_RETURNS — never a path
// from the query string, which would be an open redirect wearing the payment
// flow's credibility.

export default function PayContinue() {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const token = q.get('k');
    const to = q.get('to');
    const dest = isPaymentReturnKey(to) ? PAYMENT_RETURNS[to] : PAYMENT_RETURNS.buddy;

    if (!token) { window.location.replace(dest); return; }

    fetch('/api/install/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      // The exchange answers with its own role-based `dest`; we deliberately
      // ignore it. It routes an installed app to its home screen, which is the
      // right answer for that flow and the wrong one here — this student was
      // mid-purchase and must land back on the paywall they left.
      .then(() => window.location.replace(dest))
      // A dead token still lands them on the paywall rather than a dead end.
      // On careerrai.in they are either already signed in (the cookie may
      // exist here independently) or they meet the ordinary login screen.
      .catch(() => window.location.replace(dest));
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
      <p className="text-center text-sm text-stone-600">Taking you to checkout…</p>
    </main>
  );
}
