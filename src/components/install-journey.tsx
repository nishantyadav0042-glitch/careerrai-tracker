'use client';

import { useEffect, useState } from 'react';
import { Download, Globe, MoreVertical } from 'lucide-react';
import { track } from '@/lib/journey';
import { useInstall } from '@/lib/install/use-install';
import { AppStoreCard } from '@/components/install/app-store-card';

// ONE clean install screen, forked by platform — now a thin UI over the
// unified install engine (src/lib/install). No overlays, no arrows, no
// multi-button sheets — a single action each. Skippable (never blocks the app).
//
// Cadence (fix #1, 15 Jul 2026 — the biggest activation leak): install is the
// FINISH LINE of onboarding, not a once-a-day suggestion. For a student the
// server KNOWS hasn't installed (`appInstalled === false`, set only by the
// standalone install-ping), this shows once per BROWSING SESSION — persistent
// until the app is genuinely on the phone. Once app_installed flips true it
// never renders again.
//
// The engine decides WHAT the one button does: native Chromium prompt,
// escape-to-Chrome/Safari for in-app browsers, or the guided A2HS page (which
// carries the one-time login hand-off token).

const SESSION_KEY = 'cr_install_journey_shown';
function claimThisSession(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return false;
    sessionStorage.setItem(SESSION_KEY, '1');
    return true;
  } catch {
    return true; // storage blocked (private mode) — better to show than to hide
  }
}

interface InstallJourneyProps {
  // Server truth from profiles.app_installed (set only by the standalone
  // install-ping). When true, the app is genuinely on the phone — never nag.
  appInstalled?: boolean;
  // Onboarding finished — lets the copy anchor to the plan the student just
  // built ("your plan is ready") instead of a generic app pitch.
  planReady?: boolean;
}

export function InstallJourney({ appInstalled = false, planReady = false }: InstallJourneyProps) {
  const { ui, strategy, env, install, busy, ready, installed } = useInstall();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- session gate is client-only */
    if (appInstalled) return;          // server says it's genuinely installed — done forever
    if (!ready || installed) return;   // engine says standalone/installed right now
    if (ui === 'hidden' || ui === 'unsupported') return; // nothing useful to offer
    if (env.platform === 'desktop') return; // mobile activation flow only
    if (!claimThisSession()) return;   // once per session, every session until installed
    setOpen(true);
    track('install_prompt_shown', { journey: strategy, planReady });
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!open) return null;

  // Copy + icon per engine decision — the button always calls install().
  const isEscape = ui === 'escape-sheet';
  const isAppStore = ui === 'ios-app-store';
  const heading = isEscape
    ? `Get the app in ${env.platform === 'android' ? 'Chrome' : 'Safari'}`
    : isAppStore
      ? (planReady ? 'Your plan is ready — get the app' : 'CareerRai for iPhone')
      : planReady ? 'Install to start Day 1' : 'Get the CareerRai app';
  const sub = isEscape
    ? `This browser can’t install it cleanly. One tap opens ${env.platform === 'android' ? 'Chrome' : 'Safari'} on this same page.`
    : isAppStore
    ? 'Download it from the App Store — your reminders, streak and daily insight only reach you through the app.'
    : planReady
        ? 'Put your plan on your Home Screen — one tap · ~3 MB · daily reminders so you never lose the streak.'
        : 'One tap · ~3 MB · opens like a normal app, with your reminders.';
  const cta = isEscape
    ? 'Open in Chrome'
    : ui === 'android-guide' ? 'Show me how' : 'Install app';
  const Icon = isEscape ? Globe : ui === 'android-guide' ? MoreVertical : Download;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-900/50 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 text-center shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-900 text-3xl shadow-lg shadow-stone-900/15">📲</div>

        {planReady && !isEscape && (
          <p className="mx-auto mb-2 max-w-xs text-xs font-bold uppercase tracking-wide text-emerald-600">Your CAT plan is ready — one step left</p>
        )}

        <h2 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>{heading}</h2>
        <p className="mx-auto mt-1.5 max-w-xs text-sm text-stone-500">{sub}</p>

        {/* iPhone gets the real App Store card here too, not a stone-black
            lookalike. One control for one action, everywhere in the product. */}
        {isAppStore ? (
          <div className="mt-5">
            <AppStoreCard onInstall={() => void install()} busy={busy} />
          </div>
        ) : (
          <button
            type="button"
            onClick={install}
            disabled={busy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 py-3.5 text-[15px] font-bold text-white active:scale-[0.98] disabled:opacity-60"
          >
            <Icon className="h-5 w-5" /> {busy ? 'Opening…' : cta}
          </button>
        )}

        <button
          type="button"
          onClick={() => { track('install_dismissed', { journey: strategy }); setOpen(false); }}
          className="mt-2 w-full py-2.5 text-xs font-medium text-stone-400 hover:text-stone-600"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
