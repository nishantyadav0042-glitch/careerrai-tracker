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
  | 'no_meeting_room';     // no room at all — neither a pasted link nor Google

export type Bookability =
  | { bookable: true; timezone: string }
  | { bookable: false; reason: UnbookableReason };

/**
 * ── THE ONE BUSINESS RULE ───────────────────────────────────────────────────
 *
 * Everything a mentor needs to be bookable, as facts. Every surface in the
 * product — the booking API, the mentor's own screens, every admin view —
 * answers the question by calling decideBookability() with these, and none of
 * them re-derives it.
 *
 * That is not tidiness. On 27 Aug an audit found SEVEN independent
 * definitions of "can this mentor be booked", giving FOUR different answers
 * for one real mentor (Shreya: a room, no hours, no Google):
 *
 *   · the booking API said no — correctly, no availability
 *   · her own home screen said nothing was wrong
 *   · the admin roster counted her as READY and offered her free slots
 *   · video-health and integration-metrics said she could not book, blaming
 *     Google — a requirement this codebase had already removed as "a design
 *     mistake", leaving those two chasing a problem that no longer existed
 *
 * A student had paid ₹299 two days earlier and could not pick a time.
 */
export interface BookabilityFacts {
  /** The availability row, or null when the mentor has never described a week. */
  availability: { active: boolean | null; timezone?: string | null } | null;
  /** A room URL already recorded — pasted by the mentor or minted earlier. */
  hasRoom: boolean;
  /** A live Google Calendar connection, from which a room CAN be minted. */
  googleConnected: boolean;
}

/**
 * The rule, and the only place it exists.
 *
 * Pure: same facts, same answer, no I/O and no clock — so every state can be
 * enumerated in a test rather than argued about.
 *
 * GOOGLE IS NOT INDEPENDENTLY MANDATORY. A room is a room whether Google
 * minted it or the mentor pasted their own link; requiring a Google
 * connection made booking hostage to Google's app-verification queue, which
 * is a dependency the product never needed. Either satisfies the room half.
 */
export function decideBookability(facts: BookabilityFacts): Bookability {
  if (!facts.availability) return { bookable: false, reason: 'no_availability' };
  if (facts.availability.active !== true) {
    return { bookable: false, reason: 'not_taking_bookings' };
  }
  if (!facts.hasRoom && !facts.googleConnected) {
    return { bookable: false, reason: 'no_meeting_room' };
  }
  return { bookable: true, timezone: facts.availability.timezone ?? 'Asia/Kolkata' };
}

/** Read the facts for one mentor. The only query behind the rule. */
export async function bookabilityFacts(admin: any, buddyId: string): Promise<BookabilityFacts> {
  const [{ data: avail }, { data: prof }] = await Promise.all([
    admin.from('buddy_availability')
      .select('timezone, active').eq('buddy_id', buddyId).maybeSingle(),
    admin.from('profiles')
      .select('buddy_meet_url, google_calendar_connected').eq('id', buddyId).maybeSingle(),
  ]);
  return {
    availability: avail ? { active: avail.active as boolean | null, timezone: avail.timezone as string | null } : null,
    hasRoom: prof?.buddy_meet_url != null,
    googleConnected: prof?.google_calendar_connected === true,
  };
}

/**
 * Whether a student may be shown slots for this mentor.
 *
 * The canonical entry point: facts in, one rule applied. A mentor who is not
 * bookable is not an error and not a fault; the student is routed to the team
 * instead, and the credit keeps waiting.
 */
export async function mentorBookability(admin: any, buddyId: string): Promise<Bookability> {
  return decideBookability(await bookabilityFacts(admin, buddyId));
}

/** What the student is told. Never blames them, never invents a timeline. */
export const UNBOOKABLE_COPY: Record<UnbookableReason, string> = {
  no_availability: 'Your buddy has not opened their calendar yet. Our team will set your session time for you.',
  not_taking_bookings: 'Your buddy is not taking bookings this week. Our team will arrange your session.',
  no_meeting_room: 'We are getting your buddy’s meeting room ready. Our team will confirm your session time.',
};
