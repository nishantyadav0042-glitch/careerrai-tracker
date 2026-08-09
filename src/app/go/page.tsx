'use client';

import { Suspense, useEffect, useState } from 'react';
import { markPaymentTab } from '@/lib/store-build';
import { handoffReachedBrowser } from '@/lib/payment-surface';

// Browser-side session hand-off landing (24 Jul). The store wrapper sends a
// buyer here in the REAL browser (`/go?k=<token>&dest=/student/buddy`) so they
// arrive signed in on the paywall, where web Razorpay is allowed. Unlike /app
// (which is the install flow and only exchanges in standalone), /go ALWAYS
// exchanges the one-time token in whatever browser opened it, then redirects to
// the internal `dest`. Public route — the token IS the credential.
function GoInner() {
  const [stuckInApp, setStuckInApp] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Verify we actually LANDED in a browser before claiming to be one.
    //
    // This used to call markPaymentTab() unconditionally. On iOS a
    // target="_blank" link opened from a home-screen PWA loads in the SAME PWA
    // window, so this page ran inside the app, marked it as the real browser
    // payment tab, and switched it to inline Razorpay — the one context on iOS
    // that cannot complete a payment. Measured: 160 tokens minted, 7 consumed,
    // and one student burned four of them ten seconds before each failed
    // inline attempt. See lib/payment-surface.
    if (!handoffReachedBrowser(typeof navigator === 'undefined' ? null : navigator)) {
      // Do NOT mark, and do NOT spend the token — it stays valid so the same
      // link still works when they open it in Safari.
      setStuckInApp(true);
      return;
    }

    // This tab IS the real browser we escaped into — checkout must run inline
    // here, never bounce out again (see isStoreBuild).
    markPaymentTab();
    const params = new URLSearchParams(window.location.search);
    const token = params.get('k');
    const destRaw = params.get('dest');
    // Only allow internal same-origin paths as a redirect target.
    const dest = destRaw && destRaw.startsWith('/') && !destRaw.startsWith('//') ? destRaw : '/student/tracker';

    if (!token) { window.location.replace(dest); return; }
    fetch('/api/install/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        // Prefer the explicit dest; fall back to the exchange's own dest.
        window.location.replace(res.ok ? (dest !== '/student/tracker' ? dest : (json.dest ?? dest)) : dest);
      })
      .catch(() => window.location.replace(dest));
  }, []);

  // Still inside the app. Say so plainly and give them the one action that
  // works, rather than spinning forever or — far worse — silently proceeding
  // into a checkout that cannot complete here.
  if (stuckInApp) {
    const here = typeof window === 'undefined' ? '' : window.location.href;
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-white px-6 text-center">
        <p className="text-[17px] font-bold text-stone-900">Open this in Safari to pay</p>
        <p className="max-w-xs text-sm leading-relaxed text-stone-600">
          Payments can&apos;t be completed inside the app. Tap the share icon below and choose{' '}
          <b className="text-stone-900">Open in Safari</b> — you&apos;ll still be signed in.
        </p>
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(here).then(() => setCopied(true)).catch(() => {}); }}
          className="rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white active:scale-[0.98]"
        >
          {copied ? 'Link copied — paste it in Safari' : 'Copy my payment link'}
        </button>
        <p className="max-w-xs text-[11px] leading-relaxed text-stone-400">
          This link keeps you signed in and expires in 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-white px-6 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-stone-900" />
      <p className="text-sm text-stone-500">Opening secure checkout…</p>
    </div>
  );
}

export default function GoPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh]" />}>
      <GoInner />
    </Suspense>
  );
}
