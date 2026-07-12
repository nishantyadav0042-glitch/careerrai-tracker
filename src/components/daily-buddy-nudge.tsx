'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { UnlockBuddyButton } from '@/components/unlock-buddy-sheet';

// A gentle once-a-day nudge for students who don't have an IIM buddy yet —
// shown when they open the app, promoting what a buddy does. Throttled to one
// appearance per calendar day (localStorage), so it never feels naggy. The
// parent (student layout) only mounts this for buddy-less, non-premium students
// and only when no higher-priority modal (onboarding / post-signup / push ask)
// is on screen, so it can't stack.
const KEY = 'cr_buddy_nudge_date';

export function DailyBuddyNudge({ fullName }: { fullName?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- client-only daily gate */
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(KEY) !== today) {
      localStorage.setItem(KEY, today); // once per day, regardless of what they do next
      setShow(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
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
        <p className="mx-auto mt-1 max-w-xs text-center text-sm text-stone-600">
          Students with an IIM buddy stay consistent and actually fix their weak areas. Here&apos;s what a buddy does for you every day:
        </p>

        <ul className="mx-auto mt-4 max-w-xs space-y-2 text-sm text-stone-700">
          <li className="flex gap-2"><span>🎯</span> A plan for tomorrow, built from today&apos;s logs</li>
          <li className="flex gap-2"><span>📊</span> Every mock decoded with you — each error named</li>
          <li className="flex gap-2"><span>🎥</span> A weekly 1-on-1 video session</li>
        </ul>

        <div className="mt-5">
          <UnlockBuddyButton fullName={fullName} className="w-full">
            See how a buddy helps →
          </UnlockBuddyButton>
        </div>

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
