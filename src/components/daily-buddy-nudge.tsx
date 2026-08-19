'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { UnlockBuddyButton } from '@/components/unlock-buddy-sheet';
import { claimDailyModal } from '@/lib/daily-modal';
import { TOUR_DONE_EVENT, NOTIF_ASK_SETTLED_EVENT, INSIGHT_DONE_EVENT, tourDone, notifAskVisible, insightVisible, logModalOpen } from '@/lib/first-run-events';

// A gentle once-a-day nudge for students who don't have an IIM buddy yet.
// Throttled to one appearance per calendar day (localStorage). The parent
// (student layout) only mounts this for buddy-less, non-premium students.
//
// Founder order (21 July — it used to stack ON TOP of the running app tour):
// this is LAST in the first-run queue. It waits for (1) the notification ask
// to settle, (2) the app tour to be completed, and (3) the log modal to not
// be open — and only THEN claims the daily-modal slot, so a blocked attempt
// doesn't burn today's slot.
export function DailyBuddyNudge({ fullName }: { fullName?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let shown = false;
    const attempt = () => {
      if (shown) return;
      if (timer) clearTimeout(timer);
      // 1.4s settle: lets the notif ask evaluate and the first-log prompt
      // (700ms after tour) claim the screen first if it's going to.
      timer = setTimeout(() => {
        if (shown || !tourDone() || notifAskVisible() || insightVisible() || logModalOpen()) return;
         
        if (claimDailyModal()) { shown = true; setShow(true); }
      }, 1400);
    };
    attempt();
    window.addEventListener(TOUR_DONE_EVENT, attempt);
    window.addEventListener(NOTIF_ASK_SETTLED_EVENT, attempt);
    window.addEventListener(INSIGHT_DONE_EVENT, attempt);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(TOUR_DONE_EVENT, attempt);
      window.removeEventListener(NOTIF_ASK_SETTLED_EVENT, attempt);
      window.removeEventListener(INSIGHT_DONE_EVENT, attempt);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-stone-900/50 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={() => setShow(false)}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setShow(false)}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-2xl shadow">🤝</div>
        <h2 className="text-center text-lg font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Don&apos;t prep alone
        </h2>
        {/* Says what a buddy DOES, not what it causes. The line this replaced
            asserted an outcome — that having a buddy makes students consistent
            and fixes their weak areas — on the strength of 7 premium students
            and 1 session request. The mechanism below is true today and needs
            no cohort to prove it. Deliberately NOT quoting the retired claim
            here: buddy-entry-rung.test.ts guards this file at the source level
            and cannot tell a comment from rendered JSX, so reproducing the
            forbidden string would keep that guard red forever. */}
        <p className="mx-auto mt-1 max-w-xs text-center text-sm text-stone-600">
          An IIM senior who has cleared CAT, working on your prep with you. Here&apos;s what that looks like:
        </p>

        <ul className="mx-auto mt-4 max-w-xs space-y-2 text-sm text-stone-700">
          <li className="flex gap-2"><span>🎯</span> A plan for tomorrow, built from today&apos;s study</li>
          <li className="flex gap-2"><span>📊</span> Every mock decoded with you — each error named</li>
          <li className="flex gap-2"><span>🎥</span> A weekly 1-on-1 video session</li>
        </ul>

        <div className="mt-5">
          <UnlockBuddyButton fullName={fullName} className="w-full">
            See how a buddy helps →
          </UnlockBuddyButton>
        </div>

        {/* The entry rung. A student who is not ready for ₹999+ can buy ONE
            session instead of nothing — the cheapest real step, which existed
            in the product but appeared nowhere on this path.
            It LINKS rather than sells: BookSessionCard checks mentor
            availability before it renders a button, and total capacity is 21
            sessions a week. Charging from here would sell time the mentors
            cannot give, which is precisely what that card exists to prevent. */}
        <Link
          href="/student/buddy"
          onClick={() => setShow(false)}
          className="mt-3 block rounded-xl border border-stone-200 px-4 py-2.5 text-center text-[13px] text-stone-700 transition-colors hover:border-stone-400"
        >
          Not ready for that? <span className="font-semibold text-stone-900">Try one session — ₹299</span>
        </Link>

        <button
          type="button"
          onClick={() => setShow(false)}
          className="mt-2 w-full text-center text-xs text-stone-400 hover:text-stone-600"
        >
          Maybe tomorrow
        </button>
      </div>
    </div>
  );
}
