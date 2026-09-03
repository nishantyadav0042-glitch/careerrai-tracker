'use client';

import { useEffect, useRef, useState } from 'react';
import { track, detectDisplayMode } from '@/lib/journey';
import { BellRing } from 'lucide-react';
import { setNotifAskVisible as setAskVisible, NOTIF_ASK_SETTLED_EVENT } from '@/lib/first-run-events';
import { getLiveSubscription, persistSubscription } from '@/lib/push-client';
import { pushCapabilityFrom, readSurfaceSignals, type PushCapability } from '@/lib/push-capability';

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
// isStandalone()/isIOS() used to live here as a local pair. They are now in
// lib/push-capability.ts — THE single authority — because the same pair was
// duplicated in push-healer and push-toggle, and the blanket iOS check here
// was silently skipping the iOS Home Screen PWA, the only iOS surface that
// can actually receive a push.

// serverSubDead (21 July audit): the server holds NO live subscription for
// this student even though their prefs say push is on — their OS revoked the
// permission (which is also what killed the push endpoint). These students
// were permanently unreachable: prefs said ON so this ask never rendered, and
// the healer never prompts. Now they get the same overlay with reconnect copy.
export function StandaloneNotifAsk({ pushEnabled, serverSubDead = false, appInstalled = false }: {
  pushEnabled: boolean;
  serverSubDead?: boolean;
  /** Server truth (profiles.app_installed): this student has reached
   *  standalone at least once, so the icon IS on their phone. It changes what
   *  a browser tab MEANS — see the deferral in evaluate(). */
  appInstalled?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The OS has already refused. Distinct from "not asked yet": requestPermission()
  // returns 'denied' instantly forever, so the normal CTA is a dead button and
  // the student can tap it all day. Production, 1 Sep: one student tapped 14 times.
  const [blocked, setBlocked] = useState(false);
  // Non-null when this surface cannot receive a push but the student CAN do
  // something about it. Drives the guidance panel instead of silence.
  const [cannot, setCannot] = useState<PushCapability | null>(null);
  const reconnect = pushEnabled && serverSubDead;
  // evaluate() re-runs on every foreground, so the same outcome would other-
  // wise be written once per app switch. Only a CHANGE is worth a row.
  const lastOutcome = useRef<string | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- capability detection must run client-side after mount */
    // Emit once per distinct outcome. `why` is the whole point of this
    // instrumentation: it is what separates "never asked" from "said no".
    const report = (outcome: string, why?: string) => {
      if (lastOutcome.current === outcome) return;
      lastOutcome.current = outcome;
      if (outcome === 'shown') track('push_ask_shown', { reconnect, context: detectDisplayMode() });
      else if (outcome === 'guided') track('push_setup_guidance_shown', { why, context: detectDisplayMode() });
      else track('push_ask_skipped', { why, context: detectDisplayMode() });
    };

    if (pushEnabled && !serverSubDead) { setAskVisible(false); setShow(false); return; }

    // Show whenever notifications aren't on yet — this is JOB #1 in the app,
    // the very FIRST thing (founder, 23 Jul: notifications → tour → insight).
    // Deliberately NO "skip" memory — the founder wants this on every open
    // until it's done. Every early-return marks the ask as settled (it isn't
    // going to cover the screen), so the tour can proceed.
    const evaluate = () => {
      const signals = readSurfaceSignals();
      if (!signals) { setAskVisible(false); report('skipped', 'unsupported'); return; }
      const cap = pushCapabilityFrom(signals);

      if (!cap.canReceive) {
        // A surface that cannot receive is NOT automatically a dead end. Where
        // a remedy exists we show it — this is the 206 App Store students who
        // previously got silence, and the tab students who got nothing.
        if (cap.remedy === 'none') { setAskVisible(false); setCannot(null); report('skipped', cap.reason!); return; }
        // …but "install it" is the WRONG remedy for a student who already
        // did. 133 of the 238 Android students whose last session was a
        // browser tab had already accepted an install prompt: the icon is on
        // their phone, they simply arrived through a WhatsApp link, which
        // always opens a tab. A full-screen "Install app" panel tells them to
        // fix something that is not broken. They get ReopenAppNudge's slim
        // banner instead — same destination, no blocking overlay, and it says
        // the true thing ("open the app you already have").
        if (appInstalled && cap.surface === 'browser_tab') {
          setAskVisible(false); setCannot(null); report('skipped', 'already_installed_tab'); return;
        }
        setCannot(cap);
        setAskVisible(true);
        setShow(true);
        report('guided', cap.reason);
        return;
      }
      setCannot(null);
      if (Notification.permission === 'granted') { setAskVisible(false); report('skipped', 'already_granted'); return; } // subscribed; server flag will catch up
      // Still shown when blocked — the founder's rule is that this returns on
      // every app open until notifications are actually on, and a blocked
      // student HAS an unresolved state with a real fix. What changes is the
      // panel: instructions they can act on, never a button that cannot work.
      const denied = Notification.permission === 'denied';
      setBlocked(denied);
      setAskVisible(true);
      setShow(true);
      if (!denied) report('shown');
    };
    evaluate();

    // Reopening a resident iOS PWA fires visibilitychange, not a remount —
    // re-ask there so "Later" only hides it until the next time they open the app.
    const onVisible = () => { if (document.visibilityState === 'visible') evaluate(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
    /* eslint-enable react-hooks/set-state-in-effect */
    // `reconnect` is derived from the other two, so listing it re-runs nothing
    // extra — it just keeps the dependency list honest.
  }, [pushEnabled, serverSubDead, reconnect, appInstalled]);

  // The ONE place this event is emitted. Keyed on the state flip rather than
  // the tap, so it counts students who are blocked, not how many times they
  // tried — the raw tap count was 14 for a single student.
  useEffect(() => {
    if (blocked) track('push_ask_blocked', { context: detectDisplayMode() });
  }, [blocked]);

  // The ONE place a failure is recorded. Both entry points into the subscribe
  // flow funnel through it, so the event keeps a single call site.
  function reportFailure(e: unknown) {
    // Our own messages ('no key', 'subscribe failed: …') or a browser
    // DOMException name. Neither carries anything student-identifying;
    // capped anyway so a long native message cannot bloat a row.
    track('push_ask_failed', {
      reason: (e instanceof Error ? e.message : 'unknown').slice(0, 80),
      context: detectDisplayMode(),
    });
    setErr("Couldn't switch on — try again in a moment.");
  }

  if (!show) return null;

  // Everything after the permission is granted. Shared by the first grant and
  // by a student who fixed it in phone settings and came back.
  async function subscribeNow() {
    const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
    const { key: publicKey } = keyRes.ok ? await keyRes.json() : { key: null };
    if (!publicKey) throw new Error('no key');
    await navigator.serviceWorker.register('/sw.js');
    const reg = await navigator.serviceWorker.ready;
    // Reuse a healthy sub, rotate only if the key changed — never the blind
    // unsubscribe()+subscribe() that stranded endpoints (21 July fix).
    const sub = await getLiveSubscription(reg, publicKey);
    const { ok, reason } = await persistSubscription(sub, detectDisplayMode());
    if (!ok) throw new Error(`subscribe failed: ${reason}`);
    track('push_enabled', { context: detectDisplayMode(), source: 'standalone_ask' });
    // Verification loop: prove the brand-new subscription delivers end to end.
    // Fire-and-forget — the reload below shouldn't wait on it, and the beacon
    // stamps push_verified_at when the device receives it.
    void fetch('/api/push/welcome', { method: 'POST' }).catch(() => {});
    // Full reload so every server-rendered gate sees push=true and clears.
    window.location.reload();
  }

  // The blocked student's real action: they changed it in phone settings, we
  // re-read. Deliberately does NOT call requestPermission() — once denied that
  // resolves to 'denied' instantly and forever, which is what made the original
  // button a dead end.
  async function recheck() {
    setBusy(true);
    setErr(null);
    try {
      if (Notification.permission !== 'granted') {
        setErr('Still blocked. Turn notifications on for CareerRai in your phone settings, then tap again.');
        return;
      }
      setBlocked(false);
      await subscribeNow();
    } catch (e) {
      reportFailure(e);
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    setBusy(true);
    setErr(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        // 'denied' = blocked at OS level. Flip to the blocked panel rather than
        // leaving the same dead button on screen — the event is emitted from
        // that state flip, once, not once per tap. 'default' = they dismissed
        // the OS prompt; hide for now, it comes back on the next app open.
        if (permission === 'denied') {
          setBlocked(true);
        } else {
          track('push_ask_dismissed', { context: detectDisplayMode() });
          setAskVisible(false);
          setShow(false);
        }
        return;
      }
      await subscribeNow();
    } catch (e) {
      reportFailure(e);
    } finally {
      setBusy(false);
    }
  }

  function later() {
    // Hide for now only — no persistence, so it returns on the next app open.
    // Tracked because a student who repeatedly taps Later is telling us the
    // copy is not landing, which looks identical to "never asked" without it.
    track('push_ask_later', { reconnect, context: detectDisplayMode() });
    setAskVisible(false);
    setShow(false);
  }

  return (
    // Same scroll trap the six-promises screen had (13 Aug): a `fixed` layer
    // with no overflow rule clips anything past the viewport instead of
    // scrolling it, so on a short phone the button at the bottom becomes
    // unreachable. overflow-y-auto here + min-h-full below centres short
    // content and scrolls tall content.
    <div className="fixed inset-0 z-[85] overflow-y-auto overscroll-contain bg-white">
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-6 px-6 py-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-900 shadow-lg shadow-stone-900/15">
          <BellRing className="h-8 w-8 text-white" />
        </div>
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-orange-500">
            {cannot ? 'One quick setup step' : blocked ? 'Blocked by your phone' : reconnect ? 'Your reminders got disconnected' : 'The last step of your setup'}
          </p>
          <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            {cannot
              ? <>Reminders come from<br />the Home Screen app.</>
              : blocked
              ? <>This one has to be<br />done in Settings.</>
              : reconnect ? <>Your daily plan stopped<br />reaching you.</> : <>Your plan works only<br />if it reaches you.</>}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            {cannot
              // Deliberately says nothing about WKWebView, Web Push or service
              // workers. The student does not need our architecture; they need
              // to know this takes 20 seconds and why it is worth it.
              ? 'This version of CareerRai can’t send reminders. The Home Screen version can — it’s the same app, same login, same plan, and it takes about 20 seconds to add.'
              : blocked
              ? 'Your phone has blocked notifications for CareerRai, and an app can’t undo that from the inside — only you can, and it takes about ten seconds.'
              : reconnect
              ? 'Your phone switched off CareerRai’s notifications, so your daily plan and reminders have gone quiet. One tap reconnects them.'
              : 'Students who keep reminders on stay consistent — today’s plan, revision alerts, and gentle nudges. Switch on your notifications so they actually reach you.'}
          </p>
        </div>

        {/* Real steps, because there is no web API that can open the OS
            notification settings for us. A button that pretended to would be
            the same promise-without-a-capability that got EvidenceAnnounce
            deleted — so we tell them exactly where it is instead. */}
        {cannot && (
          <ol className="mx-auto space-y-2 text-left text-[13px] leading-relaxed text-stone-600">
            {(cannot.remedy === 'add_to_home_screen'
              ? [
                  <>Open <strong className="text-stone-800">careerrai.in</strong> in <strong className="text-stone-800">Safari</strong>.</>,
                  <>Tap the <strong className="text-stone-800">Share</strong> button, then <strong className="text-stone-800">Add to Home Screen</strong>.</>,
                  <>Open CareerRai from your Home Screen — it will ask about reminders there.</>,
                ]
              : [
                  <>Open the browser menu and choose <strong className="text-stone-800">Install app</strong> (or <strong className="text-stone-800">Add to Home screen</strong>).</>,
                  <>Open CareerRai from your home screen.</>,
                  <>It will ask about reminders there.</>,
                ]
            ).map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[10px] font-bold text-white">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}

        {blocked && (
          <ol className="mx-auto space-y-2 text-left text-[13px] leading-relaxed text-stone-600">
            {[
              <>Press and hold the <strong className="text-stone-800">CareerRai</strong> icon on your home screen.</>,
              <>Tap <strong className="text-stone-800">App info</strong> (the ⓘ), then <strong className="text-stone-800">Notifications</strong>.</>,
              <>Turn notifications <strong className="text-stone-800">on</strong>, then come back here.</>,
            ].map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[10px] font-bold text-white">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}
        {err && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{err}</p>}
        <div className="space-y-2">
          {/* Once the OS has denied, requestPermission() resolves to 'denied'
              instantly and forever. Offering it again is the dead end this
              replaces: the blocked student gets a re-READ instead, which is an
              action that can actually succeed once they've been to Settings. */}
          <button
            type="button"
            disabled={busy}
            onClick={cannot ? later : blocked ? recheck : enable}
            className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? 'Checking…' : cannot ? 'Got it' : blocked ? 'I’ve turned it on — check again' : 'Switch on notifications →'}
          </button>
          <button type="button" disabled={busy} onClick={later} className="w-full py-2.5 text-xs font-medium text-stone-400 hover:text-stone-600">
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
