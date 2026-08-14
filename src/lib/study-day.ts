// ── THE study day, with no dependencies ─────────────────────────────────────
//
// ONE definition of "today", used by every planner-critical path.
//
// THE ROLLOVER IS 5:30 AM IST (founder, 14 Aug: "keep it Indian 5:30 am to
// 5:30"). A study day therefore runs 05:30 IST on day D to 05:29 IST on D+1,
// so a student still working at 3 AM is finishing YESTERDAY — which is what
// they mean when they say it.
//
// It was 3:00 AM until 14 Aug, and moving it is what finally closed the
// date-integrity gate rather than patching around it. 05:30 IST is exactly
// 00:00 UTC, so `studyDayString()` and the plain `toISOString().slice(0,10)`
// that dozens of files already use now return THE SAME STRING, always. Before
// this there were two live definitions of today disagreeing for 2.5 hours
// every morning, and the audit found two of them deleting the wrong day's
// plan row. You cannot enforce one authority by hand across a whole codebase;
// you can make the alternatives collapse into it.
//
// The module is a LEAF (imports nothing) so browser and server share one
// implementation. streak-utils re-exports it, so getLogDateString stays the
// name most of the codebase already knows.
//
// Backdating is handled separately and deliberately: a student may log a PAST
// date after the fact (see api/logging/log-daily). The rollover decides what
// "today" is; it does not decide what a student is allowed to fill in later.
//
// Edge cases, verified by unit test:
//   03:00 IST on 26 Jul → "2026-07-25"  (still yesterday — the late session)
//   05:29 IST on 26 Jul → "2026-07-25"
//   05:30 IST on 26 Jul → "2026-07-26"  (new study day)
//   23:00 IST on 26 Jul → "2026-07-26"

/** Minutes past IST midnight at which the study day rolls: 05:30. */
export const STUDY_DAY_ROLLOVER_MINUTES = 5 * 60 + 30;
const IST_OFFSET_MS = 5.5 * 3600_000;

/** The study-day key (YYYY-MM-DD) for a moment in time. */
export function studyDayString(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS - STUDY_DAY_ROLLOVER_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** The instant a study day begins, as an absolute Date (for DB range queries). */
export function studyDayStart(now: Date = new Date()): Date {
  return new Date(`${studyDayString(now)}T05:30:00+05:30`);
}
