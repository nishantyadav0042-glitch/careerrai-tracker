'use client';

import { useEffect } from 'react';

// Registers the service worker on every load (required for PWA install + push)
// AND keeps it from causing stale builds:
//  • The SW has no fetch handler, so it never serves cached pages.
//  • On load we call reg.update() to pull any new SW immediately.
//  • When a NEW service worker takes control (after a deploy), we reload ONCE so
//    the user lands on the latest build instead of a stale one. We only reload
//    when there was already a controller (an update) — never on first install.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;

    const onControllerChange = () => {
      if (reloaded || !hadController) return; // first install → nothing to refresh
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => { reg.update().catch(() => {}); })
        .catch((err) => console.warn('[sw] registration failed:', err));
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);
  return null;
}
