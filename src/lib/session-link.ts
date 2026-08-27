import { JOIN_OPENS_MINS_BEFORE, SESSION_GRACE_MS } from './session-window';

// ── The join link: one room, always reachable ───────────────────────────────
//
// A mentor session is thirty minutes of a paid person's time. Everything about
// the link should converge on "tap here at 10pm" — and on 9 Aug none of it did.
//
// Shreya Bendigeri had exactly two sessions booked, both with Vedashri (our
// only paying student), both with a working Meet link on them. Both are marked
// `expired`. Nobody joined either one. The reasons were all in the plumbing:
//
//   1. The booking notification carried `meetLink` in its data but no `url`, so
//      tapping it opened nothing in particular, and the body said "join from
//      your dashboard" rather than giving them the link.
//   2. The student could not SEE the link until 15 minutes before the session.
//      Booked at 22:00, opening the app at 18:00 showed "in 4h" and no way to
//      save the link, add it to a calendar, or test it in advance.
//   3. The day-before reminder said "be ready" and linked to the tracker — not
//      to the session and not to the room.
//   4. The buddy got no reminder at all. Only the student was notified.
//
// The rule this module encodes: the link is ALWAYS visible once a session
// exists, and the Join button opens well before the hour rather than at the
// last moment. A link you can only reach in the final fifteen minutes is a link
// you cannot plan around.

// The two timings live in lib/session-window, which already existed and is
// already the shared rule for "is this session still live". Defining a second
// pair here — which the first version of this file did — is precisely the
// failure session-window was written to end: on 4 Aug the student's app and
// the mentor's app disagreed about whether a call was happening, and she
// joined an empty room while he had no button to press.
export const JOIN_OPENS_MINUTES_BEFORE = JOIN_OPENS_MINS_BEFORE;
export const JOIN_STAYS_OPEN_MINUTES_AFTER = SESSION_GRACE_MS / 60_000;

export type JoinState =
  /** Booked, link visible and copyable, but the button is not live yet. */
  | 'scheduled'
  /** Inside the window — the Join button is live. */
  | 'joinable'
  /** Start time has passed and we are still inside the grace window. */
  | 'live'
  /** Past the grace window. */
  | 'ended'
  /** A session with no link at all — the mentor never set a room. */
  | 'no_link';

export interface JoinInput {
  scheduledAtIso: string;
  nowMs: number;
  hasLink: boolean;
}

export function joinState(input: JoinInput): JoinState {
  if (!input.hasLink) return 'no_link';
  const start = Date.parse(input.scheduledAtIso);
  if (!Number.isFinite(start)) return 'no_link';

  const minsAway = (start - input.nowMs) / 60_000;
  if (minsAway > JOIN_OPENS_MINUTES_BEFORE) return 'scheduled';
  if (minsAway >= 0) return 'joinable';
  if (-minsAway <= JOIN_STAYS_OPEN_MINUTES_AFTER) return 'live';
  return 'ended';
}

/** Can this state be tapped straight into the call? */
export function canJoinNow(state: JoinState): boolean {
  return state === 'joinable' || state === 'live';
}

/**
 * The link is shown even before the button goes live.
 *
 * This is the actual fix for the two dead sessions: a student who can see and
 * copy the room the moment it is booked can put it in their own calendar. One
 * who is told "join from your dashboard" has to remember to come back, at
 * 22:00, on a Thursday.
 */
export function shouldShowLink(state: JoinState): boolean {
  return state !== 'no_link';
}

export interface CountdownInput {
  scheduledAtIso: string;
  nowMs: number;
}

/** Human countdown for the strip: "in 4h", "in 25m", "starts now", "live". */
export function countdownLabel(input: CountdownInput): string {
  const start = Date.parse(input.scheduledAtIso);
  if (!Number.isFinite(start)) return '';
  const mins = Math.round((start - input.nowMs) / 60_000);
  if (mins <= -1) return 'live now';
  if (mins <= 0) return 'starts now';
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

/**
 * The notification body for a freshly booked session.
 *
 * The link goes IN the message. "Join from your dashboard" asks a student to
 * remember a place and a time; a link asks them to tap.
 */
export function bookedNotificationBody(opts: {
  istTime: string;
  isOrientation: boolean;
  meetLink: string | null;
  /**
   * WHO did the booking. The original copy said "your buddy booked a 1:1"
   * because, when it was written, a buddy was the only one who could — the
   * student self-serve path (/api/sessions/schedule) dispatched nothing at
   * all, so no message ever had to describe it. Now that it does, telling a
   * student their buddy booked the slot the student just picked is a small
   * lie of the kind that teaches people to distrust the rest of the message.
   *
   * Defaulted, so the existing caller keeps its exact wording.
   */
  bookedBy?: 'buddy' | 'student';
}): string {
  const what = opts.isOrientation
    ? 'your free orientation is booked'
    : opts.bookedBy === 'student'
      ? 'your 1:1 is booked'
      : 'your buddy booked a 1:1';
  return opts.meetLink
    ? `${opts.istTime} IST — ${what}. Join here: ${opts.meetLink}`
    : `${opts.istTime} IST — ${what}.`;
}

/**
 * The BUDDY's side of a booking the student made.
 *
 * Until 27 Aug no dispatch anywhere in the codebase addressed a buddy —
 * `recipient_type: 'buddy'` had zero call sites — so a student could take a
 * slot and the mentor was never told. 11 of the first 18 sessions expired,
 * which is the state meaning the hour passed and nobody closed it out.
 *
 * First name only, matching every other buddy-facing string, and the room
 * link travels IN the message for the same reason it does for the student.
 */
export function buddyBookedNotificationBody(opts: {
  istTime: string;
  studentName: string;
  meetLink: string | null;
}): string {
  const who = opts.studentName.split(' ')[0] || 'A student';
  return opts.meetLink
    ? `${who} booked you for ${opts.istTime} IST. Join here: ${opts.meetLink}`
    : `${who} booked you for ${opts.istTime} IST.`;
}

/** Day-before reminder, carrying the room rather than pointing at a dashboard. */
export function reminderNotificationBody(opts: {
  istTime: string;
  title: string | null;
  meetLink: string | null;
}): string {
  const base = opts.title ?? 'CareerRai buddy session';
  return opts.meetLink ? `${base} at ${opts.istTime}. Join here: ${opts.meetLink}` : `${base} at ${opts.istTime}.`;
}

/**
 * Where a session notification should land when tapped.
 *
 * The booking notification shipped with no `url` at all, so a tap opened
 * whatever the app happened to show. Students and buddies land on different
 * pages because they do different things when they get there.
 */
export function sessionNotificationUrl(role: 'student' | 'buddy'): string {
  return role === 'buddy' ? '/buddy/home' : '/student/buddy';
}
