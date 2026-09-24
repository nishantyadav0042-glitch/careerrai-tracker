// ── A CALLBACK CARRIES THE TIME THE STUDENT ASKED FOR (founder, 24 Sep 2026) ─
//
// "For callback always ask Anshul to add time or set time."
//
// The callback time box used to arrive pre-filled with 6:00 PM today, so a
// callback could be saved without anyone choosing a time. Thirty days to
// 24 Sep: 125 of 308 callbacks (41%) sat at exactly 18:00, and 13 were set to
// a time that had already passed when they were saved — a promise the queue
// then treated as overdue the moment it was made.
//
// Now the box starts empty, and the call deck and /api/sales/log share this
// one rule: a time must be entered, and it must be in the future.

/**
 * `YYYY-MM-DDTHH:mm` as typed into a datetime-local box, read as IST.
 * `nowMs` null checks the entry only — what a screen can do while rendering,
 * where reading the clock is impure; the past-time check then runs on Save.
 */
export function callbackTimeProblem(local: unknown, nowMs: number | null): string | null {
  if (typeof local !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local)) {
    return 'Set the time they asked to be called back.';
  }
  const at = Date.parse(`${local.slice(0, 16)}:00+05:30`);
  if (Number.isNaN(at)) return 'Set the time they asked to be called back.';
  if (nowMs != null && at <= nowMs) return 'That time has already passed — set the time they asked for.';
  return null;
}
