'use client';

import { useEffect, useState } from 'react';
import { MoreVertical, Plus } from 'lucide-react';
import { AppleGlyph } from './app-store-card';

// Live install walkthrough (founder, 20 July): instead of describing the steps
// in words, DRAW the screens the student is looking at — browser bar, menu
// sheet, home screen — with a pulsing red circle on exactly the thing to tap.
// Pure CSS mock screens; crisp at any size, nothing to screenshot or maintain.
//
// Two routes now, because the two platforms genuinely differ (10 Aug 2026):
//   · Android → ⋮ menu → "Add to Home screen" (still a PWA install)
//   · iPhone  → the App Store, since the native app shipped
//
// They are separate components rather than one with `ios ?` on every line. The
// mixed version was already hard to read at three ternaries per step, and the
// routes no longer share a single step: keeping them apart is what stops an
// Android tweak from silently rewording the iPhone screen.

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

/** The CareerRai icon, as it appears on a home screen / in the App Store. */
function AppIcon({ size = 36 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl text-white shadow ring-1 ring-black/5"
      style={{
        width: size, height: size,
        background: 'linear-gradient(145deg,#f97316 0%,#ea580c 55%,#c2410c 100%)',
        fontSize: size * 0.36,
      }}
    >
      <span className="font-black">CR</span>
    </span>
  );
}

function HomeScreenStep({ n }: { n: number }) {
  return (
    <StepShell n={n} title="Open CareerRai from your Home Screen">
      <div className="flex items-end gap-3 rounded-lg border border-stone-200 bg-gradient-to-b from-sky-50 to-stone-100 px-3 py-2.5">
        <RedRing>
          <span className="flex flex-col items-center gap-0.5">
            <AppIcon />
            <span className="text-[8px] font-medium text-stone-600">CareerRai</span>
          </span>
        </RedRing>
        <span className="pb-2 text-[11px] text-stone-400">← this icon, every day</span>
      </div>
    </StepShell>
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

  // Drawing Share → Add to Home Screen for an iPhone would be teaching the
  // wrong route on the screen that comes RIGHT AFTER we sent them to the App
  // Store. Nothing confuses a student faster than a guide that contradicts the
  // button above it.
  return ios ? <AppStoreSteps /> : <AndroidSteps />;
}

// The iPhone route. Two of the three steps happen inside the App Store, so what
// this mostly does is reassure — "yes, the blue GET button, that's the one" —
// and then get them back into CareerRai signed in with the same number.
function AppStoreSteps() {
  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 text-left">
      <StepShell n={1} title="Tap the black App Store button above">
        <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-black text-white">
            <AppleGlyph className="h-3.5 w-3.5" />
          </span>
          <span className="text-[11.5px] font-medium text-stone-600">Opens the App Store app</span>
        </div>
      </StepShell>

      <StepShell n={2} title="Tap GET, then confirm">
        <div className="flex items-center gap-2.5 rounded-lg border border-stone-200 bg-white px-3 py-2">
          <AppIcon size={32} />
          <span className="min-w-0 flex-1 text-[11.5px] font-semibold text-stone-800">CareerRai</span>
          <RedRing>
            <span className="rounded-full bg-sky-600 px-3 py-1 text-[10.5px] font-bold uppercase tracking-wide text-white">
              Get
            </span>
          </RedRing>
        </div>
      </StepShell>

      <HomeScreenStep n={3} />
    </div>
  );
}

// The Android route — unchanged behaviour, just no longer interleaved with iOS.
function AndroidSteps() {
  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 text-left">
      <StepShell n={1} title="Tap the ⋮ menu (top-right)">
        <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-100 px-2.5 py-1.5">
          <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[10px] text-stone-500">careerrai.in</span>
          <RedRing><MoreVertical className="h-4 w-4 text-stone-700" /></RedRing>
        </div>
      </StepShell>

      <StepShell n={2} title="Tap 'Add to Home screen'">
        <div className="overflow-hidden rounded-lg border border-stone-200">
          <div className="border-b border-stone-100 bg-white px-3 py-1.5 text-[11px] text-stone-400">New tab · Bookmarks</div>
          <div className="flex items-center gap-2 bg-white px-3 py-2">
            <RedRing>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-stone-50 px-2 py-1">
                <Plus className="h-3.5 w-3.5 text-stone-700" />
                <span className="text-[11.5px] font-semibold text-stone-800">Add to Home screen</span>
              </span>
            </RedRing>
          </div>
        </div>
      </StepShell>

      <HomeScreenStep n={3} />
    </div>
  );
}
