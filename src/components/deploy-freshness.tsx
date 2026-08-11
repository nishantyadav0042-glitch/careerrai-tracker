'use client';

import { useEffect, useRef } from 'react';

// ── An open app must notice a new deployment ────────────────────────────────
//
// 11 Aug: ten builds went live and the founder, whose installed app had been
// open since before the push, saw none of them — "Nothing is live out of
// these 10." He was running the client bundle his app launched with, and
// nothing in the system ever told an old client that the world had moved.
// The service worker is deliberately network-only (no stale cache), but a
// LOADED bundle is its own cache, and the only cure is a reload.
//
// So: the server bakes its deployment id into the page (layout passes it in),
// and this component compares that against /api/version — which is always
// answered by the deployment that is live now — whenever the app comes back
// to the foreground, and on a slow heartbeat while it stays open. A mismatch
// means this client is running yesterday's app: reload, once, at a moment
// that cannot lose anyone's work (visibility flips are navigation moments,
// and the heartbeat only fires when the tab is visible and no input is
// focused).
export function DeployFreshness({ current }: { current: string }) {
  const reloaded = useRef(false);

  useEffect(() => {
    // Local dev has no deployment id; nothing to compare.
    if (!current || current === 'dev') return;

    let cancelled = false;

    const check = async () => {
      if (cancelled || reloaded.current) return;
      if (document.visibilityState !== 'visible') return;
      // Never yank the page out from under someone mid-typing.
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return;
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const { dpl } = (await res.json()) as { dpl?: string };
        if (dpl && dpl !== 'dev' && dpl !== current) {
          // One reload per stale client — the reloaded page carries the new id.
          reloaded.current = true;
          window.location.reload();
        }
      } catch {
        // Offline or flaky network: stay quiet, try again on the next signal.
      }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    // Heartbeat for the session that never backgrounds (a laptop admin tab).
    const interval = window.setInterval(() => void check(), 5 * 60 * 1000);
    // First check shortly after load — cheap, and it catches a client that was
    // restored from the back/forward cache with an old bundle.
    const initial = window.setTimeout(() => void check(), 15_000);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
      window.clearTimeout(initial);
    };
  }, [current]);

  return null;
}
