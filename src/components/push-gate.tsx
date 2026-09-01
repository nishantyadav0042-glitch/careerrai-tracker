'use client';
import { useState } from 'react';
import { track, detectDisplayMode } from '@/lib/journey';
import { useRouter } from 'next/navigation';
import { Bell, Check, Loader2 } from 'lucide-react';
import { getLiveSubscription, persistSubscription } from '@/lib/push-client';
import { pushCapabilityFrom, readSurfaceSignals } from '@/lib/push-capability';

// isIOS()/isStandalone() removed 1 Sep — they were the third and second copies
// of a rule that now lives in lib/push-capability.ts, THE authority. One of the
// three copies (standalone-notif-ask) carried a defect the others did not.


type Phase = 'intro' | 'working' | 'blocked' | 'ios' | 'unsupported' | 'done';

// Two asks, never more. "first" fires as early as possible — right after
// login, before onboarding — because reach beats conversion rate here: far
// more students see this screen than ever finish onboarding, so even a
// lower accept rate nets more push-enabled students overall. "second" fires
// once, only if they declined the first time AND have since finished
// onboarding — an ask backed by something real they now have, not a cold
// request. Decline either one and it's over: no third ask, ever.
//
// The copy promises exactly what src/lib/decision-engine.ts actually sends
// (revision due, plan changes, a topic earned, weekly evolution, picked-up-
// where-you-left-off) — nothing invented, nothing this app can't deliver on
// day one. A broken promise on the permission screen is the fastest way to
// make every future notification easy to ignore.
const COPY = {
  first: {
    headline: 'Stay consistent.',
    body: "We'll tell you when revision is due, when your plan changes, or when you've earned a topic — never anything else.",
    cta: 'Keep me on track',
    decline: 'Not now',
  },
  second: {
    headline: 'Your study plan is ready.',
    body: "Want a reminder so you don't lose it? We'll only message you when it actually matters.",
    cta: 'Keep me on track',
    decline: 'No thanks',
  },
  // Staff (admin/buddy) accounts are operational, not the acquisition
  // funnel the student-facing "never blocking" argument was about — a
  // buddy who misses a student message is a real service failure, so this
  // one stays mandatory, same as before.
  staff: {
    headline: 'Turn on notifications',
    body: 'Notifications keep you on top of your students in real time — new messages, signups, and risk alerts. This is a required step for your account.',
    cta: 'Turn on notifications',
    decline: null,
  },
} as const;

interface PushGateProps {
  mode: 'first' | 'second' | 'staff';
  notifPrefs?: Record<string, unknown>;
}

// Refresh-on-dismiss: the layout is a server component, so making it re-read
// the freshly-persisted notif_prefs flag means re-running server components —
// router.refresh() does exactly that without tearing down and re-downloading
// the whole app the way the old window.location.reload() did.

/**
 * Optional, never blocking. Declining either ask lets the student straight
 * through — the highest-value student is the one who finishes onboarding,
 * not the one who granted push, and a hard wall here would trade paying
 * customers for a permission.
 */
