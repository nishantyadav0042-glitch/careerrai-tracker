'use client';

import { useEffect, useState } from 'react';
import { MoreVertical, Share, Plus, SquarePlus } from 'lucide-react';

// Live install walkthrough (founder, 20 July): instead of describing the
// steps in words, DRAW the screens the student is looking at — browser bar,
// menu sheet, home screen — with a pulsing red circle on exactly the thing to
// tap. Platform-aware: Android gets the ⋮ → "Add to Home screen" route,
// iPhone gets Share → "Add to Home Screen". Pure CSS mock screens — crisp at
// any size, nothing to screenshot or maintain.

function RedRing({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-flex">
      {children}
      <span className="pointer-events-none absolute -inset-1.5 animate-pulse rounded-full border-[2.5px] border-red-500" />
    </span>
  );
}

function StepShell({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[11px] font-bold text-white">{n}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-stone-800">{title}</p>
        <div className="mt-1.5">{children}</div>
      </div>
    </div>
  );
}

export function InstallLiveGuide() {
  const [ios, setIos] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect -- platform detection must run client-side after mount */
  useEffect(() => {
    const ua = navigator.userAgent || '';
    setIos(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 text-left">
      {/* Step 1 — where to tap in the browser bar */}
      <StepShell n={1} title={ios ? 'In Safari, tap the Share button' : 'Tap the ⋮ menu (top-right)'}>
        <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-100 px-2.5 py-1.5">
          <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[10px] text-stone-500">careerrai.in</span>
          {ios ? (
            <RedRing><Share className="h-4 w-4 text-sky-600" /></RedRing>
          ) : (
            <RedRing><MoreVertical className="h-4 w-4 text-stone-700" /></RedRing>
          )}
        </div>
      </StepShell>

      {/* Step 2 — the menu row to tap */}
      <StepShell n={2} title={ios ? "Tap 'Add to Home Screen'" : "Tap 'Add to Home screen'"}>
        <div className="overflow-hidden rounded-lg border border-stone-200">
          <div className="border-b border-stone-100 bg-white px-3 py-1.5 text-[11px] text-stone-400">{ios ? 'Copy · Add to Reading List' : 'New tab · Bookmarks'}</div>
          <div className="flex items-center gap-2 bg-white px-3 py-2">
            <RedRing>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-stone-50 px-2 py-1">
                {ios ? <SquarePlus className="h-3.5 w-3.5 text-stone-700" /> : <Plus className="h-3.5 w-3.5 text-stone-700" />}
                <span className="text-[11.5px] font-semibold text-stone-800">{ios ? 'Add to Home Screen' : 'Add to Home screen'}</span>
              </span>
            </RedRing>
          </div>
        </div>
      </StepShell>

      {/* Step 3 — open it from the Home Screen */}
      <StepShell n={3} title="Open CareerRai from your Home Screen">
        <div className="flex items-end gap-3 rounded-lg border border-stone-200 bg-gradient-to-b from-sky-50 to-stone-100 px-3 py-2.5">
          <RedRing>
            <span className="flex flex-col items-center gap-0.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-[13px] font-black text-white shadow">CR</span>
              <span className="text-[8px] font-medium text-stone-600">CareerRai</span>
            </span>
          </RedRing>
          <span className="pb-2 text-[11px] text-stone-400">← this icon, every day</span>
        </div>
      </StepShell>
    </div>
  );
}
