'use client';

import { useEffect } from 'react';

// The client half of app-open attribution (Installment 4, Batch A). Two
// signals, matching the two paths sw.js's notificationclick handler uses:
//
//   1. Cold start: the tapped notification's id rides a `src_notif` query
//      param on the URL clients.openWindow() opened. Read once on mount,
//      then stripped via history.replaceState so a refresh or back-nav
//      doesn't re-attribute the same app-open to the same notification.
//   2. Already open: the page never reloads, so there's no URL to read —
//      sw.js instead posts a message to the focused client.
//
// Both funnel into the same POST. Fire-and-forget from the app's
// perspective (a failed beacon must never block anything the student is
// doing), but never silent — see report() below.
function report(notifId: string) {
  fetch('/api/push/app-open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: notifId }),
  }).catch((e) => console.warn('[notification-attribution] app-open beacon failed:', e));
}

export function NotificationAttribution() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('src_notif');
    if (fromUrl) {
      report(fromUrl);
      params.delete('src_notif');
      const rest = params.toString();
      const cleanUrl = window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash;
      window.history.replaceState(null, '', cleanUrl);
    }

    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'NOTIFICATION_APP_OPEN' && typeof event.data.notifId === 'string') {
        report(event.data.notifId);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  return null;
}
