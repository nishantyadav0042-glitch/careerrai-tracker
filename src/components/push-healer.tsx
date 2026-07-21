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

export function PushHealer({ serverPushDead = false }: { serverPushDead?: boolean }) {
  useEffect(() => {
    if (healedThisSession) return;
    healedThisSession = true;
    (async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
        if (Notification.permission !== 'granted') return; // only heal — never prompt here

        const displayMode = detectDisplayMode();
        await navigator.serviceWorker.register('/sw.js');
        const reg = await navigator.serviceWorker.ready;

        const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
        if (!keyRes.ok) return;
        const { key } = await keyRes.json();
        if (!key) return;

        // The 21 July fix: we ROTATE the endpoint only when the server has
        // confirmed the current one dead (410/404). Every other open — including
        // the first standalone open after a WebAPK install — REUSES the existing
        // healthy subscription and simply re-persists it with the correct
        // context. The old code force-rotated on first standalone open, which
        // unsubscribed a working sub and (on a failed persist) stranded it as a
        // corpse — the same-day death we were seeing. Reuse can't strand.
        const sub = await getLiveSubscription(reg, key, { forceRotate: serverPushDead });
        await persistSubscription(sub, displayMode);
      } catch {
        /* silent — never break the app over a push heal */
      }
    })();
  }, [serverPushDead]);

  return null;
}
