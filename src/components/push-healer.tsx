'use client';

import { useEffect } from 'react';
import { detectDisplayMode } from '@/lib/journey';

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

const STANDALONE_RESUB_KEY = 'cr_standalone_resub_v1';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushHealer({ serverPushDead = false }: { serverPushDead?: boolean }) {
  useEffect(() => {
    if (healedThisSession) return;
    healedThisSession = true;
    (async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
        if (Notification.permission !== 'granted') return; // only heal — never prompt here

        const displayMode = detectDisplayMode();
        // First standalone open on this device → the WebAPK migration moment.
        let firstStandaloneOpen = false;
        if (displayMode === 'standalone' || displayMode === 'twa') {
          try {
            firstStandaloneOpen = localStorage.getItem(STANDALONE_RESUB_KEY) !== '1';
          } catch { /* ignore */ }
        }

        await navigator.serviceWorker.register('/sw.js');
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();

        // A present-but-doomed subscription: the server saw it 410/404, or this
        // is the first open after install (tab-era endpoints often die here).
        // Kill it and mint a fresh one — re-uploading it heals nothing.
        if (sub && (serverPushDead || firstStandaloneOpen)) {
          try { await sub.unsubscribe(); } catch { /* ignore */ }
          sub = null;
        }

        if (!sub) {
          const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
          if (!keyRes.ok) return;
          const { key } = await keyRes.json();
          if (!key) return;
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
          });
        }

        // Re-persist to the server (heals push_subscription=null / push_died_at)
        // WITH the grant context, so push_context reflects where the sub
        // actually lives now (installed app vs browser tab).
        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON(), context: displayMode }),
        });
        if (res.ok && firstStandaloneOpen) {
          try { localStorage.setItem(STANDALONE_RESUB_KEY, '1'); } catch { /* ignore */ }
        }
      } catch {
        /* silent — never break the app over a push heal */
      }
    })();
  }, [serverPushDead]);

  return null;
}
