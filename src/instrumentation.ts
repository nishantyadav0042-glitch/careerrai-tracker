// Centralized server-error capture. Next.js calls onRequestError for any error
// thrown while handling a request (Server Components, route handlers, etc.). We
// record it to the security_events audit trail so the hourly monitor can alert
// on error spikes. Dynamic imports keep the admin client out of the base
// instrumentation bundle. Everything is wrapped so error-logging can never throw.
//
// To add Sentry/Datadog later, forward the same (err, request, context) here —
// e.g. Sentry.captureException(err) gated on a SENTRY_DSN env var.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function onRequestError(err: any, request: any, context: any): Promise<void> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { logSecurityEvent } = await import('@/lib/security-log');
    const admin = createAdminClient();
    await logSecurityEvent(admin, {
      type: 'server_error',
      severity: 'warning',
      metadata: {
        message: String(err?.message ?? err).slice(0, 500),
        digest: err?.digest ?? null,
        path: request?.path ?? null,
        method: request?.method ?? null,
        routeType: context?.routeType ?? null,
        routePath: context?.routePath ?? null,
      },
    });
  } catch {
    // Never let the error reporter itself throw.
  }
}