export function PushGate({ mode, notifPrefs }: PushGateProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const copy = COPY[mode];

  // Inside the INSTALLED app the notification ask is StandaloneNotifAsk
  // ("our job #1"), not these browser gates — never stack both.
  const sig = typeof window !== 'undefined' ? readSurfaceSignals() : null;
  if (sig?.standalone) return null;

  function dismiss() {
    router.refresh();
  }

  async function persistDismissal(flag: 'push_prompted' | 'push_reprompted') {
    try {
      await fetch('/api/profiles/notif-prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...notifPrefs, [flag]: true }),
      });
    } catch { /* best-effort — worst case they see this ask again next login */ }
  }

  async function decline() {
    setDismissing(true);
    await persistDismissal(mode === 'first' ? 'push_prompted' : 'push_reprompted');
    dismiss();
  }

  async function enable() {
    setPhase('working');
    setError(null);

    // Same population as the old `isIOS() && !isStandalone()`: an iPhone that
    // is not in an installed surface, whether that is Safari or the App Store
    // wrapper. The authority names them apart; both need the same remedy.
    if (pushCapabilityFrom(readSurfaceSignals()!).remedy === 'add_to_home_screen') { setPhase('ios'); return; }
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!supported) { setPhase('unsupported'); return; }
    if (Notification.permission === 'denied') { setPhase('blocked'); return; }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        // A real OS-level decline counts the same as tapping "Not now."
        await persistDismissal(mode === 'first' ? 'push_prompted' : 'push_reprompted');
        setPhase('blocked');
        return;
      }

      const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
      if (!keyRes.ok) { setError('Notifications aren’t configured on the server yet. Please try again shortly.'); setPhase('intro'); return; }
      const { key: publicKey } = await keyRes.json();
      if (!publicKey) { setError('Notifications aren’t configured on the server yet. Please try again shortly.'); setPhase('intro'); return; }

      await navigator.serviceWorker.register('/sw.js');
      const reg = await navigator.serviceWorker.ready;
      // Reuse a healthy sub, rotate only on a key change — no gratuitous
      // unsubscribe()+subscribe() that could strand an endpoint (21 July fix).
      const sub = await getLiveSubscription(reg, publicKey);

      // Sets notif_prefs.push = true server-side (merge-safe) — the gate
      // never renders again once this succeeds, on either mode. Retried persist.
      const { ok } = await persistSubscription(sub, detectDisplayMode());
      if (!ok) { setError('Couldn’t save your subscription. Please try again.'); setPhase('intro'); return; }
      track('push_enabled', { context: detectDisplayMode(), source: 'push_gate' });

      setPhase('done');
      setTimeout(dismiss, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your browser blocked the notification service. Please try again.');
      setPhase('intro');
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-gradient-to-b from-orange-50 to-white">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 max-w-md mx-auto w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-orange-600 flex items-center justify-center shadow-lg shadow-orange-200">
          <Bell className="w-8 h-8 text-white" />
        </div>

        <h1 className="mt-6 text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          {copy.headline}
        </h1>
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">
          {copy.body}
        </p>
        {mode !== 'staff' && <p className="mt-3 text-xs text-stone-400">No spam. Turn it off anytime.</p>}

        {error && <p className="mt-4 text-xs text-red-600">{error}</p>}

        <div className="mt-7 w-full space-y-2.5">
          {phase === 'intro' && (
            <>
              <button
                onClick={enable}
                className="w-full rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3.5 text-sm shadow-lg shadow-orange-200 transition-colors"
              >
                {copy.cta}
              </button>
              {copy.decline && (
                <button
                  onClick={decline}
                  disabled={dismissing}
                  className="w-full text-xs text-stone-400 hover:text-stone-600 py-1 disabled:opacity-50"
                >
                  {dismissing ? '…' : copy.decline}
                </button>
              )}
            </>
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
              <button onClick={() => setPhase('intro')} className="w-full rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 text-sm">
                Try again
              </button>
              <button onClick={decline} className="w-full text-xs text-stone-400 hover:text-stone-600 py-1">
                Continue for now
              </button>
            </div>
          )}

          {phase === 'ios' && (
            <div className="space-y-3 text-left">
              <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-xs text-stone-700">
                <p className="font-semibold mb-1">One quick step on iPhone</p>
                <p>Notifications on iPhone need the app added to your Home Screen first: tap the <span className="font-semibold">Share</span> icon → <span className="font-semibold">Add to Home Screen</span>, open CareerRai from there, and you’ll be asked to allow notifications.</p>
              </div>
              <button onClick={decline} className="w-full rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold py-3 text-sm">
                Got it — continue
              </button>
            </div>
          )}

          {phase === 'unsupported' && (
            <div className="space-y-3 text-left">
              <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-xs text-stone-600">
                This browser doesn’t support push notifications. For alerts, open CareerRai in Chrome on Android or install it to your Home Screen.
              </div>
              <button onClick={decline} className="w-full rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold py-3 text-sm">
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
