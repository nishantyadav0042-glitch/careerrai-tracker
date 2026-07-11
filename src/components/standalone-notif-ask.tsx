'use client';

import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';

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
    if (pushEnabled) { setShow(false); return; }

    // Show whenever notifications aren't on yet. Deliberately NO "skip"
    // memory — the founder wants this on every open until it's done.
    const evaluate = () => {
      if (!isStandalone()) return;
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
      if (Notification.permission === 'granted') return; // subscribed; server flag will catch up
      setShow(true);
    };
    evaluate();

    // Reopening a resident iOS PWA fires visibilitychange, not a remount —
    // re-ask there so "Later" only hides it until the next time they open the app.
    const onVisible = () => { if (document.visibilityState === 'visible') evaluate(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
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
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error('subscribe failed');
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
            You did your first job.<br />Now let us do ours.
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            Our job #1 is reminding you, every day — today&apos;s plan, revision alerts, course-corrects. Switch on notifications so they actually reach you.
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
