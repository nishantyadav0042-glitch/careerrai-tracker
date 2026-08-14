'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, Flag, BookOpen, ListChecks, RotateCcw, TrendingUp, PieChart, type LucideIcon } from 'lucide-react';
import { Logo } from '@/components/logo';
import { InstallButton } from '@/components/install/install-button';
import { SixToOne } from '@/components/six-to-one';

// Public landing at "/". REBUILT 14 Aug — founder: the first screen was too
// busy, and the phone mockup pushed the actual pitch and the CTA below the
// fold, forcing a scroll before a stranger understood anything. The whole
// point of a first screen is that nobody has to scroll to get it.
//
// One idea, three seconds: CareerRai plans, the student studies. Everything
// on screen exists to say that once, clearly — not to also demonstrate the
// product, list every benefit, and pitch pricing in the same breath. So the
// hero keeps exactly the promise → the six proof points → the trade → the
// CTA → the login door, and nothing competes with any of it for attention:
//   · no phone mockup as the dominant visual (it forced the scroll)
//   · no "about an hour back" claim here — unprovable to a stranger who has
//     never used the product; value-proof.ts makes that claim later, to a
//     real student, against their own logged data
//   · the six read as one settled list (see six-to-one.tsx), not six pills
//     competing for individual attention
//   · one CTA, one login link — not a second card arguing the same case
//
// The "live" strip below the six is the one place a product glimpse still
// belongs, deliberately undersized and delayed: it sits inside the layout
// from the first paint (so nothing shifts or grows the page later) but stays
// invisible for ~3.4s, after the headline and the CTA have already landed —
// then it fades in and quietly cycles through six real data shapes the
// product actually produces. A demonstration, not a distraction.
const ROTATION: { Icon: LucideIcon; label: string; value: string }[] = [
  { Icon: Flag, label: 'Target date', value: '17 Sept' },
  { Icon: BookOpen, label: 'Today', value: 'Ratio & Proportion · 40m' },
  { Icon: ListChecks, label: 'Backlog', value: 'Geometry carried over' },
  { Icon: RotateCcw, label: 'Revision due', value: 'Reading Comprehension' },
  { Icon: TrendingUp, label: 'Latest mock', value: '92.4%ile · +6.1' },
  { Icon: PieChart, label: 'Syllabus', value: '61% covered' },
];
const ROTATE_MS = 2400;
// Long enough that the headline, the six and the CTA have already been read
// before anything else asks for attention; short enough that a stranger who
// lingers still sees the product move at least once.
const REVEAL_DELAY_MS = 3400;

