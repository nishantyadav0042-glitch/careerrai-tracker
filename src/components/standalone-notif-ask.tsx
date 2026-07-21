'use client';

import { useEffect, useState } from 'react';
import { track, detectDisplayMode } from '@/lib/journey';
import { BellRing } from 'lucide-react';
import { setNotifAskVisible as setAskVisible, NOTIF_ASK_SETTLED_EVENT, INSIGHT_DONE_EVENT, insightVisible } from '@/lib/first-run-events';
import { getLiveSubscription, persistSubscription } from '@/lib/push-client';

// Founder order (21 July): the notification ask is JOB #1 in the installed
// app — it fires BEFORE the app tour (the tour and the buddy pitch both wait
// for this to settle via NOTIF_ASK_SETTLED_EVENT / the visibility flag in
// lib/first-run-events). Previously it waited for the tour, which let the
// tour and buddy pitch stack on screen while notifications went un-asked.

export { NOTIF_ASK_SETTLED_EVENT };

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

// serverSubDead (21 July audit): the server holds NO live subscription for
// this student even though their prefs say push is on — their OS revoked the
// permission (which is also what killed the push endpoint). These students
// were permanently unreachable: prefs said ON so this ask never rendered, and
// the healer never prompts. Now they get the same overlay with reconnect copy.
export function StandaloneNotifAsk({ pushEnabled, serverSubDead = false }: { pushEnabled: boolean; serverSubDead?: boolean }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reconnect = pushEnabled && serverSubDead;

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- capability detection must run client-side after mount */
    if (pushEnabled && !serverSubDead) { setAskVisible(false); setShow(false); return; }

    // Show whenever notifications aren't on yet — FIRST, before the tour.
    // Deliberately NO "skip" memory — the founder wants this on every open
    // until it's done. Every early-return marks the ask as settled (it isn't
    // going to cover the screen), so the tour and buddy pitch can proceed.
    const evaluate = () => {
      if (insightVisible()) return; // Day-1 insight holds the stage — retry on its done event
      if (!isStandalone()) { setAskVisible(false); return; }
      if (isIOS()) { setAskVisible(false); return; } // web push is a no-op in the iOS wrapper — don't prompt
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) { setAskVisible(false); return; }
      if (Notification.permission === 'granted') { setAskVisible(false); return; } // subscribed; server flag will catch up
      setAskVisible(true);
      setShow(true);
    };
    evaluate();

    // Reopening a resident iOS PWA fires visibilitychange, not a remount —
    // re-ask there so "Later" only hides it until the next time they open the app.
    const onVisible = () => { if (document.visibilityState === 'visible') evaluate(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(INSIGHT_DONE_EVENT, evaluate);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(INSIGHT_DONE_EVENT, evaluate);
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pushEnabled, serverSubDead]);

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
      // Reuse a healthy sub, rotate only if the key changed — never the blind
      // unsubscribe()+subscribe() that stranded endpoints (21 July fix).
      const sub = await getLiveSubscription(reg, publicKey);
      const ok = await persistSubscription(sub, detectDisplayMode());
      if (!ok) throw new Error('subscribe failed');
      track('push_enabled', { context: detectDisplayMode(), source: 'standalone_ask' });
      // Verification loop: prove the brand-new subscription delivers end to end.
      // Fire-and-forget — the reload below shouldn't wait on it, and the beacon
      // stamps push_verified_at when the device receives it.
      void fetch('/api/push/welcome', { method: 'POST' }).catch(() => {});
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
          <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-orange-500">
            {reconnect ? 'Your reminders got disconnected' : 'The last step of your setup'}
          </p>
          <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            {reconnect ? <>Your daily plan stopped<br />reaching you.</> : <>Your plan works only<br />if it reaches you.</>}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            {reconnect
              ? 'Your phone switched off CareerRai’s notifications, so your daily plan and reminders have gone quiet. One tap reconnects them.'
              : 'Students who keep reminders on stay consistent — today’s plan, revision alerts, and gentle nudges. Switch on your notifications so they actually reach you.'}
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
