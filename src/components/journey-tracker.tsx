'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { track, flushEvents, bindFlushOnHide, detectDisplayMode, sessionIsNew } from '@/lib/journey';
import { startAutocapture, takeScrollDepth } from '@/lib/autocapture';
import { classifyLaunch, isReentry, noteHidden, noteVisible, type AwayClock } from '@/lib/session-boundary';

// Mounted once in the root layout — the analytics spine of the whole app.
//  • app_open (with display-mode + push-permission snapshot, and since 22 Sep
//    `session_new` — a cold start rather than a reload — and `launch`, the
//    door it came through; see lib/session-boundary.ts)
//  • app_resume — the app became visible again after a real absence. A
//    resident PWA is reopened by visibilitychange, not a remount, so without
//    this a whole evening's return was invisible.
//  • autocapture of EVERY tap + scroll depth (see lib/autocapture.ts)
//  • per-screen: screen_view (with the screen it came from) and screen_exit
//    (with dwell time + how far it was scrolled)
// Explicit semantic events (daily_log, buddy_plan_click, push_enabled, …) keep
// firing from their own call sites via track(); autocapture is the safety net
// that guarantees nothing is invisible.
export function JourneyTracker() {
  const pathname = usePathname();
  const prev = useRef<{ path: string; at: number } | null>(null);
  // Set by the service worker's NOTIFICATION_APP_OPEN message (a tapped
  // notification focused this already-open client). Consumed by the next
  // resume so its door reads 'notification' rather than 'icon'.
  const notifFocus = useRef(false);

  useEffect(() => {
    bindFlushOnHide();
    startAutocapture();

    const mode = detectDisplayMode();
    let notif = 'unsupported';
    try { if ('Notification' in window) notif = Notification.permission; } catch { /* ignore */ }
    const browserOnlyPush = notif === 'granted' && mode !== 'standalone' && mode !== 'twa';
    let launch = 'unknown';
    try {
      launch = classifyLaunch({
        search: window.location.search,
        referrer: document.referrer,
        origin: window.location.origin,
        displayMode: mode,
      });
    } catch { /* a door we cannot name is still an open */ }
    track('app_open', {
      notif_permission: notif, browser_only_push: browserOnlyPush, referrer: document.referrer || null,
      launch, session_new: sessionIsNew(),
    });

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

    // The SW posts this when a notification tap focuses a client that is
    // already open (notification-attribution.tsx reports it server-side; this
    // only remembers it for the resume that is about to follow).
    const onSwMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'NOTIFICATION_APP_OPEN') notifFocus.current = true;
    };
    try { navigator.serviceWorker?.addEventListener('message', onSwMessage); } catch { /* no SW */ }

    // Close out the final screen's dwell + scroll when the app is backgrounded,
    // and record the return when it comes back after a real absence.
    let clock: AwayClock = { hiddenAt: null };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (prev.current) {
          track('screen_exit', {
            screen: prev.current.path,
            dwell_ms: Date.now() - prev.current.at,
            scroll_pct: takeScrollDepth(),
            reason: 'hidden',
          });
          flushEvents();
        }
        clock = noteHidden(clock, Date.now());
        return;
      }
      if (document.visibilityState === 'visible') {
        const { hiddenMs, clock: next } = noteVisible(clock, Date.now());
        clock = next;
        if (!isReentry(hiddenMs)) return;
        let door = 'unknown';
        try {
          door = classifyLaunch({
            search: '', referrer: '', origin: window.location.origin,
            displayMode: detectDisplayMode(), notificationMessage: notifFocus.current,
          });
        } catch { /* see above */ }
        notifFocus.current = false;
        track('app_resume', { hidden_ms: hiddenMs, launch: door, screen: prev.current?.path ?? pathname ?? null });
        // The screen's dwell clock restarts: the time away was already closed
        // out by the screen_exit above and must not be counted twice.
        if (prev.current) prev.current = { path: prev.current.path, at: Date.now() };
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      try { navigator.serviceWorker?.removeEventListener('message', onSwMessage); } catch { /* no SW */ }
    };
    // Mount-only by design: the launch is a fact about the page load, and the
    // listeners read `prev` through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
