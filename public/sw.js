// Service Worker — push notifications + installability (v4)
//
// Chrome only offers ONE-TAP PWA install (fires `beforeinstallprompt`) when the
// site has a service worker with a REAL fetch handler. So we add one — but it is
// strictly NETWORK-ONLY: it caches nothing and always goes to the network, which
// means deploys are never stale (the reason an earlier version had no handler at
// all). This gives us both: clean one-click install AND always-fresh builds.
self.addEventListener('fetch', (event) => {
  // Only GET requests; let POST/PUT/etc. (API calls) pass through untouched.
  if (event.request.method !== 'GET') return;
  // Pure network pass-through — no cache read or write, so never stale.
  event.respondWith(fetch(event.request).catch(() => Response.error()));
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

  event.waitUntil(
    self.registration.showNotification(
      notificationData.title || 'CareerRai',
      options
    )
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked:', event.notification.tag);

  event.notification.close();

  // Default: open home page
  const urlToOpen = new URL('/', self.location.origin);
  const data = event.notification.data;

  // If there's a URL in the notification data, use that
  if (data && data.url) {
    urlToOpen.pathname = data.url;
  }

  event.waitUntil(
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
