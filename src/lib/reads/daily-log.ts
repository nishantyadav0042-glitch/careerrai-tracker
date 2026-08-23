// ── THE reader for facts 5 and 6 ────────────────────────────────────────────
//
// One place in the application queries `daily_reports` for the logged-day
// facts. Everything else consumes what comes out of here.
//
// WHY THIS FILE IS NOT IN src/lib/facts/. The producers must stay pure —
// canonical-boundary.guard.test.ts walks the transitive import closure of
// src/lib/facts/** and fails the build if anything in it can so much as import
// a database client. That is what forces the pure-core / thin-shell shape. So
// the core lives in facts/daily-log.ts and the shell lives here, and the shell
// is the ONLY module allowed to hold both a client and the window arithmetic.
//
// ── UNAVAILABLE CAN NEVER BECOME A VALUE ───────────────────────────────────
//
// A failed read does not reach the producer at all. `readRows` (the Truth
// Boundary shipped in #95) turns "error", "data === null with no error", and a
// thrown exception into UNAVAILABLE, and this function returns immediately.
// The producer is called only on rows that actually arrived.
//
// That ordering is the guarantee, and it is structural rather than a promise:
// there is no code path here in which `unavailable` and a FactResult coexist.
// It is the same rule the weekly-plan-reconcile incident cost us — that read
// returned `data: null` with no error and the caller treated it as "no rows",
// so 56 students were told they had studied zero hours in a week they had
// studied 282 of.
//
// ── ONE QUERY SHAPE ────────────────────────────────────────────────────────
//
// The column list is a fixed superset of what the migrated consumers need, so
// there is exactly one `daily_reports` window query in the codebase rather
// than one per caller. `study_duration` rides along because three consumers
// render an average beside the day count — that number is Wave 5 and its
// semantics are still open (docs/0C-3G-G4-STUDY-DURATION-AUDIT.md, B1–B7).
// Nothing here canonises it; the rows are simply passed through.

import { type Source, readRows, unavailable, value } from '../truth/source';
import { type FactResult } from '../facts/contract';
import { loggedDaysLast7, loggedToday } from '../facts/daily-log';
import { trailingWindow, type TrailingWindow, TRAILING_WINDOW_DAYS } from '../facts/window';

export interface DailyLogRow {
  report_date: string;
  study_duration: number | null;
  study_duration_source: string | null;
  topics_covered: string[] | null;
  mock_score: number | null;
  mock_taken: boolean | null;
}

export interface DailyLogWindow {
  /** The CareerRai day the window was anchored on. */
  readonly today: string;
  /** [today−6 … today], inclusive. Seven keys, never eight. */
  readonly window: TrailingWindow;
  /** Every row in the window, oldest first. */
  readonly rows: readonly DailyLogRow[];
  readonly loggedDaysLast7: FactResult<number>;
  readonly loggedToday: FactResult<boolean>;
}

/**
 * Read the trailing-seven-day log window and produce both facts.
 *
 * `today` must be the student's CareerRai day (`getLogDateString()` /
 * `studyDayString()`), never a raw UTC date and never constructed here — this
 * module has no clock for the same reason the producers do not.
 */
export async function readDailyLogWindow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  studentId: string,
  today: string,
  days: number = TRAILING_WINDOW_DAYS,
): Promise<Source<DailyLogWindow>> {
  let w: TrailingWindow;
  try {
    w = trailingWindow(today, days);
  } catch (e) {
    // A bad day key is a programming error, not a data outage — but it must
    // still not become a number on a student's screen.
    return unavailable<DailyLogWindow>(
      `daily_reports window: ${e instanceof Error ? e.message : 'bad window'}`,
    );
  }

  const source = await readRows<DailyLogRow>('daily_reports window', () =>
    admin
      .from('daily_reports')
      .select('report_date, study_duration, study_duration_source, topics_covered, mock_score, mock_taken')
      .eq('student_id', studentId)
      .gte('report_date', w.start)
      .lte('report_date', w.end)
      .order('report_date', { ascending: true }));

  // The short circuit. Nothing below this line runs on a failed read.
  if (source.state === 'unavailable') return unavailable<DailyLogWindow>(source.reason);

  const rows: DailyLogRow[] = source.state === 'value' ? source.value : [];
  const reportDates = rows.map((r) => r.report_date);
  const input = { reportDates, today };

  return value<DailyLogWindow>({
    today,
    window: w,
    rows,
    loggedDaysLast7: loggedDaysLast7.produce(input),
    loggedToday: loggedToday.produce(input),
  });
}

/**
 * The day count for a renderer, or `null` when we do not know it.
 *
 * `null` is the ONLY thing an unavailable read or an UNKNOWN fact may become.
 * A renderer that wants a number must handle the null; it may not substitute
 * one. Deliberately NOT named `valueOr`/`unwrapOr`/`getOrDefault` — those
 * names are forbidden repo-wide (truth-boundary.test.ts) because a default-
 * value escape hatch is how an outage becomes a student fact.
 */
export function loggedDaysOrUnknown(s: Source<DailyLogWindow>): number | null {
  if (s.state !== 'value') return null;
  return s.value.loggedDaysLast7.known ? s.value.loggedDaysLast7.value : null;
}

/** As above, for fact 6. `null` means "we could not tell", never "no". */
export function loggedTodayOrUnknown(s: Source<DailyLogWindow>): boolean | null {
  if (s.state !== 'value') return null;
  return s.value.loggedToday.known ? s.value.loggedToday.value : null;
}

/** The rows, only when the read succeeded. Never invents an empty window. */
export function windowRowsOrUnknown(s: Source<DailyLogWindow>): readonly DailyLogRow[] | null {
  return s.state === 'value' ? s.value.rows : null;
}
