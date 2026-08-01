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
// rendered into the onboarding UI. `client_errors` recorded zero rows for it.
// We found out from a screenshot a student sent the founder.
//
// Call this wherever an error message is put on screen. It never throws, never
// retries, and never blocks the render it is reporting on.

const seen = new Set<string>();

export interface HandledErrorContext {
  /** Where in the product this happened, e.g. 'onboarding:blueprint-save'. */
  where: string;
  /** Optional sub-location — a step index, a plan id, whatever narrows it. */
  detail?: string | number;
}

/**
 * Pull a useful string out of whatever was thrown.
 *
 * THE BUG THIS EXISTS TO PREVENT: the first version of this file used
 * `e instanceof Error ? e.message : String(e)`. Supabase/PostgREST errors are
 * **plain objects**, not Error instances — postgrest-js only constructs an
 * Error when `throwOnError` is used, which this codebase never does. So
 * `String(e)` produced `"[object Object]"`, and the reporter written to make
 * sure Incident #14 could never go unlogged again would have logged Incident
 * #14 as `[object Object]`.
 *
 * Pure and exported so every shape is covered by tests.
 */
export function errorText(e: unknown): string {
  if (e == null) return '';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message || e.name || 'Error';

  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    // PostgrestError is { message, details, hint, code }. `details` and `hint`
    // are frequently where the actionable part lives, so keep them.
    const parts = [str(o.message), str(o.details), str(o.hint)].filter(Boolean);
    const code = str(o.code);
    if (parts.length) return code ? `${parts.join(' · ')} [${code}]` : parts.join(' · ');
    if (code) return `error ${code}`;
    try {
      const json = JSON.stringify(e);
      if (json && json !== '{}') return json.slice(0, 400);
    } catch { /* circular — fall through */ }
    return '[unserialisable error object]';
  }

  return String(e);
}

export function reportHandledError(error: unknown, context: HandledErrorContext): void {
  try {
    const message = errorText(error);
    if (!message) return;

    // One report per distinct problem per session. Keyed on message AND place,
    // so a student retrying one broken step is a single row while a genuinely
    // different failure at the same place still gets through.
    const fingerprint = `${message}|${context.where}|${context.detail ?? ''}`;
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);

    // `where`/`detail` are sent as `file`/`line` on purpose: those are the two
    // location keys /api/client-error folds into its fingerprint. An earlier
    // version invented `where`/`screen` keys, which the route ignores — so
    // every handled error fingerprinted on message alone, and two different
    // failures sharing one generic message ("Failed to fetch") collapsed into
    // a single group on /admin/launch.
    //
    // Note they survive ONLY inside the fingerprint: client_errors has no
    // file/line column, so the route reads these to group and then drops them.
    // Grouping is what this is for, so that is enough — but do not expect to
    // read the location back off the row.
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'handled',
        message,
        file: context.where,
        line: context.detail ?? null,
        stack: error instanceof Error ? error.stack : undefined,
        path: typeof window !== 'undefined' ? window.location.pathname : undefined,
        displayMode: typeof window !== 'undefined'
          && window.matchMedia?.('(display-mode: standalone)').matches ? 'standalone' : 'browser',
        browser: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 40) : undefined,
        platform: typeof navigator !== 'undefined' ? navigator.platform : undefined,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting must never be the thing that breaks the screen.
  }
}
