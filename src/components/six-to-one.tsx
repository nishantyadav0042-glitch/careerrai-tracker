'use client';

import { BookOpen, ListChecks, RotateCcw, Target, PieChart, Moon } from 'lucide-react';
import { SIX_PROMISES } from '@/components/six-promises';

// The six-to-one, compressed for a stranger.
//
// Founder, 8 Aug: build it on the landing page too. The post-signup screen has
// a student's full attention and can afford six blocks; a landing page has
// about three seconds and shares the screen with a CTA. So this is the same
// claim at a glance.
//
// REDESIGNED 15 Aug — founder: the landing hero was "too busy", the phone
// mockup forced a scroll, and the six sat as loose pills competing for
// attention rather than reading as one settled fact. This is no longer a
// second card fighting the hero for weight: six plain rows, one icon each,
// a hairline between them — read top to bottom like a list of things already
// handled, not six separate claims to individually notice. The "about an
// hour back" line and the all-caps free badge are gone from here; the hour
// is proven later, after signup, once there is a real log to prove it
// against (see value-proof.ts) — a claim a stranger cannot check is the one
// they learn to scroll past.
//
// Icons are INDEX-matched to SIX_PROMISES, not text-matched — the two lists
// can never drift apart in wording (both read from SIX_PROMISES), but if
// their order ever changes the icon changes with it rather than silently
// pointing at the wrong row.
const ICONS = [BookOpen, ListChecks, RotateCcw, Target, PieChart, Moon];

export function SixToOne() {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      {SIX_PROMISES.map((p, i) => {
        const Icon = ICONS[i];
        return (
          <div
            key={p.n}
            className={`flex items-center gap-2.5 px-3.5 py-2 ${i > 0 ? 'border-t border-stone-100' : ''}`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-50">
              <Icon className="h-3 w-3 text-orange-600" strokeWidth={2.25} aria-hidden="true" />
            </span>
            <p className="text-[13px] font-semibold leading-tight text-stone-800">
              {p.head.charAt(0).toUpperCase() + p.head.slice(1)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
