// The home screen rotates four times a day.
//
// The order below is NOT a designer's intuition about student routines. It is
// read off our own event data (10k+ events, real students, test accounts
// excluded, IST). The first version of this file guessed, and the guess was
// wrong in one important way — see "evening" below.
//
// ── WHEN STUDENTS ACTUALLY OPEN THE APP (app_open by IST hour) ──────────────
//   22:00  86   ← peak
//   23:00  76
//   01:00  76
//   13:00  72
//   18:00  72
//   11:00  66
//   03-07  7-23 ← dead zone
//
// ── WHAT THEY DO, BY SLOT ──────────────────────────────────────────────────
//   slot            log_open  logged  %done   plan   analysis  buddy
//   05-11 morning      31        7     23%     23        7       3
//   12-16 midday       32        7     22%     43       19       6
//   17-21 evening      30       13     43%     80       30       8
//   22-04 night        58       31     53%    104       68      19
//
// Three findings drive the ordering, and all three are things we would have
// got wrong by reasoning from first principles:
//
// 1. NIGHT IS PEAK, NOT EVENING. 22:00-04:00 leads on every single measure —
//    opens, logs, plan views, review, and buying intent. The earlier version
//    of this file claimed evening was "where CAT is won". The data says the
//    real work happens after 10pm.
//
// 2. LOGGING ONLY WORKS LATE. Completion by hour: 20:00 67%, 22:00 53%,
//    23:00 58%, 01:00 60% — against 13:00 20% and 14:00 30%. Students DO open
//    the log at midday (32 times), they just don't finish it, because there is
//    nothing to report yet. Putting the log high before evening would raise
//    attempts and lower completions, which is worse than not asking.
//
// 3. REVIEW IS A NIGHT BEHAVIOUR. Analysis views: 7 in the morning, 68 at
//    night — nearly ten times. The insight card, which explains what happened,
//    belongs where students are already in a reflecting mood.
export type DaySlot = 'morning' | 'midday' | 'evening' | 'night';

/** Cards that move. Everything below these keeps its fixed order. */
export type HomeBlock = 'action' | 'log' | 'insight' | 'coaching';

export function daySlot(istHour: number): DaySlot {
  if (istHour >= 5 && istHour < 12) return 'morning';
  if (istHour >= 12 && istHour < 17) return 'midday';
  if (istHour >= 17 && istHour < 22) return 'evening';
  return 'night'; // 22:00–04:59 — the busiest block of the day
}

// morning — orienting, not yet working. Logging fails 77% of the time here, so
//           it goes last; asking for a log they can't give just trains them to
//           ignore the card.
// midday  — plan views nearly double (23 -> 43) while log completion is at its
//           worst (22%). They're checking what's coming, not reporting.
// evening — the shift. Log completion jumps 22% -> 43%, plan views to 80.
//           Sessions are ending, so the log climbs to second.
// night   — peak everything. Log first (53-60% completion, 31 of all 58 logs),
//           then insight, because review behaviour peaks here (68 analysis
//           views vs 7 in the morning). Coaching last: a weekly quota is not
//           actionable at 1am.
const ORDER: Record<DaySlot, HomeBlock[]> = {
  morning: ['action', 'coaching', 'insight', 'log'],
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
    case 'evening': return 'Sessions are wrapping up. Log what you did.';
    // Most students are here right now, and most logs happen in this window.
    case 'night':   return 'Your best hours. Close the day out before you sleep.';
  }
}
