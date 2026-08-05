import { createAdminClient } from '@/lib/supabase/admin';
import { createGoogleMeet } from '@/lib/google-meet';

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
  | { ok: false; reason: 'not_connected' | 'no_link' | 'api_error'; error: string };

/**
 * The buddy's permanent room, creating it on first use.
 * Idempotent: once `buddy_meet_url` is on the profile this makes no API call.
 */
export async function ensureBuddyRoom(buddyUserId: string): Promise<BuddyRoom> {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, buddy_meet_url, buddy_meet_event_id')
    .eq('id', buddyUserId)
    .single();

  if (profile?.buddy_meet_url) {
    return { ok: true, meetUrl: profile.buddy_meet_url, eventId: profile.buddy_meet_event_id ?? null, created: false };
  }

  // Anchor event far out and marked free, so it never sits on top of the
  // mentor's real day. Its only job is to hold the conference.
  const anchor = new Date(Date.now() + ROOM_ANCHOR_DAYS * 86_400_000);
  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'your';

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

  if (!room.ok) return room;

  const { error } = await admin
    .from('profiles')
    .update({ buddy_meet_url: room.meetLink, buddy_meet_event_id: room.eventId })
    .eq('id', buddyUserId);

  if (error) {
    // The room exists in Google but we could not remember it. Saying "ok" here
    // would mint a second room on the next booking, forever.
    return { ok: false, reason: 'api_error', error: `Created the room but could not save it: ${error.message}` };
  }

  return { ok: true, meetUrl: room.meetLink, eventId: room.eventId, created: true };
}
