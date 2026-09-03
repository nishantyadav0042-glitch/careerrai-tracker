'use client';

import { useEffect } from 'react';

// ── THE TOKEN BRIDGE, PAGE SIDE (task #78) ──────────────────────────────────
//
// The App Store app is a WKWebView around this already-authenticated site, so
// the token handoff is one function call: the NATIVE side obtains the APNs
// device token and injects
//
//   window.__careerraiRegisterApnsToken('<hex token>')
//
// via evaluateJavaScript (see docs/notification/APNS-NATIVE-SETUP-GUIDE.md,
// which also handles the timing — native retries until this global exists,
// because the token can arrive before the page, or before login).
//
// This component defines that global. It mounts inside the student layout on
// purpose: the layout only renders authenticated, so the fetch below always
// carries the signed-in student's own session cookie, and the server binds
// the token to that student and nobody else. On every other surface —
// browsers, the Android TWA, desktop — the global simply exists and is never
// called; there is no native side to call it.
//
// Same-token replays within a page's life are dropped here (a token can be
// re-announced on every foreground); across reloads the server's own
// idempotency (registerApnsEndpoint) makes the repeat a last_seen refresh.
export function ApnsTokenBridge() {
  useEffect(() => {
    let lastSent: string | null = null;
    (window as unknown as Record<string, unknown>).__careerraiRegisterApnsToken = (token: unknown) => {
      if (typeof token !== 'string' || token === lastSent) return;
      lastSent = token;
      void fetch('/api/push/register-apns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch((e) => {
        // Losing one announcement is fine — native re-announces on the next
        // foreground, and the server refresh is idempotent. Never surface this
        // to the student.
        console.warn('[apns-bridge] register failed, will retry on next announce:', e);
        lastSent = null;
      });
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__careerraiRegisterApnsToken;
    };
  }, []);

  return null;
}
