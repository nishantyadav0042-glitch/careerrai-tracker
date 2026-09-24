'use client';

import { useEffect } from 'react';
import { detectInstallSource } from '@/lib/install-source';
import { readDeploymentId } from '@/lib/client-error-meta';

// Client crash reporting, and the install-source stamp.
//
// Mounted in the student layout and, since 24 Sep, the counsellor workspace
// (/sales). Two jobs, both invisible:
//   1. Catch every uncaught error and rejected promise, and report it ONCE per
//      fingerprint per session. In a TWA a JavaScript error is invisible to
//      Play Console and to Crashlytics — without this, a screen broken on some
//      Android build is something we learn from a 1-star review.
//   2. Record where this student installed from (Play / PWA / iOS / browser),
//      once, so retention and study behaviour can be compared per source.
//
// The counsellor workspace wants job 1 only. Until it had a reporter, the only
// way we learned a rep's screen was broken was the rep telling us — "My Leads
// shows Student" reached us as a video. Job 2 is off there: the install-source
// route writes the FIRST value it sees onto the caller's profile, and a
// counsellor's phone is not a student acquisition channel.
//
// Never throws, never retries, never blocks rendering.

const seen = new Set<string>();

/** The reporter's work, outside React so it can be exercised without a
 *  browser. Returns the cleanup that removes both listeners. */
export function startCrashReporting({ stampInstallSource }: { stampInstallSource: boolean }): () => void {
  const installSource = detectInstallSource();

  // Stamp the install source once. Fire-and-forget: the API is idempotent
  // and only writes the FIRST value it ever sees for a student.
  if (stampInstallSource) {
    void fetch('/api/student/install-source', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: installSource }),
    }).catch(() => {});
  }

  // Which build served this page. Every client_errors row collected before
  // 22 Aug had app_version null, so there was no way to tell whether a fix
  // had actually landed — the single thing an error report most needs to
  // answer. Read from the script URLs Next already stamps, so no build
  // configuration and no env var has to be kept in sync.
  const appVersion = readDeploymentId(
    Array.from(document.getElementsByTagName('script')).map((el) => el.src),
  );

  const context = () => ({
    appVersion,
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
}

export function CrashReporter({ stampInstallSource = true }: { stampInstallSource?: boolean }) {
  useEffect(() => startCrashReporting({ stampInstallSource }), [stampInstallSource]);
  return null;
}
