// Service Worker — push notifications + installability (v8: chat threads
// collapse to one tray entry; v7: never answer a navigation)
//
// Chrome only offers ONE-TAP PWA install (fires `beforeinstallprompt`) when the
// site has a service worker with a REAL fetch handler. So we add one — but it is
// strictly NETWORK-ONLY: it caches nothing and always goes to the network, which
// means deploys are never stale (the reason an earlier version had no handler at
// all). This gives us both: clean one-click install AND always-fresh builds.
//
// ⚠️ v7 — DO NOT reintroduce respondWith on navigations. v6 did this:
//
//     event.respondWith(fetch(event.request).catch(() => Response.error()));
//
// which made this worker the thing that answers the page load itself. When that
// inner fetch fails for ANY reason, the worker hands the browser a synthetic
// network error and the result is a blank screen — with no request ever leaving
// the process, so a network monitor reads 0 bytes / no active connections and
// the failure looks like the device is offline when it isn't.
//
// That is not theoretical: it is the shape of the iOS wrapper's blank screen.
// A service worker registration lives in WKWebView's own data store, so once
// registered inside the app it controls every later launch — while Safari on the
// same device, which has a completely separate store, keeps loading the site
// perfectly. Any first-load hiccup (a cold start before the network stack is
// ready, an app-bound-domain block, a killed process mid-request) becomes a
// permanent blank screen the app can never recover from on its own, because the
// worker also has to be reachable to be replaced.
//
// A worker must never be able to break a page load. So navigations go straight
// to the network untouched, while subresources keep flowing through a real
// handler — Chrome's installability check wants a worker that actually does
// something, and a failed image or script degrades a page instead of replacing
// it with a blank one.
self.addEventListener('fetch', (event) => {
  // Only GET requests; let POST/PUT/etc. (API calls) pass through untouched.
  if (event.request.method !== 'GET') return;
  // THE FIX: never intercept a navigation or a document request. Returning
  // without calling respondWith hands it back to the browser's own network
  // stack, which has real retries, real reachability logic and real error
  // pages — none of which a worker can reproduce, and all of which it can
  // destroy by answering first.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') return;
  // Subresources: still a genuine network-only pass-through. No .catch that
  // manufactures a synthetic error — a rejected fetch is left to fail exactly
  // as it would have without a worker in the path.
  event.respondWith(fetch(event.request));
});

self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received:', event);

  if (!event.data) {
    console.warn('[Service Worker] Push received but no data');
    return;
  }

  let notificationData;
  try {
    notificationData = event.data.json();
  } catch (e) {
    console.warn('[Service Worker] Failed to parse push data, using text:', e);
    notificationData = {
      title: 'CareerRai Notification',
      body: event.data.text(),
    };
  }

  const options = {
    badge: '/careerrai-logo.png',
    icon: '/careerrai-logo.png',
    tag: notificationData.tag || 'careerrai-notification',
    // Per the Web Push spec, two notifications sharing a tag collapse into one
    // and the second is SILENT (no sound/vibration) unless renotify is true.
    // The server now sends a unique tag per push, but this stays as a safety
    // net for any caller that ever reuses one.
    renotify: true,
    requireInteraction: notificationData.requireInteraction || false,
    data: notificationData.data || {},
    ...notificationData,
  };

  // Delivery beacon: stamps received_at the moment the push ARRIVES on the
  // device — the SW wakes for this even with the app fully closed, so this is
  // the device-level proof that delivery does not depend on app opens.
  // Best-effort: a failed beacon must never block showing the notification.
  // ── Chat threads collapse into ONE tray entry (Shreya, 12 Aug) ────────────
  //
  // Chat pushes share a stable `chat-<pair>` tag, so the OS already replaces
  // the previous entry (renotify keeps the sound). What the OS cannot do is
  // COUNT — so before showing, read the entry being replaced and carry its
  // count forward: the second message onward renders as
  // "Shreya · 3 new messages 💬" with the latest text as the body. Tapping or
  // dismissing the notification resets the thread count naturally, because
  // the tagged entry disappears with it. Non-chat pushes are untouched: their
  // per-send unique tags keep every reminder its own alert.
  const isChatThread = typeof options.tag === 'string' && options.tag.indexOf('chat-') === 0;
  const showPromise = isChatThread
    ? self.registration.getNotifications({ tag: options.tag }).then(function (existing) {
        const prev = existing && existing[0];
        const count = ((prev && prev.data && prev.data.chatCount) || (prev ? 1 : 0)) + 1;
        options.data = options.data || {};
        options.data.chatCount = count;
        let title = notificationData.title || 'CareerRai';
        if (count > 1) {
          const sender = (options.data && options.data.senderName) || title.replace(/ sent you a message.*$/, '');
          title = sender + ' · ' + count + ' new messages 💬';
        }
        return self.registration.showNotification(title, options);
      }).catch(function () {
        // Counting is a nicety; showing the notification is the job.
        return self.registration.showNotification(notificationData.title || 'CareerRai', options);
      })
    : self.registration.showNotification(notificationData.title || 'CareerRai', options);

  const work = [showPromise];
  const notifId = notificationData.data && notificationData.data.notifId;
  if (notifId) {
    work.push(
      fetch('/api/push/received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notifId }),
      }).catch(() => {})
    );
  }
  event.waitUntil(Promise.all(work));
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  // new URL(path, origin) keeps query strings intact — the old
  // `urlToOpen.pathname = data.url` dropped them.
  const urlToOpen = new URL(data.url || '/', self.location.origin);

  const work = [];

  // Click beacon: the ONLY signal web push gives us that a notification was
  // seen. Feeds clicked_at on the notifications row — cooldown logic and the
  // admin health dashboard both run on it. Best-effort: a failed beacon
  // must never block opening the app.
  if (data.notifId) {
    work.push(
      fetch('/api/push/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: data.notifId }),
      }).catch(() => {})
    );
  }

  work.push(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if we already have a window open
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen.href && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );

  event.waitUntil(Promise.all(work));
});

// Handle notification dismissal
self.addEventListener('notificationclose', (event) => {
  console.log('[Service Worker] Notification closed:', event.notification.tag);
});

// Keep the service worker alive for background sync
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(clients.claim());
});

// Handle messages from the client
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
