'use client';

import { useEffect } from 'react';
import { isPaymentReturnKey, PAYMENT_RETURNS, type PaymentReturnKey } from '@/lib/payment-return';

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

// ── WHY THIS IS A SWITCH AND NOT `PAYMENT_RETURNS[key]` ─────────────────────
//
// The obvious spelling — resolve the key to a path, then redirect to that
// variable — was flagged by Semgrep's js-open-redirect rule, three times, on
// the three redirects below. It is a FALSE POSITIVE: `isPaymentReturnKey`
// admits only three literal keys and anything else falls back to a constant,
// so nothing the student types can ever reach `location.replace`.
//
// It is not suppressed anyway. This repo's rule about that is already written
// down, in the one test file that is about leaked credentials: a `nosemgrep`
// is "precisely the annotation a real token gets pasted next to one day, and
// then scanned straight past", so the rule stays armed and the CODE changes.
// Same reasoning here. A blanket suppression on an open-redirect rule inside
// the payment flow — the exact context a phishing redirect wants to inherit —
// would be the worst possible place to keep one.
//
// So the key only ever SELECTS a branch; every value handed to
// `location.replace` is a constant read from PAYMENT_RETURNS. There is still
// exactly one source of truth for the paths, and a guard test pins that every
// key in that allow-list has a branch here — otherwise a fourth destination
// added later would silently land everyone on the buddy screen.

function landOn(key: PaymentReturnKey): void {
  if (key === 'profile') { window.location.replace(PAYMENT_RETURNS.profile); return; }
  if (key === 'home') { window.location.replace(PAYMENT_RETURNS.home); return; }
  window.location.replace(PAYMENT_RETURNS.buddy);
}

export default function PayContinue() {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const token = q.get('k');
    const raw = q.get('to');
    const key: PaymentReturnKey = isPaymentReturnKey(raw) ? raw : 'buddy';

    if (!token) { landOn(key); return; }

    fetch('/api/install/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      // The exchange answers with its own role-based `dest`; we deliberately
      // ignore it. It routes an installed app to its home screen, which is the
      // right answer for that flow and the wrong one here — this student was
      // mid-purchase and must land back on the paywall they left.
      .then(() => landOn(key))
      // A dead token still lands them on the paywall rather than a dead end.
      // On careerrai.in they are either already signed in (the cookie may
      // exist here independently) or they meet the ordinary login screen.
      .catch(() => landOn(key));
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
      <p className="text-center text-sm text-stone-600">Taking you to checkout…</p>
    </main>
  );
}
