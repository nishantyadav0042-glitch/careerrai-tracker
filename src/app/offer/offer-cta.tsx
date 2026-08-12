'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { track } from '@/lib/journey';
import type { PlanId } from '@/lib/plans';

// The CTA half of /offer. Client-side only so the page itself stays a server
// component reading the authoritative price.
//
// It does NOT reimplement checkout. Logged-in students go to the buddy screen
// where the existing, tested payment sheet lives (the campaign price is applied
// server-side in resolvePrice, so they see ₹2,499 there without a coupon code).
// Logged-out visitors from an ad go to /start — the free plan first, which is
// the funnel that already works; the offer follows them in-app.
export function OfferCta({ loggedIn, plan }: { loggedIn: boolean; plan: PlanId }) {
  useEffect(() => { track('campaign_offer_view', { campaign: 'independence-2026', loggedIn }); }, [loggedIn]);

  const href = loggedIn ? `/student/buddy?plan=${plan}&from=offer` : '/start?from=offer';
  const label = loggedIn ? 'Get my buddy →' : 'Build my free plan first →';

  return (
    <div className="mt-5">
      <Link
        href={href}
        onClick={() => track('campaign_offer_cta', { campaign: 'independence-2026', loggedIn })}
        className="flex w-full items-center justify-center rounded-2xl bg-stone-900 py-4 text-[15px] font-bold text-white shadow-lg shadow-stone-900/15 active:scale-[0.98]"
      >
        {label}
      </Link>
      {!loggedIn && (
        <p className="mt-2 text-center text-[12px] leading-snug text-stone-500">
          Free plan takes 2 minutes. Your buddy offer is waiting inside.
        </p>
      )}
    </div>
  );
}
