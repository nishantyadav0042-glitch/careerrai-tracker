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
    // UPSERT, not insert, on (notification_id, endpoint_id) — the unique index
    // from 20260903a. A legitimate re-send of the same notification to the same
    // device must update its one delivery fact, not raise a unique violation
    // and not create a second row.
    //
    // device_confirmed_at is deliberately ABSENT from this payload. It belongs
    // to the device, not to the sender, and a re-send must never erase a
    // confirmation the device has already given us. Postgres's ON CONFLICT DO
    // UPDATE only touches the columns named here, so leaving it out preserves it.
    //
    // The opposite outcome column IS nulled: a row carrying both a failed_at
    // from attempt one and a provider_accepted_at from attempt two describes
    // no coherent event.
    await admin.from('notification_deliveries').upsert({
      notification_id: notificationId,
      endpoint_id: endpointId,
      attempted_at: now,
      ...(outcome.accepted
        ? { provider_accepted_at: now, failed_at: null, fail_reason: null }
        : { failed_at: now, fail_reason: (outcome.reason ?? 'unknown').slice(0, 120), provider_accepted_at: null }),
    }, { onConflict: 'notification_id,endpoint_id' });
  } catch (err) {
    console.error('[endpoints] delivery record failed:', err);
  }
}

/** What confirmDelivery() actually did — the route turns this into a status. */
export type ConfirmOutcome =
  | 'confirmed'   // first valid receipt for this (notification, device)
  | 'already'     // a receipt was already recorded — replay, harmless
  | 'rejected';   // the pair is not ours to confirm: unknown, or cross-student

/**
 * Stamp the device-level receipt for ONE endpoint.
 *
 * THE ATTRIBUTION RULE: a push sent to device A is confirmable only by device
 * A. Both ids arrive from an UNAUTHENTICATED beacon (the service worker may
 * hold no session — same as /api/push/click), so neither may be trusted on its
 * own. What makes the pair safe is that it is checked against facts only THIS
 * SERVER creates:
 *
 *   - the notification row names the student it was raised for
 *   - the endpoint row names the student it belongs to
 *   - they must be the same student, or the pair is refused
 *
 * So a caller cannot confirm another student's notification, cannot confirm on
 * another student's device, and cannot invent an endpoint. The worst a forged
 * pair achieves is confirming a student's own real notification on that same
 * student's own real device — which is the thing the beacon exists to report.
 *
 * IDEMPOTENT by construction: the write is conditional on device_confirmed_at
 * being null and the table carries a unique index on the pair, so a replayed
 * or concurrent beacon returns 'already' and writes nothing. Never throws —
 * a measurement failure must not fail a beacon the device already earned.
 */
export async function confirmDelivery(
  admin: any,
  notificationId: string,
  endpointId: string,
): Promise<ConfirmOutcome> {
  const now = new Date().toISOString();
  try {
    // OWNERSHIP: both sides must name the same student. Read them rather than
    // trusting the pair — this is the whole security boundary of this function.
    const [{ data: notif }, { data: ep }] = await Promise.all([
      admin.from('notifications').select('user_id').eq('id', notificationId).maybeSingle(),
      admin.from('notification_endpoints').select('student_id').eq('id', endpointId).maybeSingle(),
    ]);
    if (!notif?.user_id || !ep?.student_id) return 'rejected';        // unknown id on either side
    if (notif.user_id !== ep.student_id) return 'rejected';           // cross-student pair

    // A revoked endpoint is NOT rejected. A 410 revokes the row at send time,
    // but a push already in flight can still land and be displayed afterwards;
    // refusing that receipt would throw away true evidence of a real display.
    // The row keeps its own revoked_at, so the two facts stay separable.
    const { data: updated } = await admin
      .from('notification_deliveries')
      .update({ device_confirmed_at: now })
      .eq('notification_id', notificationId)
      .eq('endpoint_id', endpointId)
      .is('device_confirmed_at', null)
      .select('id');

    if (!updated || updated.length === 0) {
      // Either already confirmed (replay) or the delivery row does not exist
      // yet. The second is a real race: recordDelivery() writes the row only
      // AFTER webpush.sendNotification() resolves, and a fast device can beacon
      // back inside that window. Losing those receipts would silently
      // under-count exactly the devices that are healthiest. Ownership is
      // already proven above, so it is safe to create the row the sender is
      // about to write; the unique index makes the two writers converge on one.
      const { data: existing } = await admin
        .from('notification_deliveries')
        .select('id, device_confirmed_at')
        .eq('notification_id', notificationId)
        .eq('endpoint_id', endpointId)
        .maybeSingle();
      if (existing?.device_confirmed_at) return 'already';
      if (existing) return 'already'; // row exists, our conditional update lost a race

      await admin.from('notification_deliveries').upsert({
        notification_id: notificationId,
        endpoint_id: endpointId,
        attempted_at: now,
        device_confirmed_at: now,
      }, { onConflict: 'notification_id,endpoint_id' });
    }

    // The endpoint's own last-confirmed watermark: what lets a reach query ask
    // "which DEVICES are proven live" without walking every delivery row.
    await admin.from('notification_endpoints')
      .update({ last_delivery_confirmed_at: now, updated_at: now })
      .eq('id', endpointId);

    return 'confirmed';
  } catch (err) {
    console.error('[endpoints] delivery confirm failed:', err);
    return 'rejected';
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
