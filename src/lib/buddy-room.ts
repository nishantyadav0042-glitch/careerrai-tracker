import { createAdminClient } from '@/lib/supabase/admin';
import { createGoogleMeet, deleteGoogleMeet, messageFor, type Failure } from '@/lib/google-meet';
import { googleConnection } from '@/lib/google-oauth';
import { audit } from '@/lib/integration-audit';

// ONE permanent Google Meet room per buddy.
//
// Founder decision, 5 Aug — a deliberate reversal of "a fresh Meet per
// booking". The room is minted once, the first time a buddy connects Google,
// and every session they ever run uses that same URL.
//
// Why this is the better architecture here:
//  · A mentor learns ONE link. They are IIM alumni with day jobs; a different
//    URL every session is a thing to look up while a student waits.
//  · A link a student already saved never goes stale, so a reschedule cannot
//    strand anyone in an old room. That was the whole shape of Incident #21.
//  · Booking stops depending on a live Google call. If Google is slow or a
//    token has drifted, the booking still succeeds with a link we know works.
//
// The risk this trades for is real and is handled elsewhere: because the room
// is shared across a buddy's students, two students must never be scheduled
// into it at once. The `no_overlapping_buddy_sessions` exclusion constraint
// (with a 15-minute tail buffer for sessions that run long) is what makes the
// shared room safe, and it is enforced in the database, not here.
//
// Google's second guard: nobody on the invite list but the buddy. Every
// student arrives as an uninvited joiner and lands in Meet's knock-lobby, so
// the buddy admits people one at a time. A student who kept the link from
// months ago still cannot walk into someone else's session.

/** Meeting codes expire 365 days after their LAST use — an actively used room never does. */
const ROOM_ANCHOR_DAYS = 365;

export type BuddyRoom =
  | { ok: true; meetUrl: string; eventId: string | null; created: boolean }
  | Failure;

async function mintRoom(
  buddyUserId: string,
  fullName: string | null,
  ownerEmail: string | null,
  reason: 'room.created' | 'room.regenerated',
  actorId?: string | null,
): Promise<BuddyRoom> {
  const admin = createAdminClient();

  // Anchor event far out and marked free, so it never sits on top of the
  // mentor's real day. Its only job is to hold the conference.
  const anchor = new Date(Date.now() + ROOM_ANCHOR_DAYS * 86_400_000);
  const firstName = (fullName ?? '').split(' ')[0] || 'your';

  const room = await createGoogleMeet({
    buddyUserId,
    title: `CareerRai room — ${firstName}`,
    description:
      'Your permanent CareerRai room. Every 1:1 with your students happens on this same link — ' +
      'you never need a new one. Students knock to enter, so you decide who comes in.',
    start: anchor,
    durationMinutes: 60,
    busy: false,
  });

  if (!room.ok) {
    await audit({ subjectId: buddyUserId, actorId, action: reason, ok: false, detail: { failure: room.reason } });
    return room;
  }

  const { error } = await admin
    .from('profiles')
    .update({
      buddy_meet_url: room.meetLink,
      buddy_meet_event_id: room.eventId,
      buddy_meet_email: ownerEmail,
      buddy_meet_calendar_id: room.calendarId,
    })
    .eq('id', buddyUserId);

  if (error) {
    // The room exists in Google but we could not remember it. Saying "ok" here
    // would mint a second room on the next booking, forever.
    await audit({ subjectId: buddyUserId, actorId, action: reason, ok: false, detail: { save: error.message } });
    return { ok: false, reason: 'api_error', error: `Created the room but could not save it: ${error.message}` };
  }

  await audit({
    subjectId: buddyUserId, actorId, action: reason,
    detail: { eventId: room.eventId, ownerEmail },
  });
  return { ok: true, meetUrl: room.meetLink, eventId: room.eventId, created: true };
}

