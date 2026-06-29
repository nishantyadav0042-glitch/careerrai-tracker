'use client';
import { useState, useEffect } from 'react';
import { Bell, Check, Loader2, Flame, MessageCircle, CalendarClock } from 'lucide-react';

// Web Push requires the applicationServerKey as a Uint8Array.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const clean = base64String.trim();
  const padding = '='.repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

// Sessions where the user couldn't enable (denied / iOS not installed / unsupported)
// are snoozed for the tab session only — so we don't brick them, but they're asked
// again on the next login. A successful enable sets notif_prefs.push=true server-side,
// after which the gate never renders again.
const SNOOZE_KEY = 'cr_push_gate_snoozed';

type Phase = 'intro' | 'working' | 'blocked' | 'ios' | 'unsupported' | 'done';

const COPY = {
  student: {
    subtitle: 'Notifications are how CareerRai keeps you on track. This is a required step — they’re a core part of how the app works.',
    benefits: [
      { icon: CalendarClock, title: 'Daily study reminders', body: 'A nudge so you never miss logging your day.' },
      { icon: MessageCircle, title: 'Messages from your buddy', body: 'Know the moment your IIM mentor replies.' },
      { icon: Flame, title: 'Streak & progress alerts', body: 'Protect your streak and celebrate milestones.' },
    ],
  },
  staff: {
    subtitle: 'Notifications keep you on top of your students in real time. This is a required step for your account.',
    benefits: [
      { icon: Flame, title: 'New signups & sign-ins', body: 'Know the moment a new student joins.' },
      { icon: MessageCircle, title: 'Student messages', body: 'Reply fast when a student reaches out.' },
      { icon: CalendarClock, title: 'Risk & inactivity alerts', body: 'Get pinged before someone drops off.' },
    ],
  },
} as const;

/**
 * Mandatory post-onboarding push prompt. Renders full-screen for any student who
 * hasn't turned push on yet. There is no "skip" on a device that CAN enable —
 * the only way past is to turn notifications on. Devices that physically can't
 * (permission hard-blocked, iPhone not installed, unsupported browser) get clear
 * instructions plus a session-only "continue" so they aren't locked out.
 */
export function PushGate({ variant = 'student' }: { variant?: 'student' | 'staff' }) {
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[variant];

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- capability detection must run client-side after mount */
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SNOOZE_KEY) === '1') return;

    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (isIOS() && !isStandalone()) { setPhase('ios'); setShow(true); return; }
    if (!supported) { setPhase('unsupported'); setShow(true); return; }
    if (Notification.permission === 'denied') { setPhase('blocked'); setShow(true); return; }
    setShow(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function enable() {
    setPhase('working');
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setPhase('blocked'); return; }

      const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
      if (!keyRes.ok) { setError('Notifications aren’t configured on the server yet. Please try again shortly.'); setPhase('intro'); return; }
      const { key: publicKey } = await keyRes.json();
      if (!publicKey) { setError('Notifications aren’t configured on the server yet. Please try again shortly.'); setPhase('intro'); return; }

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
      if (!res.ok) { setError(`Couldn’t save your subscription (server returned ${res.status}). Please try again.`); setPhase('intro'); return; }

      setPhase('done');
      // push=true is now stored — reload so the gate stops rendering.
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your browser blocked the notification service. Please try again.');
      setPhase('intro');
    }
  }

  function continueForNow() {
    try { sessionStorage.setItem(SNOOZE_KEY, '1'); } catch { /* ignore */ }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-gradient-to-b from-orange-50 to-white">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 max-w-md mx-auto w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-orange-600 flex items-center justify-center shadow-lg shadow-orange-200">
          <Bell className="w-8 h-8 text-white" />
        </div>

        <h1 className="mt-6 text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Turn on notifications
        </h1>
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">
          {copy.subtitle}
        </p>

        {/* Why it matters */}
        <div className="mt-6 w-full space-y-3 text-left">
          {copy.benefits.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex items-start gap-3 rounded-xl bg-white border border-stone-200 p-3">
              <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-orange-700" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-stone-900">{title}</div>
                <div className="text-xs text-stone-500">{body}</div>
              </div>
            </div>
          ))}
        </div>

        {error && <p className="mt-4 text-xs text-red-600">{error}</p>}

        {/* Actions per phase */}
        <div className="mt-7 w-full">
          {phase === 'intro' && (
            <button
              onClick={enable}
              className="w-full rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3.5 text-sm shadow-lg shadow-orange-200 transition-colors"
            >
              Turn on notifications
            </button>
          )}

          {phase === 'working' && (
            <button disabled className="w-full rounded-xl bg-orange-600/80 text-white font-semibold py-3.5 text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Setting up…
            </button>
          )}

          {phase === 'done' && (
            <button disabled className="w-full rounded-xl bg-teal-600 text-white font-semibold py-3.5 text-sm flex items-center justify-center gap-2">
              <Check className="w-4 h-4" /> You’re all set!
            </button>
          )}

          {phase === 'blocked' && (
            <div className="space-y-3 text-left">
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                <p className="font-semibold mb-1">Notifications are blocked in your browser.</p>
                <p>Tap the <span className="font-semibold">lock icon</span> 🔒 next to the address bar → <span className="font-semibold">Notifications</span> → <span className="font-semibold">Allow</span>, then tap “Try again”.</p>
              </div>
              <button onClick={enable} className="w-full rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 text-sm">
                Try again
              </button>
              <button onClick={continueForNow} className="w-full text-xs text-stone-400 hover:text-stone-600 py-1">
                Continue for now — we’ll ask again next time
              </button>
            </div>
          )}

          {phase === 'ios' && (
            <div className="space-y-3 text-left">
              <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-xs text-stone-700">
                <p className="font-semibold mb-1">One quick step on iPhone</p>
                <p>Notifications on iPhone need the app added to your Home Screen first: tap the <span className="font-semibold">Share</span> icon → <span className="font-semibold">Add to Home Screen</span>, open CareerRai from there, and you’ll be asked to allow notifications.</p>
              </div>
              <button onClick={continueForNow} className="w-full rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold py-3 text-sm">
                Got it — continue
              </button>
            </div>
          )}

          {phase === 'unsupported' && (
            <div className="space-y-3 text-left">
              <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-xs text-stone-600">
                This browser doesn’t support push notifications. For alerts, open CareerRai in Chrome on Android or install it to your Home Screen.
              </div>
              <button onClick={continueForNow} className="w-full rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold py-3 text-sm">
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
