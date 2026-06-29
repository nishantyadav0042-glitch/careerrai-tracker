// Service Worker — push notifications (v3)
//
// DELIBERATELY no 'fetch' handler. A fetch handler (even a no-op) makes the SW
// intercept every navigation/asset request, which left users stuck on a stale
// cached build after each deploy ("none of these are deployed"). Without one the
// SW never touches loads, so every page is fetched fresh from the network — and
// the app is still installable in modern Chrome with just a registered SW +
// manifest (the fetch-handler requirement was dropped years ago).

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