/**
 * The buddy's permanent room, creating it on first use.
 *
 * Idempotent: once `buddy_meet_url` is on the profile this makes no API call —
 * UNLESS the connected Google account has changed. A mentor who reconnects
 * with a different address no longer owns the old room: it sits on a calendar
 * we can't read, write or cancel, so the link would keep "working" while being
 * invisible to us. A changed owner means a new room, always.
 */
export async function ensureBuddyRoom(buddyUserId: string): Promise<BuddyRoom> {
  const admin = createAdminClient();

  const [{ data: profile }, connection] = await Promise.all([
    admin
      .from('profiles')
      .select('full_name, buddy_meet_url, buddy_meet_event_id, buddy_meet_email')
      .eq('id', buddyUserId)
      .single(),
    googleConnection(buddyUserId),
  ]);

  if (!connection.connected) {
    return { ok: false, reason: 'not_connected', error: messageFor('not_connected') };
  }

  if (profile?.buddy_meet_url) {
    const owner = profile.buddy_meet_email;
    const sameAccount = !owner || !connection.email || owner === connection.email;
    if (sameAccount) {
      return { ok: true, meetUrl: profile.buddy_meet_url, eventId: profile.buddy_meet_event_id ?? null, created: false };
    }
    // Different Google account. The old event is unreachable from the new
    // credentials, so there is nothing to delete — just stop pointing at it.
    await audit({
      subjectId: buddyUserId, action: 'google.account_changed',
      detail: { from: owner, to: connection.email, orphanedEventId: profile.buddy_meet_event_id },
    });
  }

  return mintRoom(buddyUserId, profile?.full_name ?? null, connection.email, 'room.created');
}

/**
 * Throw the current room away and mint a fresh one.
 *
 * For support: a mentor deletes the underlying calendar event by accident, or
 * wants a clean room because an old link is circulating. Best-effort on the
 * delete — if the old event is already gone, that is the desired end state,
 * not a failure.
 */
export async function regenerateBuddyRoom(buddyUserId: string, actorId?: string | null): Promise<BuddyRoom> {
  const admin = createAdminClient();
  const [{ data: profile }, connection] = await Promise.all([
    admin.from('profiles').select('full_name, buddy_meet_event_id').eq('id', buddyUserId).single(),
    googleConnection(buddyUserId),
  ]);

  if (!connection.connected) {
    return { ok: false, reason: 'not_connected', error: messageFor('not_connected') };
  }

  if (profile?.buddy_meet_event_id) {
    const removed = await deleteGoogleMeet(buddyUserId, profile.buddy_meet_event_id);
    if (!removed.ok) console.error('[room] old event not deleted:', removed.reason, removed.error);
  }

  return mintRoom(buddyUserId, profile?.full_name ?? null, connection.email, 'room.regenerated', actorId);
}

// ── Can this buddy take a booking at all? ───────────────────────────────────

export interface BookingReadiness {
  ready: boolean;
  googleConnected: boolean;
  hasRoom: boolean;
  googleEmail: string | null;
  /** One sentence for the UI when `ready` is false. */
  blocker: string | null;
}

/**
 * Everything the booking UI needs to decide whether to offer the button —
 * and the same check the API runs before it accepts one.
 *
 * Deliberately exposes NO token, no calendar id and no event id. A client
 * needs to know *whether* booking is possible, never the credentials that
 * make it possible.
 */
export async function buddyBookingReadiness(buddyUserId: string): Promise<BookingReadiness> {
  const admin = createAdminClient();
  const [{ data: profile }, connection] = await Promise.all([
    admin.from('profiles').select('buddy_meet_url').eq('id', buddyUserId).single(),
    googleConnection(buddyUserId),
  ]);

  const hasRoom = !!profile?.buddy_meet_url;
  const ready = connection.connected && hasRoom;
  return {
    ready,
    googleConnected: connection.connected,
    hasRoom,
    googleEmail: connection.email,
    blocker: connection.connected
      ? (hasRoom ? null : 'Your meeting room has not been created yet. Reconnect Google to set it up.')
      : 'Connect your Google Calendar before booking a session.',
  };
}