export default function WelcomePage() {
  // Account deletion lands here with ?deleted=1 — the loudest action a user can
  // take deserves explicit confirmation (Apple 5.1.1(v)), not a silent redirect.
  const [deleted, setDeleted] = useState(false);
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL is client-only */
    try { if (new URLSearchParams(window.location.search).get('deleted') === '1') setDeleted(true); } catch { /* ignore */ }
  }, []);

  const [revealed, setRevealed] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only capability read */
      setRevealed(true);
      return;
    }
    const t = setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!revealed || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setActive((i) => (i + 1) % ROTATION.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [revealed]);

  const { Icon, label, value } = ROTATION[active];

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white text-stone-900">

      {deleted && (
        <div className="shrink-0 bg-emerald-50 px-6 py-3 text-center">
          <p className="text-sm font-semibold text-emerald-800">
            Your account and all your data have been permanently deleted. You&apos;ve been signed out.
          </p>
          <button type="button" onClick={() => setDeleted(false)} className="mt-1 text-xs font-medium text-emerald-700 underline underline-offset-2">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col justify-center px-6 py-4">
        <div className="mx-auto w-full max-w-xs">

          <div className="flex justify-center">
            <Logo size="sm" tagline={false} />
          </div>

          {/* THE promise. Everything below exists only to make this believable
              in three seconds, never to add a second idea next to it. */}
          <h1
            className="mt-4 text-center text-[24px] font-bold leading-[1.12] text-stone-900"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            Six jobs are ours.
            <br />
            <span className="text-orange-600">One job is yours.</span>
          </h1>

          <div className="mt-2.5 flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-orange-600" strokeWidth={2.5} aria-hidden="true" />
            <p className="text-[12px] font-semibold text-stone-500">We handle these six for you</p>
          </div>

          <div className="mt-2.5">
            <SixToOne />
          </div>

          {/* The live strip — see the file header for the stage-1/stage-2
              reasoning. min-height reserved from first paint so revealing it
              never shifts anything below; it only ever fades. Hidden below a
              700px viewport (an iPhone SE, the shortest phone this product
              still supports) — the promise, the six and both CTAs are the
              part that must never scroll out of reach; this is the bonus. */}
          <div className="live-strip mt-2.5 min-h-[42px]">
            <div
              className={`flex items-center gap-2 rounded-xl border border-stone-100 bg-stone-50 px-3 py-1.5 transition-opacity duration-500 ${revealed ? 'opacity-100' : 'opacity-0'}`}
              aria-hidden={!revealed}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100">
                <Icon className="h-3.5 w-3.5 text-orange-600" strokeWidth={2.25} aria-hidden="true" />
              </span>
              <div key={label} className="min-w-0 animate-[fadeIn_0.4s_ease]">
                <p className="text-[8.5px] font-bold uppercase tracking-wider text-stone-400">{label}</p>
                <p className="truncate text-[12px] font-bold leading-tight text-stone-800">{value}</p>
              </div>
              <span className="ml-auto flex shrink-0 items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Live
              </span>
            </div>
          </div>

          {/* The trade, stated once. */}
          <div className="mt-3 text-center">
            <p className="text-[16px] font-bold leading-snug text-stone-900">
              Your job is just to <span className="text-orange-600">study</span>.
            </p>
            <p className="mt-0.5 text-[12px] text-stone-400">Completely free. No credit card.</p>
          </div>

        </div>
      </div>

      <div className="sticky bottom-0 shrink-0 border-t border-stone-100 bg-white/95 px-6 pb-5 pt-3.5 backdrop-blur">
        <div className="mx-auto w-full max-w-xs space-y-2">
          <Link
            href="/start"
            className="flex w-full items-center justify-center rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white shadow-lg shadow-stone-900/15 transition-transform active:scale-[0.98]"
          >
            Build my CAT plan — free →
          </Link>
          {/* THE LOGIN DOOR. NEVER REMOVE IT, NEVER MAKE IT FINE PRINT.
              This page is the landing screen for EVERY logged-out arrival —
              root redirects here — and it shipped with no route to /login at
              all. The only button was the student signup funnel, so anyone
              who already has an account (a buddy on a new phone, a student
              whose session lapsed, a store reviewer holding demo credentials)
              was locked out of their own product.
              /start carries the same door in triplicate because an
              unreachable login is the Guideline 2.1 rejection we already took
              (Incident #10). /welcome was later placed IN FRONT of /start and
              never inherited the rule — this closes that gap. See #18. */}
          <Link
            href="/login"
            prefetch={false}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-stone-300 bg-white py-3 text-[13px] font-semibold text-stone-700 transition-colors hover:border-stone-900 hover:text-stone-900"
          >
            Already have an account? <span className="underline underline-offset-2">Log in</span>
          </Link>
          {/* Install + legal below the two real CTAs, on purpose: the request
              was ONE promise → ONE explanation → ONE CTA → ONE login option,
              nothing else competing in the primary decision. These still need
              a route to exist (a store reviewer or payment provider lands
              here first, and the paywall sits behind login) — they just don't
              need to be inside the three-second pitch. */}
          <InstallButton variant="text" />
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-0.5 text-[11px] text-stone-400">
            <Link href="/pricing" className="hover:text-stone-600 hover:underline">Pricing</Link>
            <span aria-hidden>·</span>
            <Link href="/refunds" className="hover:text-stone-600 hover:underline">Refunds</Link>
            <span aria-hidden>·</span>
            <Link href="/terms" className="hover:text-stone-600 hover:underline">Terms</Link>
            <span aria-hidden>·</span>
            <Link href="/privacy" className="hover:text-stone-600 hover:underline">Privacy</Link>
            <span aria-hidden>·</span>
            <Link href="/contact" className="hover:text-stone-600 hover:underline">Contact</Link>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-height: 700px) { .live-strip { display: none; } }
      `}</style>
    </div>
  );
}
