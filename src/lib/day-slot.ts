// The home screen rotates four times a day.
//
// A CAT aspirant's question changes with the clock, and a fixed layout answers
// the wrong one three quarters of the time. At 7am they want to know what
// today looks like. At 8pm they're mid-session. At midnight the day is over
// and the only thing left is to log it.
//
// So the top of Home is reordered by slot, rather than every card fighting for
// the same permanent position.
export type DaySlot = 'morning' | 'midday' | 'evening' | 'night';

/** Cards that move. Everything below these keeps its fixed order. */
export type HomeBlock = 'action' | 'log' | 'insight' | 'coaching';

export function daySlot(istHour: number): DaySlot {
  if (istHour >= 5 && istHour < 12) return 'morning';
  if (istHour >= 12 && istHour < 17) return 'midday';
  if (istHour >= 17 && istHour < 22) return 'evening';
  return 'night'; // 22:00–04:59
}

// Ordering per slot. The reasoning, so this can be argued with rather than
// guessed at later:
//
//  morning — the day is ahead of them. Lead with what to do, then yesterday's
//            pattern. Logging makes no sense yet, so it drops to the bottom.
//  midday  — mid-session. What to do next still leads; coaching's daily share
//            comes up because that's the commitment with a date on it.
//  evening — peak study hours. The action leads, and the log climbs to second
//            because sessions are finishing and a log taken now is accurate.
//  night   — the day is done. Log first, then the insight to close the loop,
//            then tomorrow's action. Coaching goes last: nothing about a
//            weekly quota is actionable at 1am.
const ORDER: Record<DaySlot, HomeBlock[]> = {
  morning: ['action', 'insight', 'coaching', 'log'],
  midday:  ['action', 'coaching', 'insight', 'log'],
  evening: ['action', 'log', 'coaching', 'insight'],
  night:   ['log', 'insight', 'action', 'coaching'],
};

export function homeOrder(istHour: number): HomeBlock[] {
  return ORDER[daySlot(istHour)];
}

/** The greeting line, so the page reads like it knows the time of day. */
export function slotGreeting(slot: DaySlot): string {
  switch (slot) {
    case 'morning': return 'Discipline today, success tomorrow.';
    case 'midday':  return 'Half the day left — make it count.';
    case 'evening': return 'Prime hours. This is where CAT is won.';
    case 'night':   return 'Close the day out — log it before you sleep.';
  }
}
