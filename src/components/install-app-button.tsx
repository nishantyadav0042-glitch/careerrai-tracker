'use client';
import { useEffect, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Capture beforeinstallprompt at module load — Chrome can fire it BEFORE React
// mounts, so a component-effect listener often misses it.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event('cr-installable'));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new Event('cr-installed'));
    // Forward the student into the app after install instead of stranding them.
    if (!isStandalone()) {
      window.setTimeout(() => { window.location.href = '/student/tracker'; }, 700);
    }
  });
}

function waitForInstallPrompt(timeoutMs: number): Promise<BeforeInstallPromptEvent | null> {
  if (deferredPrompt) return Promise.resolve(deferredPrompt);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: BeforeInstallPromptEvent | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('cr-installable', onReady);
      resolve(v);
    };
    const onReady = () => finish(deferredPrompt);
    const timer = setTimeout(() => finish(null), timeoutMs);
    window.addEventListener('cr-installable', onReady);
  });
}

function isIOS(): boolean {
  return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
}
function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent);
}
// Chrome / Samsung / Edge produce a clean, Play-Protect-safe install; OEM/in-app
// browsers don't.
function androidCanInstall(): boolean {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (!/Android/.test(ua)) return false;
  if (/(FBAN|FBAV|Instagram|Line\/|MicroMessenger|UCBrowser|OPR\/|OPX\/|OperaMini|Firefox|FxiOS|; wv\))/i.test(ua)) return false;
  return /(Chrome|SamsungBrowser|EdgA)/.test(ua);
}
function openInChrome() {
  if (typeof window === 'undefined') return;
  const { host, pathname, search } = window.location;
  window.location.href = `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`;
}
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

/**
 * "Install the app" trigger. One simple action, no overlays:
 *  • Android (Chrome-like) → the native one-tap install prompt.
 *  • Android (other browser) → reopen in Chrome.
 *  • iOS → the /app guide (Add to Home Screen, with logged-in hand-off).
 */
export function InstallAppButton({ variant = 'card' }: { variant?: 'card' | 'banner' | 'text' }) {
  const [hidden, setHidden] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- capability detection runs client-side */
    if (isStandalone()) { setHidden(true); return; }
    setHidden(false);
    const onInstalled = () => setHidden(true);
    window.addEventListener('cr-installed', onInstalled);
    return () => window.removeEventListener('cr-installed', onInstalled);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function handleClick() {
    // iOS has no install API → the guided Add-to-Home-Screen page (mints a
    // one-time token so the installed app opens logged in).
    if (isIOS()) {
      setWorking(true);
      try {
        const res = await fetch('/api/install/handoff', { method: 'POST' });
        if (res.ok) { const { url } = await res.json(); window.location.href = url; return; }
      } catch { /* fall through */ }
      window.location.href = '/app';
      return;
    }

    // Android / desktop → native one-tap prompt if available.
    let prompt = deferredPrompt;
    if (!prompt) {
      setWorking(true);
      prompt = await waitForInstallPrompt(3000);
      setWorking(false);
    }
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice;
      deferredPrompt = null;
      return;
    }
    // No prompt: OEM/in-app Android → Chrome; everything else → the guide page.
    if (isAndroid() && !androidCanInstall()) openInChrome();
    else window.location.href = '/app';
  }

  if (hidden) return null;

  if (variant === 'text') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={working}
        className="mx-auto block text-xs font-medium text-stone-400 hover:text-orange-600 transition-colors disabled:opacity-60"
      >
        {working ? '…' : '(Just want to try it? Install the app — no signup, ~3 MB →)'}
      </button>
    );
  }

  if (variant === 'banner') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={working}
        className="group relative block w-full overflow-hidden rounded-2xl p-[1.5px] shadow-lg shadow-orange-900/10 disabled:opacity-90"
        style={{ background: 'linear-gradient(90deg, #ea580c 0%, #d97706 55%, #f59e0b 100%)' }}
      >
        <div className="flex items-center justify-between gap-3 rounded-[15px] bg-gradient-to-r from-orange-600 to-amber-500 px-4 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20 border border-white/30 text-white">
              <Download className="w-5 h-5" />
            </span>
            <div className="min-w-0 text-left">
              <p className="text-sm font-bold text-white">Install the CareerRai app</p>
              <p className="text-xs text-orange-50 mt-0.5">Just ~3 MB · installs in seconds · one-tap access</p>
            </div>
          </div>
          <span className="text-xs font-bold text-orange-700 bg-white rounded-lg px-3 py-1.5 shrink-0 group-active:scale-95 transition-transform">
            {working ? '…' : 'Install'}
          </span>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={working}
      className="group w-full flex items-center gap-3 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 text-left shadow-sm transition-all hover:shadow-md hover:border-orange-300 active:scale-[0.99] disabled:opacity-80"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow">
        <Download className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-stone-900">Install the CareerRai app</p>
        <p className="mt-0.5 text-xs text-stone-500">Just ~3 MB · add it to your home screen for one-tap access.</p>
      </div>
      <Smartphone className="w-4 h-4 shrink-0 text-orange-600" />
    </button>
  );
}
