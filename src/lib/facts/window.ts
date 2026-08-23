// ── THE trailing window ─────────────────────────────────────────────────────
//
// Constitution Article 1: `trailing_7_days` means the CareerRai days
// [today−6 … today], INCLUSIVE — seven, never eight.
//
// WHY THIS FILE EXISTS. The 0C.3 audit (docs/0C.3-DUPLICATION-MAP.md) found
// six producers of `logged_days_last_7`, and five of them computed
//
//     const weekAgo = new Date(now.getTime() - 7 * 86_400_000)
//     …  .gte('report_date', weekAgo)
//
// which is EIGHT inclusive days, and then rendered the result as
// "N/7 days logged". weekly-diagnosis.ts could literally print
// "Studied 8 of 7 days" — a fact exceeding its own denominator on a student
// surface, and the same number that fires a mentor's consistency flag.
//
// The day KEY was never the problem. study-day.ts chose 05:30 IST precisely
// because it is 00:00 UTC, so `studyDayString()` and a plain
// `toISOString().slice(0,10)` return the same string always — the alternatives
// were made to collapse into the authority rather than be policed. The
// divergence was entirely in the ARITHMETIC, which nothing owned.
//
// So this module owns the arithmetic. `today` always arrives as an argument:
// this file is pure, has no clock, and constructs no date — five competing
// definitions of "today" are what that rule exists to prevent.
//
// LEAF MODULE: imports nothing. Safe for src/lib/facts/** (which may not reach
// a database client at all — see canonical-boundary.guard.test.ts) and safe
// for the browser.

/** The Constitution's trailing window length. Not a tunable. */
export const TRAILING_WINDOW_DAYS = 7;

/** A CareerRai day key: YYYY-MM-DD, as `studyDayString()` produces. */
export function isDayKey(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  // Reject 2026-02-31 and friends: Date round-trips them into March, which
  // would make an impossible date silently become a real one.
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

/**
 * A day key `delta` days from `dayKey`.
 *
 * UTC arithmetic on purpose: a CareerRai day begins at 05:30 IST, which is
 * exactly 00:00 UTC, so "one day later" is exactly +86,400,000 ms with no DST
 * or local-timezone term. `addDays` written against a local `Date` — as
 * prep-memory-data.ts and streak-breakers.ts each declare privately — is
 * correct here only by accident of the server's timezone.
 */
export function addStudyDays(dayKey: string, delta: number): string {
  if (!isDayKey(dayKey)) throw new Error(`addStudyDays: not a day key — ${String(dayKey)}`);
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + delta * 86_400_000)
    .toISOString().slice(0, 10);
}

export interface TrailingWindow {
  /** First day IN the window — inclusive. `today − (days − 1)`. */
  readonly start: string;
  /** Last day in the window — inclusive. `today`. */
  readonly end: string;
  /** Every day key in the window, oldest first. Length is exactly `days`. */
  readonly keys: readonly string[];
}

/**
 * The window [today−(days−1) … today], inclusive at both ends.
 *
 * The `−1` is the whole point. `today − 7` is the eighth day back and does not
 * belong in a seven-day window; a `.gte(start)` filter built from it returns
 * eight days of rows, and every consumer that then divides by 7 is wrong.
 */
export function trailingWindow(today: string, days: number = TRAILING_WINDOW_DAYS): TrailingWindow {
  if (!isDayKey(today)) throw new Error(`trailingWindow: not a day key — ${String(today)}`);
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`trailingWindow: window must be a positive whole number of days — ${String(days)}`);
  }
  const start = addStudyDays(today, -(days - 1));
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(addStudyDays(today, -i));
  return { start, end: today, keys };
}

/** Is this day key inside the window? Inclusive at both ends. */
export function inWindow(w: TrailingWindow, dayKey: string): boolean {
  return dayKey >= w.start && dayKey <= w.end;
}
