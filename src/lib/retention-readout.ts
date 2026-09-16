// ── THE AFTER, COMPUTED THROUGH THE BEFORE'S DEFINITIONS ────────────────────
//
// retention-baseline.ts froze what the product looked like on 16 Sep, with
// every metric's definition written beside it. This module recomputes those
// same metrics from live rows.
//
// It exists so the comparison cannot cheat. A readout written independently
// would drift a definition — a cohort cut one day differently, an incomplete
// 7-day tail counted as a failure to return — and the difference would read as
// the intervention working. Every function here is pure and takes rows, so the
// same code can be run over the baseline window and the current one and the
// two numbers are genuinely comparable.
//
// MEANINGFUL, NOT MERELY PRESENT. The decision rule turns on whether a return
// carried real preparation. A student who opens the app and writes an empty
// row has not prepared, and counting them is how a vanity metric is born. The
// authority for "was this a real study day" is `dayWasStudied` in check-in.ts
// — the same predicate the rest of the product uses. This module does not get
// its own opinion about that.

import { dayWasStudied } from '@/lib/check-in';

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(Date.parse(d) + n * DAY);

export interface ReadoutLog {
  student_id: string;
  report_date: string;
  day_outcome?: string | null;
  study_duration?: number | string | null;
}

export interface Rate {
  /** Percent, one decimal, or null when the denominator is empty. */
  pct: number | null;
  hits: number;
  n: number;
}

const rate = (hits: number, n: number): Rate => ({
  pct: n === 0 ? null : Math.round((1000 * hits) / n) / 10,
  hits,
  n,
});

/** Distinct log dates per student, sorted, de-duplicated. */
function byStudent(logs: readonly ReadoutLog[]): Map<string, string[]> {
  const m = new Map<string, Set<string>>();
  for (const l of logs) {
    if (!l.student_id || !l.report_date) continue;
    const s = m.get(l.student_id) ?? new Set<string>();
    s.add(l.report_date);
    m.set(l.student_id, s);
  }
  return new Map([...m].map(([k, v]) => [k, [...v].sort()]));
}

/** Dates on which this student did real preparation, not merely a row. */
function meaningfulDates(logs: readonly ReadoutLog[]): Set<string> {
  const out = new Set<string>();
  for (const l of logs) if (dayWasStudied(l)) out.add(`${l.student_id}|${l.report_date}`);
  return out;
}

export interface Readout {
  /** THE GATE. Of every log with a complete 7-day tail, was there another within 7 days? */
  repeatWithin7d: Rate;
  /** The same, but the follow-up log had to carry real preparation. */
  meaningfulRepeatWithin7d: Rate;
  /** THE STATED GOAL. First-loggers with any second log inside 7 days. */
  secondLogWithin7d: Rate;
  day2Return: Rate;
  oneAndDone: Rate;
  /** First-ever logs inside the window — the volume the stated goal depends on. */
  newFirstLoggers: number;
}

/**
 * Compute every baseline metric over a window.
 *
 * `asOf` is the day the readout is taken. Windows are chosen so that every
 * subject has had its full observation period: a log from yesterday cannot yet
 * have failed to be followed within 7 days, and counting it as a failure is
 * the single easiest way to manufacture a decline.
 */
export function readRetention(
  logs: readonly ReadoutLog[],
  opts: { asOf: string; windowDays?: number },
): Readout {
  const windowDays = opts.windowDays ?? 30;
  const dates = byStudent(logs);
  const meaningful = meaningfulDates(logs);

  // Every log is a subject once its 7-day tail has fully elapsed.
  //
  // -8, not -7, and the difference is not cosmetic: the frozen baseline was
  // measured over `report_date between current_date - 37 and current_date - 8`,
  // so a readout that admitted day -7 would compare a 31-day window against a
  // 30-day one and read the extra day as movement. The last day whose tail is
  // genuinely closed is asOf - 8.
  const tailClosed = addDays(opts.asOf, -8);
  const windowStart = addDays(opts.asOf, -(windowDays + 7));

  let repeatHits = 0, repeatN = 0, meaningfulHits = 0;
  for (const [student, days] of dates) {
    for (const d of days) {
      if (d > tailClosed || d < windowStart) continue;
      repeatN += 1;
      const within = days.filter((x) => x > d && x <= addDays(d, 7));
      if (within.length > 0) {
        repeatHits += 1;
        if (within.some((x) => meaningful.has(`${student}|${x}`))) meaningfulHits += 1;
      }
    }
  }

  // First-logger cohort: their first log must itself have a closed tail.
  let firstN = 0, secondHits = 0, day2Hits = 0, oneAndDoneHits = 0, newFirst = 0;
  for (const [, days] of dates) {
    const first = days[0];
    if (first >= windowStart && first <= opts.asOf) newFirst += 1;
    if (first > tailClosed || first < windowStart) continue;
    firstN += 1;
    if (days.some((d) => d > first && d <= addDays(first, 7))) secondHits += 1;
    if (days.includes(addDays(first, 1))) day2Hits += 1;
    if (days.length === 1) oneAndDoneHits += 1;
  }

  return {
    repeatWithin7d: rate(repeatHits, repeatN),
    meaningfulRepeatWithin7d: rate(meaningfulHits, repeatN),
    secondLogWithin7d: rate(secondHits, firstN),
    day2Return: rate(day2Hits, firstN),
    oneAndDone: rate(oneAndDoneHits, firstN),
    newFirstLoggers: newFirst,
  };
}
