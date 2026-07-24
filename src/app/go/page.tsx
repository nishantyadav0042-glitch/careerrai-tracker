'use client';

import { Suspense, useEffect } from 'react';

// Browser-side session hand-off landing (24 Jul). The store wrapper sends a
// buyer here in the REAL browser (`/go?k=<token>&dest=/student/buddy`) so they
// arrive signed in on the paywall, where web Razorpay is allowed. Unlike /app
// (which is the install flow and only exchanges in standalone), /go ALWAYS
// exchanges the one-time token in whatever browser opened it, then redirects to
// the internal `dest`. Public route — the token IS the credential.
function GoInner() {
  useEffect(() => {
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
