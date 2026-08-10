'use client';

import { Check } from 'lucide-react';

// The iPhone install card.
//
// Founder, 10 Aug: "don't put a direct link — create a button, something
// premium." A bare apps.apple.com URL in the middle of onboarding reads as a
// forwarded WhatsApp message, and a student who has just handed over their CAT
// date does not tap raw links. So this is a proper product surface: our icon,
// our claim, and the one control everybody on earth already knows how to use.
//
// Design notes, all deliberate:
//  · BLACK, not our orange. Every App Store button a student has ever tapped is
//    black. Recognition beats brand consistency on the one control whose entire
//    job is "this is safe, I know what this does".
//  · The Apple glyph is drawn inline as an SVG path, not fetched — a strict CSP
//    plus an offline-first PWA means a remote badge image would be the one
//    element that fails to render on a slow Indian 4G connection, on the exact
//    screen where hesitation costs us the install.
//  · Three proof lines, not a paragraph. "Free", "~10 MB", "No ads" answers the
//    three things a CAT aspirant actually pauses over before installing.

export function AppleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" aria-hidden="true" className={className} fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

const PROOF = ['Free to install', '~10 MB', 'No ads, ever'];

export function AppStoreCard({ onInstall, busy }: { onInstall: () => void; busy?: boolean }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.14)]">
      {/* App identity — icon, name, seller. The same three things the App Store
          itself shows first, so the card and the destination feel continuous. */}
      <div className="flex items-center gap-3.5 p-4 pb-3.5">
        {/* The same mark the install guide draws two screens later. They used
            to disagree (📈 here, "CR" there) — two faces for one icon is
            exactly what makes a student pause and check they are downloading
            the right app. */}
        <div
          className="grid h-14 w-14 shrink-0 place-items-center rounded-[15px] text-[19px] font-black text-white shadow-sm ring-1 ring-black/5"
          style={{ background: 'linear-gradient(145deg,#f97316 0%,#ea580c 55%,#c2410c 100%)' }}
        >
          CR
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold leading-tight text-stone-900">CareerRai</p>
          <p className="mt-0.5 truncate text-[12px] leading-tight text-stone-500">
            Your CAT plan, mentor and streak
          </p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-stone-400">
            On the App Store
          </p>
        </div>
      </div>

      {/* Proof row — the three objections, answered before they are raised. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 pb-3.5">
        {PROOF.map((p) => (
          <span key={p} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-stone-600">
            <Check className="h-3 w-3 shrink-0 text-emerald-600" strokeWidth={3} />
            {p}
          </span>
        ))}
      </div>

      {/* The control. Black, full-width, unmissable. */}
      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={onInstall}
          disabled={busy}
          className="group flex w-full items-center justify-center gap-2.5 rounded-2xl bg-black py-4 text-white shadow-lg shadow-black/15 transition-transform active:scale-[0.985] disabled:opacity-70"
        >
          <AppleGlyph className="h-[19px] w-[19px] -translate-y-[1px]" />
          <span className="text-[15px] font-semibold tracking-tight">
            {busy ? 'Opening the App Store…' : 'Download on the App Store'}
          </span>
        </button>
      </div>
    </div>
  );
}
