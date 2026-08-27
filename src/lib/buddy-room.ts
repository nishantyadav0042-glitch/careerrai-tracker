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

/**
 * Mint the room and claim it, or lose the claim gracefully.
 *
 * `expectedCurrentUrl` makes the save a compare-and-swap:
 *   null      — claim only if the buddy still has NO room
 *   a string  — claim only if the room is still the one we read
 *   undefined — force (regeneration; the caller means to replace whatever is there)
 *
 * Without this it is a plain read-then-write, and two concurrent first
 * bookings by the same mentor each see "no room", each create a Google event,
 * and the second UPDATE overwrites the first. The mentor ends up with TWO
 * conference events on their calendar, one of which the app can never see
 * again — it cannot be deleted on disconnect, regenerated, or found at all.
 * That silently breaks the one invariant this whole design rests on: exactly
 * one room per buddy.
 */
async function mintRoom(
  buddyUserId: string,
  fullName: string | null,
  ownerEmail: string | null,
  reason: 'room.created' | 'room.regenerated',
  expectedCurrentUrl: string | null | undefined,
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

  let claim = admin
    .from('profiles')
    .update({
      buddy_meet_url: room.meetLink,
      buddy_meet_event_id: room.eventId,
      buddy_meet_email: ownerEmail,
      buddy_meet_calendar_id: room.calendarId,
    })
    .eq('id', buddyUserId);

  if (expectedCurrentUrl === null) claim = claim.is('buddy_meet_url', null);
  else if (typeof expectedCurrentUrl === 'string') claim = claim.eq('buddy_meet_url', expectedCurrentUrl);

  const { data: claimed, error } = await claim.select('id');

  if (error) {
    // The room exists in Google but we could not remember it. Saying "ok" here
    // would mint a second room on the next booking, forever.
    await audit({ subjectId: buddyUserId, actorId, action: reason, ok: false, detail: { save: error.message } });
    return { ok: false, reason: 'api_error', error: `Created the room but could not save it: ${error.message}` };
  }

  if (!claimed?.length) {
    // We lost the race: a concurrent call already claimed a room for this
    // buddy. Ours is an orphan — delete it, or it sits on their calendar
    // forever as a second conference nothing can reach.
    const removed = await deleteGoogleMeet(buddyUserId, room.eventId);
    if (!removed.ok) console.error('[room] orphan event not cleaned up:', room.eventId, removed.error);

    const { data: winner } = await admin
      .from('profiles')
      .select('buddy_meet_url, buddy_meet_event_id')
      .eq('id', buddyUserId)
      .single();

    await audit({
      subjectId: buddyUserId, actorId, action: reason, ok: false,
      detail: { lostRace: true, discardedEventId: room.eventId, orphanDeleted: removed.ok },
    });

    if (!winner?.buddy_meet_url) {
      return { ok: false, reason: 'api_error', error: 'Could not set up your meeting room — please try again.' };
    }
    return { ok: true, meetUrl: winner.buddy_meet_url, eventId: winner.buddy_meet_event_id ?? null, created: false };
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

  // A room that is already set is a room. It does not matter whether Google
  // minted it or the mentor pasted it — and this check comes FIRST, before any
  // connection requirement.
  //
  // Requiring Google here was a design mistake. Google's verification wall
  // ("this app is being tested, only approved testers can access it") is an
  // external dependency that can block every mentor for days, and we made
  // BOOKING depend on it. The product need was never the Calendar API; it was
  // a stable link. A pasted link satisfies that need completely — the Calendar
  // API only ever saved the mentor from creating one themselves.
  if (profile?.buddy_meet_url && !profile.buddy_meet_event_id) {
    // Manually set room: nothing to verify against Google, nothing to expire.
    return { ok: true, meetUrl: profile.buddy_meet_url, eventId: null, created: false };
  }

  if (!connection.connected) {
    return {
      ok: false, reason: 'not_connected',
      error: 'Set your meeting room first — paste your Meet link, or connect Google to have one made for you.',
    };
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
    // Swap only if the stale room is still the one we read.
    return mintRoom(buddyUserId, profile.full_name ?? null, connection.email, 'room.created', profile.buddy_meet_url);
  }

  // First room for this mentor: claim it only if they still have none.
  return mintRoom(buddyUserId, profile?.full_name ?? null, connection.email, 'room.created', null);
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

  // Regeneration is a deliberate replacement — force the write.
  return mintRoom(buddyUserId, profile?.full_name ?? null, connection.email, 'room.regenerated', undefined, actorId);
}

/**
 * Take the permanent room OFF Google before a connection is torn down.
 *
 * Disconnecting used to clear our columns and leave the conference event
 * sitting on the mentor's calendar forever — an artifact nothing could ever
 * reach again, since we had just thrown away the only pointer to it. Worse,
 * the link stays JOINABLE: anyone holding it keeps a working room attached to
 * a mentor who believes they have disconnected.
 *
 * Ordering is the whole trick: this must run while the token still exists.
 * Best-effort — a failure here must never prevent someone from disconnecting.
 */
export async function releaseBuddyRoom(buddyUserId: string): Promise<{ deleted: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('buddy_meet_event_id')
    .eq('id', buddyUserId)
    .single();

  if (!profile?.buddy_meet_event_id) return { deleted: false };

  const removed = await deleteGoogleMeet(buddyUserId, profile.buddy_meet_event_id);
  if (!removed.ok) {
    console.error('[room] could not delete permanent room on disconnect:', removed.reason, removed.error);
    return { deleted: false, error: removed.error };
  }
  return { deleted: true };
}

// ── Can this buddy take a booking at all? ───────────────────────────────────

import {
  decideBookability, bookabilityFacts, type UnbookableReason,
} from './session-assignment';

export interface BookingReadiness {
  /** The canonical verdict. Identical to what the booking API will decide. */
  ready: boolean;
  /** Why not, when not — the same three reasons the API uses. */
  reason: UnbookableReason | null;
  googleConnected: boolean;
  hasRoom: boolean;
  hasAvailability: boolean;
  /** The room itself — safe to show a mentor; it is the link they hand out. */
  roomUrl: string | null;
  googleEmail: string | null;
  /** One sentence for the UI when `ready` is false. */
  blocker: string | null;
}

/**
 * The mentor-facing view of bookability.
 *
 * A THIN ADAPTER over decideBookability(), never a second implementation.
 * This function used to compute its own answer — `ready: hasRoom` — while its
 * comment claimed it ran "the same readiness the booking API enforces". It did
 * not, and a mentor with a room and no hours was shown a clean screen while
 * every student hit a dead end.
 *
 * It adds only PRESENTATION: the room URL to display, the connected Google
 * address, and a sentence. The verdict itself comes from the one rule.
 */
export async function buddyBookingReadiness(buddyUserId: string): Promise<BookingReadiness> {
  const admin = createAdminClient();
  const [facts, { data: profile }, connection] = await Promise.all([
    bookabilityFacts(admin, buddyUserId),
    admin.from('profiles').select('buddy_meet_url').eq('id', buddyUserId).single(),
    googleConnection(buddyUserId),
  ]);

  const decision = decideBookability(facts);
  return {
    ready: decision.bookable,
    reason: decision.bookable ? null : decision.reason,
    googleConnected: connection.connected,
    hasRoom: facts.hasRoom,
    hasAvailability: facts.availability?.active === true,
    roomUrl: profile?.buddy_meet_url ?? null,
    googleEmail: connection.email,
    blocker: decision.bookable ? null : MENTOR_BLOCKER_COPY[decision.reason],
  };
}

/**
 * What the MENTOR reads. Distinct from UNBOOKABLE_COPY, which is what the
 * STUDENT reads about their buddy — same three reasons, two audiences.
 */
export const MENTOR_BLOCKER_COPY: Record<UnbookableReason, string> = {
  no_availability: 'Set your weekly hours so students can book a time with you.',
  not_taking_bookings: 'Your hours are switched off — turn them back on to take bookings.',
  no_meeting_room: 'Set your meeting room before students can book a session.',
};
