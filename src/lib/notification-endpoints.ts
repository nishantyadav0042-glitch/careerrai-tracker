// A web-push subscription as the browser serialises it. Declared here rather
// than imported: push-validate.ts exports only the endpoint validator, and
// web-push's own type is a server dependency this module does not need.
export interface PushSubscriptionJSON {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
  expirationTime?: number | null;
}

// ── THE ENDPOINT REGISTRY: read and write, in one place ─────────────────────
//
// Step 2 of replacing `profiles.push_subscription` (a single jsonb column, so
// one device per student — a second install silently evicted the first).
// Step 1 (migration 20260901a) created notification_endpoints and backfilled
// it. This module is the only code that reads or writes it.
//
// DUAL-WRITE, DELIBERATELY. Every write here is made ALONGSIDE the old
// profiles columns, not instead of them: ~15 other modules still read
// push_subscription / push_died_at / push_subscribed_at (push-state,
// notification-health, mission-queue, student-360, the admin dashboards…).
// Migrating them is Step 3, one at a time. Until then the old columns must
// stay true, or every one of those surfaces starts lying at once.
//
// THE READ FALLS BACK, ALSO DELIBERATELY. `liveEndpointsFor` returns the
// profile column as a synthetic endpoint when a student has no rows yet.
// Without that, the window between this deploy and a student's next
// re-subscribe would be a window with NO push at all for them — a strictly
// worse outcome than the bug being fixed. The fallback makes this change a
// superset of today's behaviour: everyone reachable before is reachable
// after, and multi-device students become reachable on more than one.

/** One device we can push to. `subscription` for web_push, `token` for apns. */
export interface LiveEndpoint {
  /** Null for the synthetic fallback row — it has no registry row yet. */
  id: string | null;
  provider: 'web_push' | 'apns';
  subscription: PushSubscriptionJSON | null;
  token: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Every endpoint this student can be pushed on right now, newest first.
 *
 * Falls back to profiles.push_subscription when the registry holds nothing —
 * see the header. The fallback row carries id:null, which is what tells
 * callers there is no row to revoke or to record a delivery against.
 */
export async function liveEndpointsFor(admin: any, studentId: string): Promise<LiveEndpoint[]> {
  const { data } = await admin
    .from('notification_endpoints')
    .select('id, provider, subscription, device_token')
    .eq('student_id', studentId)
    .is('revoked_at', null)
    .order('last_seen_at', { ascending: false });

  const rows = (data ?? []) as Array<{
    id: string; provider: 'web_push' | 'apns'; subscription: unknown; device_token: string | null;
  }>;
  if (rows.length > 0) {
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      subscription: (r.subscription ?? null) as PushSubscriptionJSON | null,
      token: r.device_token,
    }));
  }

  const { data: profile } = await admin
    .from('profiles').select('push_subscription').eq('id', studentId).single();
  if (!profile?.push_subscription) return [];
  return [{
    id: null,
    provider: 'web_push',
    subscription: profile.push_subscription as PushSubscriptionJSON,
    token: null,
  }];
}

/**
 * Register (or refresh) one web-push endpoint. Idempotent per
 * (student, endpoint URL) — the partial unique index in migration 20260901a
 * is what makes re-subscribing the same browser an update rather than a
 * second row.
 *
 * Never throws: a registry write must not be able to fail a subscribe that
 * has already succeeded against the profile column. Losing the row costs a
 * second device on this student until their next subscribe; throwing here
 * would cost them push entirely.
 */
