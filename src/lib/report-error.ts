// ── Reporting the errors we HANDLE ──────────────────────────────────────────
//
// `crash-reporter.tsx` listens for `window.onerror` and `unhandledrejection`.
// Between them they catch every error nobody caught — and miss every error we
// did. A `catch` that renders a red box is neither an uncaught error nor an
// unhandled rejection, so it is invisible to us.
//
// That is backwards. An error shown to a student is, by definition, the one
// kind of error we KNOW a student saw.
//
// Incident #14 is the cost: "permission denied for function is_admin" was
// rendered into the onboarding UI for five days. `client_errors` recorded zero
// rows for it. We found out from a screenshot a student sent the founder, and
// because nothing was logged we still cannot say how many people it stopped.
//
// Call this wherever an error message is put on screen. It never throws, never
// retries, and never blocks the render it is reporting on.

const seen = new Set<string>();

export interface HandledErrorContext {
  /** Where in the product this happened, e.g. 'onboarding:step-save'. */
  where?: string;
  [key: string]: unknown;
}

export function reportHandledError(message: unknown, context: HandledErrorContext = {}): void {
  try {
    const text = message instanceof Error ? message.message : String(message ?? '');
    if (!text) return;

    // One report per distinct problem per session. A student retrying a broken
    // step five times is one bug, not five rows.
    const fingerprint = `${text}|${context.where ?? ''}`;
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);

    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'handled',
        message: text,
        stack: message instanceof Error ? message.stack : undefined,
        path: typeof window !== 'undefined' ? window.location.pathname : undefined,
        displayMode: typeof window !== 'undefined'
          && window.matchMedia?.('(display-mode: standalone)').matches ? 'standalone' : 'browser',
        browser: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 40) : undefined,
        platform: typeof navigator !== 'undefined' ? navigator.platform : undefined,
        ...context,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting must never be the thing that breaks the screen.
  }
}
