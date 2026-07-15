'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { track, bindFlushOnHide, detectDisplayMode } from '@/lib/journey';

// Mounted once in the root layout. Auto-captures the spine of every student's
// journey — app opens and page views — each stamped with display_mode (real app
// vs browser tab) and browser, plus the current push-permission state. Explicit
// events (push_enabled, install_accepted, daily_log, …) are fired from their own
// call sites via track().
export function JourneyTracker() {
  const pathname = usePathname();

  // Once per load: the session's opening event + push permission snapshot.
  useEffect(() => {
    bindFlushOnHide();
    const mode = detectDisplayMode();
    let notif: string = 'unsupported';
    try { if ('Notification' in window) notif = Notification.permission; } catch { /* ignore */ }
    // The tell-tale signal: push permission GRANTED but the app is running in a
    // browser tab, not standalone → a browser-bound subscription that usually
    // can't deliver. Flagged here so it's queryable directly.
    const browserOnlyPush = notif === 'granted' && mode !== 'standalone' && mode !== 'twa';
    track('app_open', { notif_permission: notif, browser_only_push: browserOnlyPush, referrer: document.referrer || null });
  }, []);

  // Every route change is a page view in the journey.
  useEffect(() => {
    if (pathname) track('pageview', {});
  }, [pathname]);

  return null;
}
