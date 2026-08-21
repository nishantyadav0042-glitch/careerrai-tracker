'use client';

import { useEffect, useRef, useState } from 'react';
import { studyDayString } from '@/lib/study-day';
import { track } from '@/lib/journey';
import { Eye, X } from 'lucide-react';

// ── The daily insight, made possible to actually see ────────────────────────
//
// It was built as "a passing cloud" (25 Jul): drift in, stay 7 seconds, remove
// itself. Founder, 19 Aug: he never knew when an insight had appeared, and
// only ever caught it by accident. He is right, and there were FOUR
// compounding reasons, not one:
//
//   1. bg-white/95 on a white Home. No contrast at all.
//   2. fixed bottom-20 -- the bottom of the screen, below where attention is
//      while the plan is being read.
//   3. It auto-removed after 7 seconds.
//   4. Worst of all, it wrote its once-per-day "seen" key ON MOUNT, before the
//      student had looked at anything. So a student who glanced away for eight
//      seconds did not just miss it -- they were permanently marked as having
//      read it, and that day's insight never came back.
//
// (3) and (4) together mean the feature could be entirely invisible to a
// student while every metric said it had been delivered. Fixing the colour
// alone would not have fixed that.
//
// So it is no longer a toast. It is a card in the page flow, at the top of
// Home, above the plan, and it STAYS until the student dismisses it.
//
// DELIBERATELY NOT RED. Red reads as error, warning, failure -- and most
// insights are neutral or positive ("you have done Quant 4 days running").
// This codebase has already paid for that mistake once: J2 retired the red
// burnout and sleep flags after the sleep one fired 26 times at students who
// had logged nothing at all. Amber is an attention colour, not a danger
// colour. When an insight ever does carry a genuine intervention, THAT is the
// one that earns a different treatment -- and it should be a separate
// decision, not inherited from this card by default.

function seenKey(): string {
  return `cr_insight_seen_${studyDayString()}`;
}

/** Has THIS insight already made its entrance on this device? Keyed by the
 *  insight's own text, not by the day: a genuinely new insight arriving later
 *  the same day still deserves its moment, and the same one re-rendering
 *  never gets a second. */
function animKey(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return `cr_insight_anim_${h}`;
}
function alreadySeenThisInsight(title: string): boolean {
  try { return localStorage.getItem(animKey(title)) === '1'; } catch { return false; }
}

function alreadySeen(): boolean {
  try { return localStorage.getItem(seenKey()) === '1'; } catch { return false; }
}

export function InsightBubble({ title, text, kind }: { title: string; text: string; kind?: string }) {
  // Read once, on first render, so the card does not flash in and out when the
  // component re-renders for unrelated reasons.
  const [dismissed, setDismissed] = useState<boolean>(alreadySeen);
  // ENTRANCE (founder, 22 Aug): the insight should arrive, not merely exist.
  // It used to sit in the page like any other card, and a student never knew
  // CareerRai had noticed something today.
  //
  // Three rules keep this an attention moment instead of a nuisance:
  //   1. It animates for a NEW insight only. Re-opening the app on the same
  //      day renders it static — the same drop three times a day is how a
  //      product earns notification fatigue in a week.
  //   2. It never moves layout. The card holds its space from first paint and
  //      only its own transform/opacity animate, so nothing below it jumps
  //      under a thumb already reaching for the plan.
  //   3. prefers-reduced-motion gets the settled card immediately.
  //
  // Driven on the NODE, not through state. Toggling a class would mean
  // setState inside an effect (cascading renders, and a server/client
  // mismatch because the server cannot know whether this insight has already
  // animated on this device). Touching the DOM is what an effect is actually
  // for, and it keeps the rendered markup identical on both sides.
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    if (alreadySeenThisInsight(title)) return;         // same insight → static
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;

    el.style.transform = 'translateY(-1.5rem)';
    el.style.opacity = '0';
    const raf = requestAnimationFrame(() => {
      el.style.transition = 'transform 700ms ease-out, opacity 700ms ease-out';
      el.style.transform = 'translateY(0)';
      el.style.opacity = '1';
    });
    try { localStorage.setItem(animKey(title), '1'); } catch { /* storage blocked */ }
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Observability only (Batch 8, Task 4): shown/dismissed is the pair that
  // separates "delivered" from "read". The old toast could not record either.
  // NOTE: no localStorage write happens here -- marking-as-seen stays in the
  // dismiss handler and nowhere else; that separation is the whole fix.
  useEffect(() => {
    if (!dismissed) track('insight_shown', { kind: kind ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (dismissed) return null;

  function dismiss() {
    // The seen key is written HERE -- on a deliberate dismiss -- and nowhere
    // else. Marking it read on mount was the defect above.
    try { localStorage.setItem(seenKey(), '1'); } catch { /* storage blocked */ }
    track('insight_dismissed', { kind: kind ?? null });
    setDismissed(true);
  }

  return (
    <div
      role="status"
      ref={cardRef}
      className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-sm"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-amber-700/60 transition-colors hover:bg-amber-100 hover:text-amber-900"
        style={{ minWidth: 28, minHeight: 28 }}
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-3 pr-7">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-100">
          <Eye className="h-4 w-4 text-amber-700" />
        </span>
        <div className="min-w-0">
          {/* CareerRai Insight (founder, 22 Aug). It read "Rai noticed" —
              accurate about the mechanism, but it spent the moment on a
              sentence instead of on the brand. A student should build ONE
              association from this card: CareerRai is the system that
              understands me. The full name earns that; a clever half-name
              does not. */}
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
            ✨ CareerRai Insight
          </p>
          <p className="mt-1 text-[14px] font-bold leading-snug text-stone-900">{title}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-stone-700">{text}</p>
        </div>
      </div>
    </div>
  );
}
