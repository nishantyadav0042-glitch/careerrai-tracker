import { NextRequest, NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

// The numbers that tell you the Meet integration is sick before a mentor does.
//
// Founder ask, 5 Aug: "add a simple dashboard for connected buddies, rooms
// created, booking failures, OAuth failures, 401s, 429s, regenerated rooms,
// constraint violations. This helps you spot issues before users report them."
//
// Everything here is derived from `integration_audit_log` plus the current
// state of `profiles`, so there is no second source of truth to drift.
//
// The three worth looking at first, and what each means:
//   · cannotBook            — mentors who would be refused RIGHT NOW. The only
//                             number that is a live outage.
//   · googleRevoked         — grants Google killed. A spike means something
//                             changed at Google's end, not at ours.
//   · roomOwnerMismatch     — a room minted under an account they no longer
//                             use. Silent until they try to cancel something.

const WINDOW_HOURS = 24;

export async function GET(request: NextRequest) {
  const ctx = await requireAdminCtx();
  if ('error' in ctx) return ctx.error;
  const { admin } = ctx;

  const hours = Number(new URL(request.url).searchParams.get('hours')) || WINDOW_HOURS;
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  const [{ data: buddies }, { data: tokens }, { data: events }] = await Promise.all([
    admin.from('profiles').select('id, buddy_meet_url, buddy_meet_email').eq('role', 'buddy'),
    admin.from('google_oauth_tokens').select('user_id, google_email'),
    admin.from('integration_audit_log').select('action, ok, detail, created_at').gte('created_at', since).limit(5000),
  ]);

  const connected = new Map((tokens ?? []).map((t) => [t.user_id, t.google_email]));
  const all = buddies ?? [];

  const withRoom = all.filter((b) => b.buddy_meet_url);
  const mismatched = all.filter((b) => {
    const tokenEmail = connected.get(b.id);
    return b.buddy_meet_url && tokenEmail && b.buddy_meet_email !== tokenEmail;
  });

  // Current state — what is true right now, regardless of the window.
  const state = {
    buddiesTotal: all.length,
    googleConnected: all.filter((b) => connected.has(b.id)).length,
    googleDisconnected: all.filter((b) => !connected.has(b.id)).length,
    roomsCreated: withRoom.length,
    roomOwnerMismatch: mismatched.length,
    // The one that is an outage: connected but no room, or no connection.
    cannotBook: all.filter((b) => !connected.has(b.id) || !b.buddy_meet_url).length,
  };

  // Activity — what happened in the window.
  const rows = events ?? [];
  const count = (fn: (r: typeof rows[number]) => boolean) => rows.filter(fn).length;
  const detailOf = (r: typeof rows[number]) => (r.detail ?? {}) as Record<string, unknown>;

  const activity = {
    windowHours: hours,
    googleConnects: count((r) => r.action === 'google.connected'),
    googleDisconnects: count((r) => r.action === 'google.disconnected'),
    googleRevoked: count((r) => r.action === 'google.revoked'),
    accountChanged: count((r) => r.action === 'google.account_changed'),
    roomsCreated: count((r) => r.action === 'room.created' && r.ok),
    roomsRegenerated: count((r) => r.action === 'room.regenerated' || r.action === 'admin.room_regenerated'),
    bookingsCreated: count((r) => r.action === 'booking.created'),
    bookingsCancelled: count((r) => r.action === 'booking.cancelled'),
    bookingsExpired: count((r) => r.action === 'booking.expired'),
    bookingsRescheduled: count((r) => r.action === 'booking.rescheduled'),
    bookingsRejected: count((r) => r.action === 'booking.rejected'),
    // Constraint violations specifically — a booking refused by the DATABASE
    // rather than by the friendly pre-check. A rising number here means the
    // pre-check is losing races, which is normal at low volume and a signal at
    // high volume.
    constraintViolations: count((r) => r.action === 'booking.rejected' && detailOf(r).viaConstraint === true),
    googleApiErrors: count((r) => r.action === 'google.api_error'),
    http401: count((r) => detailOf(r).status === 401) + count((r) => r.action === 'google.revoked'),
    http429: count((r) => detailOf(r).status === 429),
    http5xx: count((r) => Number(detailOf(r).status) >= 500),
    adminInterventions: count((r) => r.action.startsWith('admin.')),
  };

  // Plain-language read, so this is useful at a glance and not just a JSON dump.
  const alerts: string[] = [];
  if (state.cannotBook > 0) alerts.push(`${state.cannotBook} of ${state.buddiesTotal} mentors cannot book right now.`);
  if (state.roomOwnerMismatch > 0) alerts.push(`${state.roomOwnerMismatch} mentor(s) have a room owned by an account they no longer use.`);
  if (activity.googleRevoked > 0) alerts.push(`${activity.googleRevoked} Google grant(s) were revoked in the last ${hours}h — those mentors must reconnect.`);
  if (activity.http429 > 0) alerts.push(`${activity.http429} rate-limit response(s) from Google — bookings may be slow.`);
  if (activity.bookingsExpired > 0) alerts.push(`${activity.bookingsExpired} session(s) expired with no outcome recorded — the mentor never closed them out.`);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    state,
    activity,
    alerts,
    healthy: alerts.length === 0,
  });
}
