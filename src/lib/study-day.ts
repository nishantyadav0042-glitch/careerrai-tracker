// ── THE study day, with no dependencies ─────────────────────────────────────
//
// A session running past midnight belongs to the PREVIOUS study day until
// 3:00 AM IST. `streak-utils.getLogDateString` has always been the owner of
// that rule, but it imports a Supabase client — too heavy for the tiny
// client-side files that also need a "today" key (the insight cloud, the
// once-a-day modal lock). Those files each hand-rolled
// `new Date().toISOString().slice(0,10)` instead: UTC midnight, which is
// 5:30 AM IST — inside the busiest block we have (22:00–04:00 leads on every
// measure; see day-slot.ts). A student at 1 AM was in "yesterday" for their
// log and "today" for their insight cloud.
//
// This module is a LEAF (imports nothing) so both the browser and the server
// can share one implementation. streak-utils re-exports from here, so
// getLogDateString stays the name most of the codebase already knows.
//
// Edge cases, verified by unit test:
//   02:30 IST on 26 Jul → "2026-07-25"  (still yesterday's study day)
//   03:30 IST on 26 Jul → "2026-07-26"  (new study day)
//   23:00 IST on 26 Jul → "2026-07-26"

export const STUDY_DAY_ROLLOVER_HOUR = 3; // IST
const IST_OFFSET_MS = 5.5 * 3600_000;

/** The study-day key (YYYY-MM-DD) for a moment in time. */
export function studyDayString(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS - STUDY_DAY_ROLLOVER_HOUR * 3600_000);
  return shifted.toISOString().slice(0, 10);
}

/** The instant a study day begins, as an absolute Date (for DB range queries). */
export function studyDayStart(now: Date = new Date()): Date {
  return new Date(`${studyDayString(now)}T0${STUDY_DAY_ROLLOVER_HOUR}:00:00+05:30`);
}
