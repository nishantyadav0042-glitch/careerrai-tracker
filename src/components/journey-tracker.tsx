'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { track, flushEvents, bindFlushOnHide, detectDisplayMode } from '@/lib/journey';
import { startAutocapture, takeScrollDepth } from '@/lib/autocapture';

// Mounted once in the root layout — the analytics spine of the whole app.
//  • app_open (with display-mode + push-permission snapshot)
//  • autocapture of EVERY tap + scroll depth (see lib/autocapture.ts)
//  • per-screen: screen_view (with the screen it came from) and screen_exit
//    (with dwell time + how far it was scrolled)
// Explicit semantic events (daily_log, buddy_plan_click, push_enabled, …) keep
// firing from their own call sites via track(); autocapture is the safety net
// that guarantees nothing is invisible.
export function JourneyTracker() {
  const pathname = usePathname();
  const prev = useRef<{ path: string; at: number } | null>(null);

  useEffect(() => {
    bindFlushOnHide();
    startAutocapture();

    const mode = detectDisplayMode();
    let notif = 'unsupported';
    try { if ('Notification' in window) notif = Notification.permission; } catch { /* ignore */ }
    const browserOnlyPush = notif === 'granted' && mode !== 'standalone' && mode !== 'twa';
    track('app_open', { notif_permission: notif, browser_only_push: browserOnlyPush, referrer: document.referrer || null });

    // Broadcast-channel attribution. A WhatsApp/Instagram Channel never tells
    // us who follows it, so the only way to measure one is the traffic it
    // sends back: every link posted there carries ?src=wa (see lib/channels.ts)
    // and lands here. This is what turns "we posted something" into "that post
    // pulled 40 students into the app".
    try {
      const params = new URLSearchParams(window.location.search);
      const src = params.get('src');
      if (src) {
        track('channel_referred', {
          src,
          campaign: params.get('c'),
          screen: window.location.pathname,
        });
      }
    } catch { /* attribution must never break the app */ }

    // Close out the final screen's dwell + scroll when the app is backgrounded.
    const onHide = () => {
      if (document.visibilityState === 'hidden' && prev.current) {
        track('screen_exit', {
          screen: prev.current.path,
          dwell_ms: Date.now() - prev.current.at,
          scroll_pct: takeScrollDepth(),
          reason: 'hidden',
        });
        flushEvents();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  // Every route change: exit the old screen (with dwell + scroll), enter the new.
  useEffect(() => {
    if (!pathname) return;
    const now = Date.now();
    if (prev.current) {
      track('screen_exit', {
        screen: prev.current.path,
        to: pathname,
        dwell_ms: now - prev.current.at,
        scroll_pct: takeScrollDepth(),
        reason: 'navigate',
      });
    }
    track('screen_view', { screen: pathname, from: prev.current?.path ?? null });
    prev.current = { path: pathname, at: now };
  }, [pathname]);

  return null;
}
