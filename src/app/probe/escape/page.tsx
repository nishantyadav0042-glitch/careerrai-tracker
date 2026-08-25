'use client';

import { useState } from 'react';
import { track, displayModeFrom } from '@/lib/journey';
import { storeCookieValue } from '@/lib/store-build';

// ── TEMPORARY DIAGNOSTIC — DELETE AFTER THE ANSWER IS RECORDED ──────────────
//
// ONE question, and nothing else: when the CareerRai iOS App Store build calls
// window.open(), does the destination run in REAL SAFARI or in ANOTHER
// WKWebView inside the same app?
//
// That single fact decides the payment architecture. Safari owns UPI deep
// links (upi://, phonepe://, tez://, paytmmp://), so if the escape lands in
// Safari the Safari-escape checkout works. If it lands in a nested WKWebView,
// the escape inherits the exact decidePolicyFor gap that is currently killing
// UPI, and the whole architecture is dead on arrival.
//
// WHY A PROBE AND NOT A GUESS: production shows `pay_escape_browser
// {opened:true}` seven times out of seven in `ios_app`. That proves the
// wrapper RETURNED a window object. It does not prove which browser rendered
// it, and building a payment flow on that gap is the speculative change we
// were told not to make.
//
// TOUCHES NOTHING: no Razorpay, no order, no callback, no entitlement, no
// payment record. It opens a page and asks that page where it is.

function isStandalone(): boolean {
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches
      || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
  } catch { return false; }
}

export default function EscapeProbe() {
  const [state, setState] = useState<string | null>(null);

  function run() {
    const probeId = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const origin = displayModeFrom({ storeSource: storeCookieValue(), standalone: isStandalone() });

    // Built BEFORE the call: after window.open the tap gesture is spent, and
    // anything computed later may run in a page that is already backgrounded.
    const url = `${window.location.origin}/probe/landed?probe=${probeId}&from=${origin}`;

    // Called SYNCHRONOUSLY inside the tap handler, exactly as a real payment
    // escape would be — an await here would spend the user gesture and change
    // the very behaviour we are measuring.
    let opened: boolean;
    try {
      const win = window.open(url, '_blank');
      opened = win != null;
    } catch {
      opened = false;
    }

    track('probe_escape_origin', { probeId, origin, opened, ua: navigator.userAgent.slice(0, 300) });
    setState(opened
      ? `Opened. probe=${probeId} — now read the NEW screen that just appeared.`
      : `window.open returned null. probe=${probeId} — nothing opened. That is itself the answer.`);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 px-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Escape probe</h1>
        <p className="mt-1 text-[13px] text-stone-600">
          Diagnostic only. No payment, no order, no charge. One tap tells us whether this app can
          reach real Safari.
        </p>
      </div>
      <button
        type="button"
        onClick={run}
        className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-bold text-white active:scale-[0.98]"
      >
        Run the probe
      </button>
      {state && (
        <p className="rounded-xl bg-stone-100 px-3 py-2.5 text-[12px] font-semibold text-stone-700">{state}</p>
      )}
      <p className="text-[11px] text-stone-400">
        If nothing appears after tapping, that is a result too — tell Claude &ldquo;nothing opened&rdquo;.
      </p>
    </div>
  );
}
