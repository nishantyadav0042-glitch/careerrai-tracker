'use client';

import { useState } from 'react';
import { BellRing } from 'lucide-react';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  isLoading: boolean;
  ambitionDateLabel: string | null;
}

// "You own the plan. We own the reminders." — asked pre-auth, right after
// the student picks their date. No account exists yet, so this can request
// permission and grab a push subscription, but the actual POST to
// /api/push/subscribe is deferred to the login-while-we-build step, which
// has a real session to attach it to.
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

export default function ScreenPermission({ onNext, isLoading, ambitionDateLabel }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function allow() {
    setBusy(true);
    setNote(null);
    try {
      if (isIOS() && !isStandalone()) {
        setNote('On iPhone, reminders need the app on your Home Screen first — we’ll set this up right after you log in.');
        setTimeout(() => onNext({ push_prompted: true }), 1400);
        return;
      }
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!supported || Notification.permission === 'denied') {
        onNext({ push_prompted: true });
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        onNext({ push_prompted: true });
        return;
      }
      const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
      const { key: publicKey } = keyRes.ok ? await keyRes.json() : { key: null };
      if (!publicKey) {
        onNext({ push_prompted: true });
        return;
      }
      await navigator.serviceWorker.register('/sw.js');
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) { try { await existing.unsubscribe(); } catch { /* ignore */ } }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      onNext({ push_subscription: sub.toJSON(), push_prompted: true });
    } catch {
      onNext({ push_prompted: true });
    } finally {
      setBusy(false);
    }
  }

  function notNow() {
    setBusy(true);
    onNext({ push_prompted: true });
  }

  return (
    <div className="space-y-6 pt-2 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-900 shadow-lg shadow-stone-900/10">
          <BellRing className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-xl font-bold text-stone-900 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
          You own the plan.<br />We own the reminders.
        </h1>
        <p className="px-2 text-sm leading-relaxed text-stone-600">
          {ambitionDateLabel
            ? <>You just picked <span className="font-semibold text-stone-900">{ambitionDateLabel}</span>. Give us permission to help you stay on it — today&apos;s task, revision alerts, course-corrects.</>
            : <>Give us permission to help you stay on track — today&apos;s task, revision alerts, course-corrects.</>}
        </p>
      </div>

      {note && <p className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-500">{note}</p>}

      <div className="space-y-2">
        <button
          type="button"
          disabled={busy || isLoading}
          onClick={allow}
          className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? 'Setting up…' : 'Give permission →'}
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
