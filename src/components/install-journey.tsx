'use client';

import { useEffect, useState } from 'react';
import { Download, Share, Globe, X } from 'lucide-react';

// ONE clean install screen, forked by platform. No overlays, no arrows, no
// multi-button sheets — a single action each. Skippable (never blocks the app),
// so iOS / in-app-browser users who can't install cleanly are never trapped.
//
// Cadence (fix #1, 15 Jul 2026 — the biggest activation leak): install is the
// FINISH LINE of onboarding, not a once-a-day suggestion. Growth data showed
// 33 of 88 plan-built students never really installed and then never came back
// to log — no home-screen icon, no push, nothing to trigger tomorrow. So for a
// student the server KNOWS hasn't installed (`appInstalled === false`, set only
// by the standalone install-ping), this now shows once per BROWSING SESSION —
// persistent until the app is genuinely on the phone — instead of the old
// once/day throttle that let a browser-tab student drift for days. Once
// app_installed flips true it never renders again.
interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferredPrompt: BIPEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BIPEvent;
  });
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
}
function isIOS(): boolean {
  return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
}
function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent);
}
// Chrome / Samsung / Edge mint a clean, Play-Protect-safe install; other Android
// browsers and in-app webviews don't.
function androidCanInstall(): boolean {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/(FBAN|FBAV|Instagram|Line\/|MicroMessenger|UCBrowser|OPR\/|OPX\/|OperaMini|Firefox|FxiOS|; wv\))/i.test(ua)) return false;
  return /(Chrome|SamsungBrowser|EdgA)/.test(ua);
}
function openInChrome() {
  if (typeof window === 'undefined') return;
  const { host, pathname, search } = window.location;
  window.location.href = `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`;
}

type Journey = 'android-install' | 'android-chrome' | 'ios';

// Once per browsing session, keyed so it reappears on the next visit but not on
// every route change within one session.
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
  const [journey, setJourney] = useState<Journey | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- client capability check */
    if (appInstalled) return;    // server says it's genuinely installed — done forever
    if (isStandalone()) return;  // running inside the installed app right now
    let j: Journey | null = null;
    if (isIOS()) j = 'ios';
    else if (isAndroid()) j = androidCanInstall() ? 'android-install' : 'android-chrome';
    else return; // desktop → nothing, let other nudges run
    if (!claimThisSession()) return; // once per session, but every session until installed
    setJourney(j);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [appInstalled]);

  async function installAndroid() {
    setBusy(true);
    let prompt = deferredPrompt;
    if (!prompt) {
      // give Chrome a moment to fire the event
      prompt = await new Promise<BIPEvent | null>((res) => {
        if (deferredPrompt) return res(deferredPrompt);
        const t = setTimeout(() => res(deferredPrompt), 2500);
        const on = () => { clearTimeout(t); res(deferredPrompt); };
        window.addEventListener('beforeinstallprompt', on, { once: true });
      });
    }
    setBusy(false);
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice;
      deferredPrompt = null;
      setJourney(null);
    } else {
      openInChrome(); // criteria not met — send to Chrome
    }
  }

  async function iosGuide() {
    setBusy(true);
    // Mint a one-time token so the installed icon opens already logged in.
    try {
      const res = await fetch('/api/install/handoff', { method: 'POST' });
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
        return;
      }
    } catch { /* fall through */ }
    window.location.href = '/app';
  }

  if (!journey) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-900/50 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 text-center shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-900 text-3xl shadow-lg shadow-stone-900/15">📲</div>

        {planReady && (
          <p className="mx-auto mb-2 max-w-xs text-xs font-bold uppercase tracking-wide text-emerald-600">Your CAT plan is ready — one step left</p>
        )}

        {journey === 'android-install' && (
          <>
            <h2 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>{planReady ? 'Install to start Day 1' : 'Get the CareerRai app'}</h2>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-stone-500">{planReady ? 'Put your plan on your home screen — one tap · ~3 MB · daily reminders so you never lose the streak.' : 'One tap · ~3 MB · opens like a normal app, with your reminders.'}</p>
            <button type="button" onClick={installAndroid} disabled={busy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 py-3.5 text-[15px] font-bold text-white active:scale-[0.98] disabled:opacity-60">
              <Download className="h-5 w-5" /> {busy ? 'Opening…' : 'Install app'}
            </button>
          </>
        )}

        {journey === 'android-chrome' && (
          <>
            <h2 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Get the app in Chrome</h2>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-stone-500">This browser can&apos;t install it cleanly. Open in Chrome and it&apos;s one tap.</p>
            <button type="button" onClick={openInChrome}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 py-3.5 text-[15px] font-bold text-white active:scale-[0.98]">
              <Globe className="h-5 w-5" /> Open in Chrome
            </button>
          </>
        )}

        {journey === 'ios' && (
          <>
            <h2 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Add to your Home Screen</h2>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-stone-500">2 quick taps in Safari — then it opens like a real app, and you&apos;re already signed in.</p>
            <button type="button" onClick={iosGuide} disabled={busy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 py-3.5 text-[15px] font-bold text-white active:scale-[0.98] disabled:opacity-60">
              <Share className="h-5 w-5" /> {busy ? 'Opening…' : 'Show me the 2 taps'}
            </button>
          </>
        )}

        <button type="button" onClick={() => setJourney(null)} className="mt-2 w-full py-2.5 text-xs font-medium text-stone-400 hover:text-stone-600">
          Maybe later
        </button>
      </div>

      <button type="button" onClick={() => setJourney(null)} aria-label="Close" className="absolute right-4 top-4 hidden">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
