'use client';

import { useEffect, useState } from 'react';
import { track, detectDisplayMode } from '@/lib/journey';
import { BellRing } from 'lucide-react';
import { TOUR_DONE_EVENT } from '@/components/app-tour';

// The app tour writes this flag when it finishes. Notifications are asked
// AFTER the tour (founder: install → tour → switch on notifications), so this
// overlay stays down until the flag is set — never overlapping the coach-marks.
const TOUR_KEY = 'cr_app_tour_v1';

// First-run sequencing signal for whatever comes AFTER this ask (today: the
// first-log prompt). `window.__crNotifAskVisible` is the live "am I covering
// the screen" flag; the event fires whenever the ask settles down (decided not
// to show, or the student tapped Later). Enabling reloads the page, so that
// path needs no event — the next mount starts clean.
export const NOTIF_ASK_SETTLED_EVENT = 'cr-notif-ask-settled';
function setAskVisible(visible: boolean) {
  try {
    (window as Window & { __crNotifAskVisible?: boolean }).__crNotifAskVisible = visible;
    if (!visible) window.dispatchEvent(new Event(NOTIF_ASK_SETTLED_EVENT));
  } catch { /* ignore */ }
}

// Founder flow: notification permission is asked INSIDE the installed app —
// before install (especially on iPhone) the permission is a dead ask, since
// iOS only delivers web push to an installed PWA. This overlay fires in
// standalone mode when push isn't enabled yet: "you did your first job, now
// let us do ours." Founder decision: it must return on EVERY app open until
// notifications are actually on — no once-and-gone skip. So we re-evaluate on
// every foreground (visibilitychange), not just on mount: an iOS PWA that's
// still resident is only foregrounded when reopened, never remounted, so a
// mount-only check would silently never fire again. Gone only once granted.
function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
}

// iOS in a WKWebView wrapper (our App Store build) cannot deliver web push, so a
// "turn on notifications" prompt there is a dead-end — hide it on iOS. (Android
// TWA push works, so Android standalone still gets it.)
function isIOS(): boolean {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(b64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function StandaloneNotifAsk({ pushEnabled }: { pushEnabled: boolean }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- capability detection must run client-side after mount */
    if (pushEnabled) { setAskVisible(false); setShow(false); return; }

    // Show whenever notifications aren't on yet. Deliberately NO "skip"
    // memory — the founder wants this on every open until it's done.
    // Every early-return marks the ask as settled (it isn't going to cover the
    // screen), so the next step in the first-run sequence can proceed.
    const evaluate = () => {
      if (!isStandalone()) { setAskVisible(false); return; }
      if (isIOS()) { setAskVisible(false); return; } // web push is a no-op in the iOS wrapper — don't prompt
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) { setAskVisible(false); return; }
      if (Notification.permission === 'granted') { setAskVisible(false); return; } // subscribed; server flag will catch up
      // Sequence: never come up before the app tour has finished, so we never
      // cover the coach-marks. First-run users see the tour, then this.
      try { if (localStorage.getItem(TOUR_KEY) !== '1') return; } catch { return; }
      setAskVisible(true);
      setShow(true);
    };
    evaluate();

    // Reopening a resident iOS PWA fires visibilitychange, not a remount —
    // re-ask there so "Later" only hides it until the next time they open the app.
    const onVisible = () => { if (document.visibilityState === 'visible') evaluate(); };
    document.addEventListener('visibilitychange', onVisible);
    // The tour just ended → ask right now (same mount, no navigation).
    window.addEventListener(TOUR_DONE_EVENT, evaluate);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(TOUR_DONE_EVENT, evaluate);
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pushEnabled]);

  if (!show) return null;

  async function enable() {
    setBusy(true);
    setErr(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        // 'denied' = blocked at OS level (tell them to fix it in Settings, keep
        // the overlay up). 'default' = they dismissed the prompt — hide for now;
        // it comes back on the next app open. Neither is persisted.
        if (permission === 'denied') {
          setErr('Blocked by the phone — enable notifications for CareerRai in Settings.');
        } else {
          setAskVisible(false);
          setShow(false);
        }
        setBusy(false);
        return;
      }
      const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
      const { key: publicKey } = keyRes.ok ? await keyRes.json() : { key: null };
      if (!publicKey) throw new Error('no key');
      await navigator.serviceWorker.register('/sw.js');
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) { try { await existing.unsubscribe(); } catch { /* ignore */ } }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), context: detectDisplayMode() }),
      });
      if (!res.ok) throw new Error('subscribe failed');
      track('push_enabled', { context: detectDisplayMode(), source: 'standalone_ask' });
      // Full reload so every server-rendered gate sees push=true and clears.
      window.location.reload();
    } catch {
      setErr("Couldn't switch on — try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  function later() {
    // Hide for now only — no persistence, so it returns on the next app open.
    setAskVisible(false);
    setShow(false);
  }

  return (
    <div className="fixed inset-0 z-[85] flex flex-col bg-white">
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-6 px-6 py-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-900 shadow-lg shadow-stone-900/15">
          <BellRing className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            Your plan works only<br />if it reaches you.
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            Students who keep reminders on stay consistent — today&apos;s plan, revision alerts, and gentle nudges. Switch on your notifications so they actually reach you.
          </p>
        </div>
        {err && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{err}</p>}
        <div className="space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={enable}
            className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? 'Switching on…' : 'Switch on notifications →'}
          </button>
          <button type="button" disabled={busy} onClick={later} className="w-full py-2.5 text-xs font-medium text-stone-400 hover:text-stone-600">
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
