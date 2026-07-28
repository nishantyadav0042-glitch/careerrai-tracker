'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// One-time "what's new" announcement for EXISTING students when the topic-by-
// topic Mastery plan is switched on for everyone. Separate from the first-run
// AppTour (which only runs for brand-new installs) so the two never tangle.
// Shows once per device (localStorage), on the next Home visit, and only to a
// student who actually has the new plan enabled. Plain words, one tap to open.
const SEEN_KEY = 'cr_whatsnew_mastery_v1';

export function WhatsNewMastery({ enabled }: { enabled: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {
      return;
    }
    // Let the Home screen settle first so this doesn't fight other overlays.
    const t = setTimeout(() => setShow(true), 700);
    return () => clearTimeout(t);
  }, [enabled]);

  const dismiss = () => {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[96] flex items-end justify-center bg-slate-900/70 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="What's new">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-2xl" aria-hidden>🧗</span>
          <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500">New for you</p>
        </div>
        <h2 className="text-lg font-extrabold leading-snug text-stone-900">Your plan is now topic by topic</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
          Each section — Quant, DILR and VARC — now has its own plan that knows exactly
          where you are in every topic and tells you what to do next. Everything you&apos;ve
          done so far is already saved.
        </p>

        <ul className="mt-3 space-y-2">
          {[
            ['📈', 'See your progress topic by topic — from first concept to exam ready.'],
            ['👍', 'One tap after you study: “Got it” or “Need more”. That’s the whole update.'],
            ['⇄', 'Not feeling a topic today? Swap it — it comes back later, never lost.'],
          ].map(([icon, text]) => (
            <li key={text} className="flex items-start gap-2.5 text-[13px] leading-snug text-stone-700">
              <span className="shrink-0 text-base" aria-hidden>{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col gap-2">
          <Link
            href="/student/plan/qa"
            onClick={dismiss}
            className="w-full rounded-xl bg-stone-900 py-3 text-center text-sm font-bold text-white active:scale-[0.98]"
          >
            Open my new plan →
          </Link>
          <button type="button" onClick={dismiss} className="w-full py-1.5 text-xs font-medium text-stone-500 hover:text-stone-700">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
