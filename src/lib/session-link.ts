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

/** How long before the start time the Join button goes live. */
export const JOIN_OPENS_MINUTES_BEFORE = 30;

/**
 * How long after the start time a session is still joinable.
 *
 * Generous on purpose. People run late, and a mentor sitting in an empty room
 * is worse than a student joining twenty minutes in.
 */
export const JOIN_STAYS_OPEN_MINUTES_AFTER = 90;

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
}): string {
  const what = opts.isOrientation ? 'your free orientation is booked' : 'your buddy booked a 1:1';
  return opts.meetLink
    ? `${opts.istTime} IST — ${what}. Join here: ${opts.meetLink}`
    : `${opts.istTime} IST — ${what}.`;
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
