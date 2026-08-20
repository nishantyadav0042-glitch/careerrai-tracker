'use client';

import { useEffect, useState } from 'react';
import { paymentHandoffUrl, readPaymentSurfaceSignals } from '@/lib/store-build';
import { paymentSurface } from '@/lib/payment-surface';

/**
 * Inside the iOS wrapper only: the hand-off URL, minted BEFORE the student taps.
 *
 * WHY THIS EXISTS. A WKWebView ignores window.open, so the only way out to the
 * real browser is a genuine anchor the navigation delegate can honour. The
 * first version of that fix minted the URL inside the tap handler and then
 * rendered the link, which turned buying into TWO taps: the plan button
 * appeared to do nothing, and a "Continue to secure payment" link materialised
 * somewhere further down the page with no visible connection to what was
 * tapped. Founder, 1 Aug: "only the bottom fixed button is working" and "this
 * secure payment button is coming without any reason" — both are that flow.
 * Production agreed: five pay_escape_browser events with linkReady:true and
 * not one hand-off consumed. Nobody found the second tap.
 *
 * Minting on mount makes the plan button itself the anchor, so it is one tap
 * again, exactly like every other platform.
 *
 * The token is single-use and lives 15 minutes (api/install/handoff), so it is
 * re-minted when the page becomes visible again and on a timer comfortably
 * inside that window. A student who reads the page for twenty minutes must not
 * tap a dead link.
 *
 * Shared by every checkout surface (membership, buddy paywall, session
 * booking) — extracted so there's ONE tested implementation instead of a copy
 * per surface that can drift.
 */
export function useIosPayUrl(dest: string): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    // Mint only where the link IS the payment path. Android's window.open
    // escape works and the web pays inline, so neither needs one.
    if (paymentSurface(readPaymentSurfaceSignals()) !== 'ios_link_handoff') return;

    let alive = true;
    const mint = () => {
      paymentHandoffUrl(dest)
        .then((u) => { if (alive && u) setUrl(u); })
        .catch(() => {});
    };
    mint();

    // Ten minutes, against a fifteen-minute token — refreshed before it can
    // expire rather than after, because the failure is silent.
    const timer = setInterval(mint, 10 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') mint(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [dest]);

  return url;
}
