import { readMentorRoster, matchMentor } from '@/lib/session-credit';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── The missing middle ──────────────────────────────────────────────────────
//
// A ₹299 purchase minted a credit and then nothing happened: session_credits
// carried buddy_id and video_session_id that no code ever wrote, so a human
// had to create the session by hand.
//
// This closes credit → buddy. It does NOT introduce a matcher — matchMentor is
// the existing authority and is reused whole. What is added is persistence and
// the honest handling of "nobody is available", which previously did not exist
// because nothing tried.
//
// THE RELATIONSHIP RULE (founder, explicit): a ₹299 session assigns
// session_credits.buddy_id and NEVER profiles.buddy_id. A one-off session and
// an ongoing premium mentorship are different relationships, and conflating
// them would quietly hand a ₹299 buyer the continuous product.

export type AssignFailure =
  /** Roster or load read failed. NOT "sold out" — we must not refuse on a blip. */
  | 'read_failed'
  /** Genuinely nobody with capacity. The credit stays paid and waits. */
  | 'no_mentor_available'
  /** Already assigned to someone else; the caller must not silently reassign. */
  | 'already_assigned';

export type AssignResult =
  | { ok: true; buddyId: string; reason: string; already: boolean }
  | { ok: false; failure: AssignFailure; buddyId?: string };

export interface AssignInput {
  creditId: string;
  studentId: string;
  /** What the STUDENT said they wanted. Preferred for matching. */
  sessionIntent?: string | null;
  /** What the PRODUCT diagnosed. The fallback. */
  findingKind?: string | null;
  studentWeakSection?: string | null;
  studentIsRepeater?: boolean;
}

/**
 * Assign a mentor to a paid credit.
 *
 * NEVER consumes or voids the credit on failure. A student who paid and could
 * not be matched still owns exactly what they bought — the credit simply
 * waits at `paid` until a mentor frees up, and the founder view can see it
 * waiting. Losing an entitlement because the roster was briefly empty is the
 * one outcome this function exists to prevent.
 */
export async function assignBuddyToCredit(admin: any, input: AssignInput): Promise<AssignResult> {
  let roster;
  try {
    roster = await readMentorRoster(admin);
  } catch {
    // readMentorRoster throws rather than returning an empty roster, precisely
    // so a failed read cannot masquerade as "sold out" (Boundary 2, change 3).
    return { ok: false, failure: 'read_failed' };
  }

  const { data: me } = await admin.from('profiles')
    .select('self_reported_weakest_section, is_repeater')
    .eq('id', input.studentId).maybeSingle();

  const match = matchMentor(roster, {
    // The student's own words outrank the product's diagnosis — they are the
    // one who has to feel understood in the first two minutes. Both were
    // recorded at booking; only the preference is opinionated.
    findingKind: input.sessionIntent ?? input.findingKind ?? 'unreviewed',
    studentWeakSection: input.studentWeakSection
      ?? (me?.self_reported_weakest_section as string | null) ?? null,
    studentIsRepeater: input.studentIsRepeater ?? !!me?.is_repeater,
  });

  if (!match) return { ok: false, failure: 'no_mentor_available' };

  const { data, error } = await admin.rpc('assign_session_credit', {
    p_credit_id: input.creditId,
    p_buddy_id: match.buddyId,
    p_reason: match.reason,
  });
  if (error) {
    console.error('[session-assignment] assign rpc failed:', error.message);
    return { ok: false, failure: 'read_failed' };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    { assigned: boolean; buddy_id: string | null; already: boolean } | undefined;

  if (!row?.assigned) {
    // Assigned to somebody else already. Refused rather than swapped: moving a
    // student to a different mentor without anyone noticing is worse than
    // leaving the first assignment in place.
    return { ok: false, failure: 'already_assigned', buddyId: row?.buddy_id ?? undefined };
  }
  return { ok: true, buddyId: match.buddyId, reason: match.reason, already: row.already === true };
}

// ── Can this mentor actually hold a session? ────────────────────────────────

export type UnbookableReason =
  | 'no_availability'      // they have not described their week
  | 'not_taking_bookings'  // availability exists but is switched off
  | 'no_meeting_room';     // no Google connection, so no room to put anyone in

export type Bookability =
  | { bookable: true; timezone: string }
  | { bookable: false; reason: UnbookableReason };

/**
 * Whether a student may be shown slots for this mentor.
 *
 * BOTH halves are required, and the second is the one that matters today:
 * production has 8 mentors, ZERO Google connections and ZERO availability
 * rows. Offering a slot for a mentor who cannot produce a meeting room would
 * sell a booking nobody can join — which is exactly how sixteen sessions were
 * created and none delivered.
 *
 * A mentor who is not bookable is not an error and not a fault; the student is
 * routed to the team instead, and the credit keeps waiting.
 */
export async function mentorBookability(admin: any, buddyId: string): Promise<Bookability> {
  const [{ data: avail }, { data: prof }] = await Promise.all([
    admin.from('buddy_availability')
      .select('timezone, active').eq('buddy_id', buddyId).maybeSingle(),
    admin.from('profiles')
      .select('buddy_meet_url, google_calendar_connected').eq('id', buddyId).maybeSingle(),
  ]);

  if (!avail) return { bookable: false, reason: 'no_availability' };
  if (avail.active !== true) return { bookable: false, reason: 'not_taking_bookings' };

  // A usable room is either a live Google connection (we can mint one) or a
  // room URL already recorded. Neither means there is nowhere to meet.
  const hasRoom = prof?.google_calendar_connected === true || prof?.buddy_meet_url != null;
  if (!hasRoom) return { bookable: false, reason: 'no_meeting_room' };

  return { bookable: true, timezone: (avail.timezone as string) ?? 'Asia/Kolkata' };
}

/** What the student is told. Never blames them, never invents a timeline. */
export const UNBOOKABLE_COPY: Record<UnbookableReason, string> = {
  no_availability: 'Your buddy has not opened their calendar yet. Our team will set your session time for you.',
  not_taking_bookings: 'Your buddy is not taking bookings this week. Our team will arrange your session.',
  no_meeting_room: 'We are getting your buddy’s meeting room ready. Our team will confirm your session time.',
};
