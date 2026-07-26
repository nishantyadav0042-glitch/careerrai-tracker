'use client';

import { useEffect } from 'react';
import { detectInstallSource } from '@/lib/install-source';

// Client crash reporting, and the install-source stamp.
//
// Mounted once in the student layout. Two jobs, both invisible:
//   1. Catch every uncaught error and rejected promise, and report it ONCE per
//      fingerprint per session. In a TWA a JavaScript error is invisible to
//      Play Console and to Crashlytics — without this, a screen broken on some
//      Android build is something we learn from a 1-star review.
//   2. Record where this student installed from (Play / PWA / iOS / browser),
//      once, so retention and study behaviour can be compared per source.
//
// Never throws, never retries, never blocks rendering.

const seen = new Set<string>();

export function CrashReporter() {
  useEffect(() => {
    const installSource = detectInstallSource();

    // Stamp the install source once. Fire-and-forget: the API is idempotent
    // and only writes the FIRST value it ever sees for a student.
    void fetch('/api/student/install-source', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: installSource }),
    }).catch(() => {});

    const context = () => ({
      path: window.location.pathname,
      displayMode: window.matchMedia?.('(display-mode: standalone)').matches ? 'standalone' : 'browser',
      installSource,
      browser: navigator.userAgent.slice(0, 40),
      platform: navigator.platform,
    });

    const report = (payload: Record<string, unknown>) => {
      const fp = `${payload.message}|${payload.file}|${payload.line}`;
      if (seen.has(fp)) return;   // one report per bug per session
      seen.add(fp);
      void fetch('/api/client-error', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, ...context() }),
        keepalive: true,          // survives the page unloading mid-crash
      }).catch(() => {});
    };

    const onError = (e: ErrorEvent) => report({
      source: 'error',
      message: e.message || 'Unknown error',
      file: e.filename, line: e.lineno,
      stack: e.error?.stack,
    });

    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      report({
        source: 'unhandledrejection',
        message: (r instanceof Error ? r.message : String(r ?? 'Unknown rejection')) || 'Unknown rejection',
        stack: r instanceof Error ? r.stack : undefined,
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
