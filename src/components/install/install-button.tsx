'use client';

// The ONE button. Same label everywhere ("Install app"); the InstallManager
// decides what actually happens per environment (native prompt, iOS coachmark
// via /app, Android guide, or an in-app-browser escape). It hides itself when
// the app is already installed / running standalone.
//
// This is the consolidated replacement for the ad-hoc install triggers. It is
// additive: drop it in anywhere an install CTA is wanted. Existing components
// keep working until they are migrated to it.

import { Download, Share, Globe, Smartphone } from 'lucide-react';
import { useInstall } from '@/lib/install/use-install';

type Variant = 'card' | 'banner' | 'text';

export function InstallButton({ variant = 'card' }: { variant?: Variant }) {
  const { ui, install, busy, ready, env } = useInstall();

  // Nothing to show once it's installed, or before the client read settles
  // (prevents an SSR flash of the wrong label).
  if (!ready || ui === 'hidden') return null;

  const label = labelFor(ui, env.platform);
  const Icon = iconFor(ui);

  if (variant === 'text') {
    return (
      <button
        type="button"
        onClick={install}
        disabled={busy}
        className="mx-auto block text-xs font-medium text-stone-400 transition-colors hover:text-orange-600 disabled:opacity-60"
      >
        {busy ? '…' : `(${label} — no signup, ~3 MB →)`}
      </button>
    );
  }

  if (variant === 'banner') {
    return (
      <button
        type="button"
        onClick={install}
        disabled={busy}
        className="group relative block w-full overflow-hidden rounded-2xl p-[1.5px] shadow-lg shadow-orange-900/10 disabled:opacity-90"
        style={{ background: 'linear-gradient(90deg, #ea580c 0%, #d97706 55%, #f59e0b 100%)' }}
      >
        <div className="flex items-center justify-between gap-3 rounded-[15px] bg-gradient-to-r from-orange-600 to-amber-500 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/20 text-white">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 text-left">
              <p className="text-sm font-bold text-white">{label}</p>
              <p className="mt-0.5 text-xs text-orange-50">Just ~3 MB · installs in seconds · one-tap access</p>
            </div>
          </div>
          <span className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-orange-700 transition-transform group-active:scale-95">
            {busy ? '…' : 'Install'}
          </span>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={install}
      disabled={busy}
      className="group flex w-full items-center gap-3 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 text-left shadow-sm transition-all hover:border-orange-300 hover:shadow-md active:scale-[0.99] disabled:opacity-80"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-stone-900">{label}</p>
        <p className="mt-0.5 text-xs text-stone-500">{subFor(ui)}</p>
      </div>
      <Smartphone className="h-4 w-4 shrink-0 text-orange-600" />
    </button>
  );
}

function labelFor(ui: ReturnType<typeof useInstall>['ui'], platform: string): string {
  if (ui === 'escape-sheet') return platform === 'android' ? 'Open in Chrome to install' : 'Open in Safari to install';
  return 'Install the CareerRai app';
}

function subFor(ui: ReturnType<typeof useInstall>['ui']): string {
  switch (ui) {
    case 'escape-sheet': return 'This browser can’t install it — we’ll switch you over.';
    case 'ios-coachmark': return 'Two quick taps · ~3 MB · opens like a real app.';
    case 'android-guide': return 'From your browser menu · ~3 MB · one-tap access.';
    default: return 'Just ~3 MB · add it to your Home Screen for one-tap access.';
  }
}

function iconFor(ui: ReturnType<typeof useInstall>['ui']) {
  if (ui === 'escape-sheet') return Globe;
  if (ui === 'ios-coachmark') return Share;
  return Download;
}
