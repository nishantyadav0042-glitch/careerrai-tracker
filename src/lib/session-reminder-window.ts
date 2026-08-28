/**
 * ── THE 30-MINUTE REMINDER, DECIDED IN ONE PLACE ────────────────────────────
 *
 * The highest-intent message in the product: the student is about to be in a
 * room with a mentor they paid for, and the join link is in their hand.
 * 11 of the first 18 sessions expired — nobody joined — so the message that
 * arrives while there is still time to act is the one that matters.
 *
 * All of the judgement lives here as pure functions so it can be tested
 * exhaustively without a database, a clock or a cron.
 */

/**
 * How far ahead we look. NOT a 10-minute band around T-30.
 *
 * A band would depend on the cron firing inside it: Vercel adds jitter, a run
 * can be skipped, and a session booked 20 minutes before it starts would fall
 * through a T-35..T-25 window entirely and be reminded never. A LEAD WINDOW
 * plus dedup cannot gap — every run sweeps everything still ahead of it, and
 * the first run to see a session is the only one that sends.
 */
export const REMINDER_LEAD_MS = 35 * 60 * 1000;

/**
 * Too close to be worth a push. Under this, the notification would land as the
 * mentor is already saying hello — the student is better served by the room
 * than by their lock screen.
 */
export const REMINDER_FLOOR_MS = 2 * 60 * 1000;

export interface RemindableSession {
  id: string;
  scheduled_at: string;
  session_status: string;
}

/** A notification already sent for some session, and the start time it named. */
export interface PriorReminder {
  sessionId: string;
  /** The scheduled_at this reminder was ABOUT, as an ISO string. */
  remindedFor: string | null;
}

/**
 * Sessions that should be reminded on this run.
 *
 * Three rules, and the third is the one a simpler implementation gets wrong:
 *
 *   1. Only 'scheduled'. A cancelled or completed session is not upcoming, and
 *      an expired one is already lost.
 *   2. Inside the lead window and not already under way.
 *   3. NOT already reminded FOR THIS START TIME. Deduping on session id alone
 *      is wrong the moment a session moves: a booking reminded for 14:00 and
 *      then rescheduled to 16:00 would be treated as done, and the student
 *      would get no reminder for the time they are actually expected. Matching
 *      on the start time the reminder NAMED makes a reschedule a new event,
 *      while a repeat run for an unchanged time stays suppressed.
 */
export function sessionsDueForReminder(
  sessions: readonly RemindableSession[],
  priorReminders: readonly PriorReminder[],
  nowMs: number,
): RemindableSession[] {
  const remindedFor = new Map<string, Set<string>>();
  for (const p of priorReminders) {
    if (!p.remindedFor) continue;
    const t = Date.parse(p.remindedFor);
    if (Number.isNaN(t)) continue;
    const set = remindedFor.get(p.sessionId) ?? new Set<string>();
    // Compare by instant, not by string — '2026-08-29T11:00:00Z' and
    // '2026-08-29T11:00:00.000+00:00' are the same moment.
    set.add(String(t));
    remindedFor.set(p.sessionId, set);
  }

  return sessions.filter((s) => {
    if (s.session_status !== 'scheduled') return false;

    const start = Date.parse(s.scheduled_at);
    if (Number.isNaN(start)) return false;

    const lead = start - nowMs;
    if (lead > REMINDER_LEAD_MS) return false;   // not yet
    if (lead < REMINDER_FLOOR_MS) return false;  // too late to be useful

    return !remindedFor.get(s.id)?.has(String(start));
  });
}

/** Whole minutes until the session starts, for copy that has to be honest. */
export function minutesUntil(scheduledAt: string, nowMs: number): number | null {
  const start = Date.parse(scheduledAt);
  if (Number.isNaN(start)) return null;
  return Math.round((start - nowMs) / 60_000);
}

/**
 * What the student reads on their lock screen.
 *
 * States the real number of minutes rather than a hardcoded "30" — the lead
 * window is 35 minutes wide and a run can be late, so "in 30 minutes" would
 * often simply be false. The link travels IN the message: asking someone to
 * open an app and find a room is how a session starts five minutes late.
 */
export function reminderBody(opts: {
  minutes: number;
  buddyFirstName: string;
  meetLink: string | null;
}): string {
  const when = opts.minutes <= 1 ? 'starts now' : `starts in ${opts.minutes} minutes`;
  const who = opts.buddyFirstName || 'your buddy';
  return opts.meetLink
    ? `Your session with ${who} ${when}. Join here: ${opts.meetLink}`
    : `Your session with ${who} ${when}.`;
}
