'use client';

import { useEffect } from 'react';

// Silent push self-heal. Web-push subscriptions die (endpoint rotation, the push
// service returning 410, storage cleared) — and the app used to assume
// "permission granted = still subscribed", so a dead subscription was never
// re-created and pushes silently stopped. This runs once per session: if the OS
// permission is already granted, it ensures the browser has a live subscription
// and that the server has the current one. Never prompts, never throws.
let healedThisSession = false;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushHealer() {
  useEffect(() => {
    if (healedThisSession) return;
    healedThisSession = true;
    (async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
        if (Notification.permission !== 'granted') return; // only heal — never prompt here

        await navigator.serviceWorker.register('/sw.js');
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();

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

        // Re-persist to the server (heals push_subscription=null / push_died_at).
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
      } catch {
        /* silent — never break the app over a push heal */
      }
    })();
  }, []);

  return null;
}
