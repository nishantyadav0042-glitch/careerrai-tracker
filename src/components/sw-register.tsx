'use client';

import { useEffect } from 'react';

// Registers the service worker on every page load. This is required for BOTH:
//  • PWA installability (Chrome only fires beforeinstallprompt when a SW is
//    registered), so the app can be added to the home screen from the ad landing.
//  • Web push — the push subscription lives on this registration.
// Previously the SW was only registered when a user toggled push, so the app was
// effectively never installable and push was unreliable.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[sw] registration failed:', err);
      });
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
  }, []);
  return null;
}
