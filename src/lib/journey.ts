// Client-side journey tracking. Every event carries the context that the old
// telemetry lacked: display_mode (installed app vs browser tab) + which browser
// + platform. This is what lets us see, per student, whether push was granted
// in the real app or a browser tab (the root cause of undelivered notifications).
//
// Best-effort and non-blocking by design: events are queued and flushed with
// keepalive/sendBeacon, and every failure is swallowed. Tracking must never
// slow down or break the app.

export type DisplayMode = 'standalone' | 'twa' | 'browser' | 'unknown';

// Reuse the same anon cookie the /start funnel already sets, so a visitor's
// pre-signup clicks and their post-signup student events share one identity.
function getAnonId(): string {
  try {
    const m = document.cookie.match(/(?:^|; )cr_anon=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `a${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    document.cookie = `cr_anon=${id}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
    return id;
  } catch {
    return 'anon';
  }
}

// One id per browsing session (cleared when the tab/app is closed).
function getSessionId(): string {
  try {
    const k = 'cr_sid';
    let id = sessionStorage.getItem(k);
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `s${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(k, id);
    }
    return id;
  } catch {
    return 'sess';
  }
}

export function detectDisplayMode(): DisplayMode {
  if (typeof window === 'undefined') return 'unknown';
  try {
    if (document.referrer.startsWith('android-app://')) return 'twa';
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
    return standalone ? 'standalone' : 'browser';
  } catch {
    return 'unknown';
  }
}

export function detectBrowser(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  // Order matters: in-app webviews first (they also contain "Chrome"/"Safari").
  if (/(FBAN|FBAV|Instagram)/i.test(ua)) return 'instagram';
  if (/Line\//i.test(ua)) return 'line';
  if (/MicroMessenger/i.test(ua)) return 'wechat';
  if (/(FB_IAB|FB4A)/i.test(ua)) return 'facebook';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/EdgA?\//i.test(ua)) return 'edge';
  if (/(FxiOS|Firefox)/i.test(ua)) return 'firefox';
  if (/(OPR|OPX|OperaMini)/i.test(ua)) return 'opera';
  if (/UCBrowser/i.test(ua)) return 'uc';
  if (/CriOS|Chrome/i.test(ua)) return 'chrome';
  if (/Safari/i.test(ua)) return 'safari';
  if (/; wv\)/i.test(ua)) return 'android-webview';
  return 'other';
}

export function detectPlatform(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

interface QueuedEvent {
  event: string;
  props: Record<string, unknown>;
  path: string;
  ts: number;
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function context() {
  return {
    anon: getAnonId(),
    sessionId: getSessionId(),
    displayMode: detectDisplayMode(),
    browser: detectBrowser(),
    platform: detectPlatform(),
  };
}

// Days since this device first opened CareerRai (cohort/retention axis).
function daysSinceInstall(): number {
  try {
    const m = document.cookie.match(/(?:^|; )cr_first_seen=([^;]+)/);
    let first: number;
    if (m) {
      first = Number(m[1]);
    } else {
      first = Date.now();
      document.cookie = `cr_first_seen=${first}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
    }
    return Math.max(0, Math.floor((Date.now() - first) / 86_400_000));
  } catch {
    return 0;
  }
}

// Per-flush enrichment merged into every event server-side (see the ingest).
// Cheap, device/session-level context that would be wasteful to repeat inline.
function envCtx() {
  const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
  return {
    vw: typeof window !== 'undefined' ? window.innerWidth : null,
    vh: typeof window !== 'undefined' ? window.innerHeight : null,
    net: nav.connection?.effectiveType ?? null,
    dayN: daysSinceInstall(),
    appv: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
  };
}

function flush(useBeacon = false): void {
  if (typeof window === 'undefined' || queue.length === 0) return;
  const batch = queue;
  queue = [];
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  const payload = JSON.stringify({ ...context(), ctx: envCtx(), events: batch });
  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/events/track', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/events/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* best effort */
  }
}

// Monotonic within a page load — lets the event stream be replayed in exact
// order even when timestamps collide (autocapture fires many events per ms).
let seq = 0;

/** Record one journey event. Fire-and-forget; batched ~1s, flushed on hide. */
export function track(event: string, props: Record<string, unknown> = {}): void {
  try {
    if (typeof window === 'undefined') return;
    queue.push({ event, props: { ...props, seq: seq++ }, path: window.location?.pathname ?? '', ts: Date.now() });
    if (queue.length >= 12) { flush(); return; }
    if (!flushTimer) flushTimer = setTimeout(() => flush(), 1000);
  } catch {
    /* best effort */
  }
}

/** Force an immediate beacon flush — used when a screen is about to unload. */
export function flushEvents(): void {
  flush(true);
}

let listenersBound = false;
/** Flush any pending events when the page is hidden/closed. Idempotent. */
export function bindFlushOnHide(): void {
  if (listenersBound || typeof window === 'undefined') return;
  listenersBound = true;
  window.addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
}
