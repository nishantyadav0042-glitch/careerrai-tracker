'use client';

import { SIX_PROMISES } from '@/components/six-promises';

// The six-to-one, compressed for a stranger.
//
// Founder, 8 Aug: build it on the landing page too. The post-signup screen has
// a student's full attention and can afford six blocks; a landing page has
// about three seconds and shares the screen with a phone mockup and a CTA. So
// this is the same claim at a glance: the trade, the hour, and the six as
// chips rather than rows.
//
// It reads SIX_PROMISES rather than restating them. Two lists would drift
// within a week, and a stranger who signs up on one promise and meets a
// different one after signup has been sold something we did not deliver.
export function SixToOne() {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50/70 px-3.5 py-3">
      <p className="text-center text-[12.5px] font-bold leading-snug text-stone-900">
        Six jobs are ours. One is yours.
      </p>
      <p className="mt-0.5 text-center text-[11.5px] font-semibold text-orange-600">
        About an hour of your day, back
      </p>

      <div className="mt-2.5 flex flex-wrap justify-center gap-1">
        {SIX_PROMISES.map((p) => (
          <span
            key={p.n}
            className="rounded-md bg-white px-2 py-[3px] text-[10.5px] font-semibold text-stone-600 ring-1 ring-stone-200"
          >
            {p.head.charAt(0).toUpperCase() + p.head.slice(1)}
          </span>
        ))}
      </div>

      <p className="mt-2.5 text-center text-[11px] leading-snug text-stone-500">
        You just <b className="text-stone-800">study</b>.{' '}
        <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide text-white">
          All six free
        </span>
      </p>
    </div>
  );
}
