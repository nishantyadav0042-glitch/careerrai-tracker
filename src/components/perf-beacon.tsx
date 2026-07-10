'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Step 13: the founder speedometer, client half. Invisible to students —
// no UI, no behaviour change. Records what a real device on a real network
// actually experienced:
//   ttfb / fcp / lcp / interactive  — first load of the session
//   nav                             — tap-to-committed time for in-app
//                                     navigations (anchor tap → new route
//                                     rendered)
// Batched and flushed with sendBeacon on pagehide (and a post-load timer),
// so it never competes with real requests. Collector: /api/perf.

interface PerfEvent { path: string; metric: string; value: number; device: string; connection: string }

function deviceClass(): string {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return 'desktop';
}

function connectionClass(): string {
  const c = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  return c?.effectiveType ?? 'unknown';
}

export function PerfBeacon() {
  const pathname = usePathname();
  const queue = useRef<PerfEvent[]>([]);
  const tapAt = useRef<number | null>(null);
  const lastPath = useRef<string | null>(null);
  const sentLoad = useRef(false);

  // Flush helpers live in refs so listeners registered once can see them.
  const flush = useRef(() => {
    if (queue.current.length === 0) return;
    const payload = JSON.stringify({ events: queue.current });
    queue.current = [];
    try {
      if (!navigator.sendBeacon?.('/api/perf', new Blob([payload], { type: 'application/json' }))) {
        fetch('/api/perf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
      }
    } catch { /* never let telemetry throw */ }
  });

  // First-load metrics + lifecycle listeners — once per session.
  useEffect(() => {
    if (sentLoad.current) return;
    sentLoad.current = true;
    const device = deviceClass();
    const connection = connectionClass();
    const path = window.location.pathname;
    const push = (metric: string, value: number) => {
      if (value >= 0 && Number.isFinite(value)) queue.current.push({ path, metric, value, device, connection });
    };

    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      push('ttfb', nav.responseStart);
      push('interactive', nav.domInteractive);
    }
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    if (fcp) push('fcp', fcp.startTime);

    let lcpValue = 0;
    let lcpObserver: PerformanceObserver | null = null;
    try {
      lcpObserver = new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        if (last) lcpValue = last.startTime;
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch { /* older browsers — fine without LCP */ }

    const finalize = () => {
      if (lcpValue > 0) {
        queue.current.push({ path, metric: 'lcp', value: lcpValue, device, connection });
        lcpValue = 0; // only report once
      }
      flush.current();
    };
    const onHide = () => { if (document.visibilityState === 'hidden') finalize(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', finalize);
    // Also flush shortly after load so sessions that never background still report.
    const timer = window.setTimeout(finalize, 8000);

    // Tap-to-route timing: remember when an internal link was tapped.
    const onTap = (e: MouseEvent | TouchEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('a[href^="/"]');
      if (el) tapAt.current = performance.now();
    };
    document.addEventListener('click', onTap, { capture: true, passive: true });

    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', finalize);
      document.removeEventListener('click', onTap, { capture: true });
      window.clearTimeout(timer);
      lcpObserver?.disconnect();
    };
  }, []);

  // Route-change timing: pathname committed after a recorded tap.
  useEffect(() => {
    if (lastPath.current !== null && lastPath.current !== pathname && tapAt.current !== null) {
      const value = performance.now() - tapAt.current;
      tapAt.current = null;
      if (value >= 0 && value < 60_000) {
        queue.current.push({ path: pathname, metric: 'nav', value, device: deviceClass(), connection: connectionClass() });
        if (queue.current.length >= 8) flush.current();
      }
    }
    lastPath.current = pathname;
  }, [pathname]);

  return null;
}