export async function registerWebPushEndpoint(
  admin: any,
  studentId: string,
  subscription: PushSubscriptionJSON,
  opts?: { context?: string | null; platform?: string | null },
): Promise<void> {
  const now = new Date().toISOString();
  const platform = normalisePlatform(opts?.platform);
  const app_context = normaliseContext(opts?.context);
  try {
    // The unique index is partial (revoked_at is null), so onConflict cannot
    // name it. Look first, then update or insert — two round trips, on a path
    // that runs once per subscribe, not once per send.
    const { data: existing } = await admin
      .from('notification_endpoints')
      .select('id')
      .eq('student_id', studentId)
      .eq('provider', 'web_push')
      .is('revoked_at', null)
      .filter('subscription->>endpoint', 'eq', subscription.endpoint)
      .maybeSingle();

    if (existing?.id) {
      await admin.from('notification_endpoints').update({
        subscription, last_seen_at: now, updated_at: now,
        ...(platform ? { platform } : {}),
        ...(app_context ? { app_context } : {}),
      }).eq('id', existing.id);
      return;
    }

    await admin.from('notification_endpoints').insert({
      student_id: studentId,
      provider: 'web_push',
      platform: platform ?? 'unknown',
      app_context: app_context ?? 'unknown',
      subscription,
      registered_at: now,
      last_seen_at: now,
    });
  } catch (err) {
    console.error('[endpoints] register failed (subscribe itself still succeeded):', err);
  }
}

/**
 * Mark ONE endpoint dead. The whole point of the registry: a 410 on a
 * student's old phone must not take their current phone down with it, which
 * is exactly what `update profiles set push_subscription = null` did.
 */
export async function revokeEndpoint(admin: any, endpointId: string, reason: string): Promise<void> {
  try {
    await admin.from('notification_endpoints')
      .update({ revoked_at: new Date().toISOString(), revoked_reason: reason.slice(0, 120), updated_at: new Date().toISOString() })
      .eq('id', endpointId);
  } catch (err) {
    console.error('[endpoints] revoke failed:', err);
  }
}

/** Every endpoint for a student, revoked at once — the explicit "turn push off". */
export async function revokeAllEndpoints(admin: any, studentId: string, reason: string): Promise<void> {
  try {
    await admin.from('notification_endpoints')
      .update({ revoked_at: new Date().toISOString(), revoked_reason: reason.slice(0, 120), updated_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .is('revoked_at', null);
  } catch (err) {
    console.error('[endpoints] revoke-all failed:', err);
  }
}

/**
 * One delivery attempt against one endpoint. This is the row that makes
 * "sent to the student" and "delivered to this phone" different facts —
 * `notifications` keeps the former, this keeps the latter, per endpoint.
 *
 * Skipped for the synthetic fallback endpoint (id null): the FK needs a real
 * row, and a student on the fallback has no registry row yet by definition.
 */
export async function recordDelivery(
  admin: any,
  notificationId: string,
  endpointId: string | null,
  outcome: { accepted: boolean; reason?: string },
): Promise<void> {
  if (!endpointId) return;
  const now = new Date().toISOString();
  try {
    await admin.from('notification_deliveries').insert({
      notification_id: notificationId,
      endpoint_id: endpointId,
      attempted_at: now,
      ...(outcome.accepted
        ? { provider_accepted_at: now }
        : { failed_at: now, fail_reason: (outcome.reason ?? 'unknown').slice(0, 120) }),
    });
  } catch (err) {
    console.error('[endpoints] delivery record failed:', err);
  }
}

const PLATFORMS = new Set(['android', 'ios', 'desktop', 'unknown']);
const CONTEXTS = new Set(['standalone', 'twa', 'ios_app', 'browser', 'unknown']);

/** The schema's CHECK constraints are the authority; anything else is 'unknown'. */
function normalisePlatform(raw: unknown): string | null {
  return typeof raw === 'string' && PLATFORMS.has(raw) ? raw : null;
}

/** display mode, from journey.ts. 'twa' also implies Android, but the platform
 *  column is set from its own signal — inferring one from the other is how
 *  the backfill would have mislabelled desktop. */
function normaliseContext(raw: unknown): string | null {
  return typeof raw === 'string' && CONTEXTS.has(raw) ? raw : null;
}
