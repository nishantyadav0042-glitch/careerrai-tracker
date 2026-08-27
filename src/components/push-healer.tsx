'use client';

import { useEffect } from 'react';
import { detectDisplayMode } from '@/lib/journey';
import { getLiveSubscription, persistSubscription } from '@/lib/push-client';

// Silent push self-heal. Web-push subscriptions die (endpoint rotation, the push
// service returning 410, storage cleared) — and the app used to assume
// "permission granted = still subscribed", so a dead subscription was never
// re-created and pushes silently stopped. This runs once per session: if the OS
// permission is already granted, it ensures the browser has a live subscription
// and that the server has the current one. Never prompts, never throws.
//
// 20 July hardening — two holes found in the zero-log incident:
//
// 1. DEAD-BUT-PRESENT subs were unhealable. Five same-day students' subs died
//    with 410 within hours: they granted push in the Chrome TAB during
//    onboarding, then installed the WebAPK — which invalidates the tab-era
//    endpoint. The browser still returns that stale sub from getSubscription()
//    (only OUR server knows it 410s), so the old healer happily re-uploaded
//    the corpse. Now the server tells us (`serverPushDead`) and we unsubscribe
//    + resubscribe fresh instead.
// 2. Proactively re-subscribe on the FIRST standalone open per device (the
//    WebAPK-migration moment itself), so the endpoint the server holds is the
//    installed app's, not the doomed browser-tab one.
let healedThisSession = false;

// 16 Aug, Notification Reliability V2 Installment 2 Part 8 — never swallow a
// real recovery attempt again. Investigating Installment 1's 49
// provider-dead students found 7 who genuinely reopened the app since
// dying and still didn't heal; the reason was invisible because this
// function's own catch block discarded it.
//
// INSTALLMENT 5 CORRECTION, found by real production data within 15 minutes
// of the Installment 4 deploy: this used to report whenever `serverPushDead`
// was true — but that flag is `push_died_at || !push_subscription`, which is
// ALSO true for every student who simply never turned notifications on (236
// of them). Result: 3 students got recovery telemetry written who were never
// in the recovery population at all, including one fully reachable student
// with a live subscription who was stamped recovery_failed. Recovery
// reporting is now gated on `inRecoveryQueue` — permission actually granted
// AND no working subscription. This used to say "i.e. needsRecovery() from
// notification-state.ts" — that file was deleted in this consolidation and the
// pointer outlived it. A comment naming a module that does not exist sends the
// next reader looking for an authority that is gone, which is the documentation
// form of the same zombie architecture the code cleanup is removing.
// — while `serverPushDead` keeps its separate, correct job of deciding
// whether to ROTATE the endpoint. Two different questions, two flags.
async function reportOutcome(ok: boolean, reason?: string) {
  try {
    await fetch('/api/push/heal-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok, reason }),
    });
  } catch {
    /* the report itself failing is not the story — the original outcome,
       captured above, already reached the server if this succeeds, and if
       it doesn't, push_recovery_attempted_at simply stays at its last
       value, which is an honest (if stale) fact, not a fabricated one. */
  }
}

export function PushHealer({
  serverPushDead = false,
  inRecoveryQueue = false,
}: {
  /** Should we ROTATE the endpoint? True when the server holds a dead or
   *  absent subscription — a technical question about the endpoint. */
  serverPushDead?: boolean;
  /** Is this student genuinely OWED a working subscription? True only when
   *  permission is granted AND there is no working subscription — the
   *  needsRecovery() population. Gates telemetry ONLY; never gates healing,
   *  because silently re-persisting a fresh subscription for anyone is still
   *  correct behaviour, it just isn't a "recovery" worth recording. */
  inRecoveryQueue?: boolean;
}) {
  useEffect(() => {
    if (healedThisSession) return;
    healedThisSession = true;
    (async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
          if (inRecoveryQueue) void reportOutcome(false, 'push_unsupported');
          return;
        }
        if (Notification.permission !== 'granted') {
          // A genuinely different, valuable fact from a technical subscribe
          // failure below: the browser/OS permission itself isn't granted
          // right now — recovery structurally cannot proceed without a
          // prompt, which this component deliberately never shows. Reported
          // so this doesn't look identical to "subscribe() threw" in the
          // data — never PROMPTED here either way, only recorded.
          if (inRecoveryQueue) void reportOutcome(false, `browser_permission_${Notification.permission}`);
          return;
        }

        const displayMode = detectDisplayMode();
        await navigator.serviceWorker.register('/sw.js');
        const reg = await navigator.serviceWorker.ready;

        const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
        if (!keyRes.ok) {
          if (inRecoveryQueue) void reportOutcome(false, `vapid_key_fetch_${keyRes.status}`);
          return;
        }
        const { key } = await keyRes.json();
        if (!key) {
          if (inRecoveryQueue) void reportOutcome(false, 'vapid_key_missing');
          return;
        }

        // The 21 July fix: we ROTATE the endpoint only when the server has
        // confirmed the current one dead (410/404). Every other open — including
        // the first standalone open after a WebAPK install — REUSES the existing
        // healthy subscription and simply re-persists it with the correct
        // context. The old code force-rotated on first standalone open, which
        // unsubscribed a working sub and (on a failed persist) stranded it as a
        // corpse — the same-day death we were seeing. Reuse can't strand.
        let sub;
        try {
          sub = await getLiveSubscription(reg, key, { forceRotate: serverPushDead });
        } catch (err) {
          // The actual, most likely reason the 7 returning students never
          // healed: pushManager.subscribe() can throw for real device-level
          // reasons (FCM/Play Services trouble on Android is the common
          // one) even with OS permission still granted.
          if (inRecoveryQueue) void reportOutcome(false, `subscribe_threw:${err instanceof Error ? err.name : 'unknown'}`);
          return;
        }
        const persisted = await persistSubscription(sub, displayMode);
        if (inRecoveryQueue) void reportOutcome(persisted.ok, persisted.ok ? undefined : persisted.reason);
      } catch (err) {
        // Still never breaks the app over a push heal — but the reason is no
        // longer thrown away. Only reported when this WAS a recovery
        // attempt; a routine reuse-path failure (permission check, SW
        // registration on an unrelated page) isn't a "recovery" fact.
        if (inRecoveryQueue) void reportOutcome(false, `unexpected:${err instanceof Error ? err.name : 'unknown'}`);
      }
    })();
  }, [serverPushDead, inRecoveryQueue]);

  return null;
}
