'use client';

import { useEffect, useState } from 'react';
import { Download, Share, Globe, X } from 'lucide-react';
import { claimDailyModal } from '@/lib/daily-modal';

// ONE clean install screen, forked by platform, shown once/day after login for
// browser (non-installed) users. No overlays, no arrows, no multi-button sheets
// — a single action each. Skippable (never blocks the app).
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

export function InstallJourney() {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- client capability check */
    if (isStandalone()) return; // already installed
    let j: Journey | null = null;
    if (isIOS()) j = 'ios';
    else if (isAndroid()) j = androidCanInstall() ? 'android-install' : 'android-chrome';
    else return; // desktop → nothing, let other nudges run
    if (!claimDailyModal()) return; // one modal/day
    setJourney(j);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

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

        {journey === 'android-install' && (
          <>
            <h2 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Get the CareerRai app</h2>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-stone-500">One tap · ~3 MB · opens like a normal app, with your reminders.</p>
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
