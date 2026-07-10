'use client';

import { useState } from 'react';
import { BellRing } from 'lucide-react';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
  ambitionDateLabel: string | null;
}

// Screen 3 (founder framing): "You own the study plan. We own the
// reminders." Asked immediately after the student picks their date, so the
// permission has a reason attached to something they just chose — not a
// cold OS prompt. Optional, never blocking (same policy as push-gate.tsx,
// whose enable flow this mirrors in compact form): decline persists
// push_prompted so the layout's legacy gate doesn't instantly re-ask, and
// the gentler post-Builder second ask remains the fallback.
function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(b64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export default function ScreenNotifPermission({ onNext, isLoading, ambitionDateLabel }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function persistPrompted() {
    try {
      await fetch('/api/profiles/notif-prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ push_prompted: true }),
      });
    } catch { /* best-effort — the post-Builder second ask covers a miss */ }
  }

  async function allow() {
    setBusy(true);
    setNote(null);
    try {
      if (isIOS() && !isStandalone()) {
        setNote('On iPhone, reminders need the app on your Home Screen first — we’ll set this up after.');
        await persistPrompted();
        setTimeout(() => onNext({}), 1400);
        return;
      }
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!supported || Notification.permission === 'denied') {
        await persistPrompted();
        onNext({});
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        await persistPrompted();
        onNext({});
        return;
      }
      const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
      const { key: publicKey } = keyRes.ok ? await keyRes.json() : { key: null };
      if (publicKey) {
        await navigator.serviceWorker.register('/sw.js');
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) { try { await existing.unsubscribe(); } catch { /* ignore */ } }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
      }
      onNext({});
    } catch {
      // Any failure = continue silently; the Builder must never die on a
      // permission hiccup.
      await persistPrompted();
      onNext({});
    } finally {
      setBusy(false);
    }
  }

  async function notNow() {
    setBusy(true);
    await persistPrompted();
    onNext({});
  }

  return (
    <div className="space-y-6 pt-2 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-600 shadow-lg shadow-orange-200">
          <BellRing className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-xl font-bold text-stone-900 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
          You own the plan.<br />We own the reminders.
        </h1>
        <p className="text-sm text-stone-600 leading-relaxed px-2">
          {ambitionDateLabel
            ? <>You just picked <span className="font-semibold text-stone-900">{ambitionDateLabel}</span>. Our job from here: today&apos;s task, revision alerts, course-corrects — so that date survives real life.</>
            : <>Our job from here: today&apos;s task, revision alerts, course-corrects — so your date survives real life.</>}
        </p>
      </div>

      {note && <p className="text-xs text-stone-500 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">{note}</p>}

      <div className="space-y-2">
        <button
          type="button"
          disabled={busy || isLoading}
          onClick={allow}
          className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? 'Setting up…' : 'Allow reminders →'}
        </button>
        <button
          type="button"
          disabled={busy || isLoading}
          onClick={notNow}
          className="w-full py-2.5 text-xs font-medium text-stone-400 hover:text-stone-600"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
