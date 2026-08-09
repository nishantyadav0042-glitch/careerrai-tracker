// ONE rule for "is this video session still live", shared by every surface on
// both sides of the meeting.
//
// Born from the 4 Aug orientation that failed in the worst possible way: the
// STUDENT's list carried a 1-hour grace window, the BUDDY's did not. At
// 22:00:00 — the exact second the call was due — the session dropped out of
// the mentor's app entirely while the student's app still showed Join. She
// joined an empty room ("nobody was in the meet!"); the mentor had no button
// to press ("my app was stuck").
//
// Two people in one meeting must never get two different answers to "is this
// happening". Same failure class as Incident #5 (a count and its list computed
// by different queries) — so the rule lives here, once, and every surface
// imports it rather than hand-rolling a timestamp.

/** How long a session stays visible AFTER its start time. Calls run late, and
 *  a mentor opening the app at the scheduled minute must still find the door. */
export const SESSION_GRACE_MS = 60 * 60 * 1000;

/** How long BEFORE the start the Join button appears.
 *
 * Raised from 15 to 30 on 9 Aug. Arnav opened the app 90 seconds before his
 * first paid session, found nowhere obvious to click, and left after sixteen
 * seconds; a door that only appears at the last moment is a door people miss.
 */
export const JOIN_OPENS_MINS_BEFORE = 30;

/**
 * A session leaves the schedule this long after its START.
 *
 * Founder, 9 Aug: "after the passage of 1 hr after the session time, session
 * automatically removed from the schedule so that buddy can schedule another
 * session." It is the same hour as SESSION_GRACE_MS on purpose — the moment a
 * session stops being joinable is the moment its slot should free up, or the
 * mentor is staring at a dead row that still blocks the calendar.
 *
 * That blocking is real: `no_overlapping_buddy_sessions` is an EXCLUDE
 * constraint over sessions in status scheduled/active, so a stale row makes a
 * same-slot rebooking fail outright.
 */
export const RELEASE_AFTER_MS = SESSION_GRACE_MS;

/** Lower bound for a "sessions still happening" query — pass to .gte(). */
export function sessionsVisibleFrom(now: number = Date.now()): string {
  return new Date(now - SESSION_GRACE_MS).toISOString();
}

/** Whether the Join button should be live for a session. `minsAway` is
 *  negative once the session has started — still joinable, by design. */
export function isJoinOpen(minsAway: number): boolean {
  return minsAway <= JOIN_OPENS_MINS_BEFORE;
}
