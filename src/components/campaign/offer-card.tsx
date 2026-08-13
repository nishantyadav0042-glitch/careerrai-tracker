'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { track } from '@/lib/journey';
import { mayShowSeatsLeft } from '@/lib/campaign';

// ── The in-app campaign card (founder, 12 Aug: in-app carries the sales load) ─
//
// Shown on Home to eligible FREE students while the campaign is live. It is a
// card in the student's own product, not an advertisement bolted on: it appears
// where they already are, states the real price, the real saving and the real
// remaining seats, and disappears the instant they buy, dismiss it, or the
// offer ends.
//
// Exposure discipline (founder's 360° brief): a student who dismisses this is
// not shown it again — the dismissal is remembered on the device, and the same
// student should not be hit by card + push + WhatsApp all shouting the same
// thing. Notification-OS caps handle the push side; this handles the app side.
const DISMISS_KEY = 'cr_campaign_dismissed_independence-2026';

interface CampaignPayload {
  live: boolean;
  eligible: boolean;
  seatsLeft: number;
  slots: number;
  offerDisplay: string;
  listDisplay: string;
  savingDisplay: string;
  headline: string;
  label: string;
}

export function CampaignOfferCard() {
  const [c, setC] = useState<CampaignPayload | null>(null);
  const [dismissed, setDismissed] = useState(true); // assume hidden until checked

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot device check
      if (localStorage.getItem(DISMISS_KEY) !== '1') setDismissed(false);
    } catch { setDismissed(false); }

    let cancelled = false;
    fetch('/api/campaign', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CampaignPayload | null) => { if (!cancelled && data) setC(data); })
      .catch(() => { /* the offer is never worth breaking Home over */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (c?.eligible && !dismissed) track('campaign_card_seen', { campaign: 'independence-2026' });
  }, [c?.eligible, dismissed]);

  if (!c || !c.eligible || dismissed) return null;

  const close = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
    track('campaign_card_dismissed', { campaign: 'independence-2026' });
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-emerald-50 p-4">
      <button
        type="button"
        onClick={close}
        aria-label="Dismiss offer"
        className="absolute right-2 top-2 rounded-lg px-2 py-1 text-[16px] leading-none text-stone-400 hover:text-stone-700"
      >
        ×
      </button>

      <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600">
        🇮🇳 {c.label}
      </p>
      <p className="mt-1 text-[15px] font-bold leading-snug text-stone-900">{c.headline}</p>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[22px] font-extrabold text-stone-900">{c.offerDisplay}</span>
        <span className="text-[13px] font-semibold text-stone-400 line-through">{c.listDisplay}</span>
        <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[11px] font-extrabold text-white">
          Save {c.savingDisplay}
        </span>
      </div>

      <p className="mt-1.5 text-[12px] leading-snug text-stone-600">
        A real IIM mentor who reads your mocks and keeps your plan honest — till exam day.
      </p>

      <div className="mt-3 flex items-center gap-3">
        <Link
          href="/offer"
          onClick={() => track('campaign_card_click', { campaign: 'independence-2026' })}
          className="inline-flex items-center justify-center rounded-xl bg-stone-900 px-4 py-2.5 text-[13px] font-bold text-white active:scale-95"
        >
          Get my buddy →
        </Link>
        {/* The seat count is real (paid purchases counted against the 50) —
            and it is shown ONLY once enough are gone that the number carries
            urgency instead of announcing that nobody has bought. See
            mayShowSeatsLeft in lib/campaign.ts. */}
        {mayShowSeatsLeft(c.seatsLeft, c.slots) && (
          <span className="text-[11.5px] font-semibold text-stone-500">
            Only {c.seatsLeft} spots left
          </span>
        )}
      </div>
    </div>
  );
}
