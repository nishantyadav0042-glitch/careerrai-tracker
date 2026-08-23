// ── Facts 5 and 6 — logged_days_last_7 and logged_today ─────────────────────
//
// 0C.3 Wave 1. Founder ruling, 23 Aug: "Implement only the GREEN facts whose
// semantics are already constitutionally locked… The surfaces should become
// renderers, not calculators."
//
// These two were GREEN in the 0C.2.1 Fact Inventory — definition, source,
// window and zero-semantics all ruled — and yet had SIX and FIVE independent
// implementations respectively, because being ruled in a document is not the
// same as being owned by a module.
//
// ── WHY ZERO IS A VALUE HERE AND NOT A DEFAULT ─────────────────────────────
//
// The contract's rule 2 says a producer "never defaults to zero". That rule is
// about ABSENCE OF EVIDENCE. This case is the opposite: `daily_reports` is the
// COMPLETE record of log submissions (canonical.ts, `dailyLogState`), with
// UNIQUE (student_id, report_date) enforced in 001_initial_schema.sql:45. A
// day with no row is not a day we failed to measure — it is a day the student
// did not submit a log, which is exactly the question being asked.
//
// The distinction is load-bearing and this repo has paid for getting it wrong
// the other way: J2's sleep flag fired at students who had logged nothing,
// because `avg([]) === 0` treated "nothing to average" as "an average of
// nothing". Here the query answers the question; there it did not.
//
// What is NOT claimed: that zero logged days means zero studying. It means
// zero logs. `study_duration` is a different fact, deferred to Wave 5 with its
// semantics still open (docs/0C-3G-G4-STUDY-DURATION-AUDIT.md, B1–B7).
//
// ── WHY OUT-OF-WINDOW ROWS ARE A REFUSAL, NOT A FILTER ─────────────────────
//
// If the caller hands over a row outside [today−6 … today], the producer
// returns UNKNOWN and records a violation. It does NOT quietly trim.
//
// That is the point of the whole wave. The eight-day bug was exactly a caller
// passing eight days of rows to something that divided by seven. A producer
// that silently trims would make that bug invisible again; a producer that
// refuses makes it impossible to ship. Contract rule 3: evidence is never
// laundered, and clamping belongs to presentation.
//
// PURE. No I/O, no clock, no database. `today` and the rows arrive as
// arguments. The single reader is src/lib/reads/daily-log.ts.

import { type FactDef, type Provenance, known, unknown } from './contract';
import { trailingWindow, inWindow, isDayKey, TRAILING_WINDOW_DAYS } from './window';

function prov(factKey: string, version: string, inputs: Record<string, unknown>): Provenance {
  return { factKey, version, source: 'dailyLogState', inputs };
}

/** What both producers need: the day keys `daily_reports` holds, and today. */
export interface DailyLogInput {
  /** `report_date` for every row the reader returned. Order irrelevant. */
  reportDates: readonly string[];
  /** The student's CareerRai day — `studyDayString()`, supplied by the caller. */
  today: string;
}

// ── Fact 5 ──────────────────────────────────────────────────────────────────

export const loggedDaysLast7: FactDef<DailyLogInput, number> = {
  key: 'logged_days_last_7',
  version: 'v1',
  semanticType: 'DERIVED_FACT',
  meaning:
    'How many of the last seven CareerRai days [today−6 … today] the student submitted a daily log on. Not hours, not ticks — submissions.',
  canonicalSource: 'dailyLogState',
  unit: 'count',
  timeBasis: 'trailing_7_days',
  membershipUniverse: 'the seven CareerRai days [today−6 … today], inclusive',
  numerator: 'distinct report_date values inside the window',
  denominator: '7',
  validRange: [0, TRAILING_WINDOW_DAYS],
  unknownWhen: [
    '`today` is not a valid YYYY-MM-DD CareerRai day key',
    'a report_date is malformed',
    'a report_date falls outside [today−6 … today] — the caller queried the wrong window',
  ],
  produce: ({ reportDates, today }) => {
    const p = prov('logged_days_last_7', 'v1', { rows: reportDates.length, today });

    if (!isDayKey(today)) {
      return unknown('invalid_input', p, [`today is not a day key: ${String(today)}`]);
    }
    const w = trailingWindow(today, TRAILING_WINDOW_DAYS);

    const malformed = reportDates.filter((d) => !isDayKey(d));
    if (malformed.length > 0) {
      return unknown('invalid_input', p, [
        `${malformed.length} report_date value(s) are not day keys, first: ${String(malformed[0])}`,
      ]);
    }
    const outside = reportDates.filter((d) => !inWindow(w, d));
    if (outside.length > 0) {
      // Deliberately not filtered away. See the header: a silent trim is how
      // the eight-day window survived five files.
      return unknown('out_of_universe', p, [
        `${outside.length} row(s) outside [${w.start} … ${w.end}], first: ${outside[0]} — the caller's window is wrong`,
      ]);
    }

    // Distinct, though UNIQUE (student_id, report_date) already guarantees it.
    // Belt and braces: if that constraint is ever relaxed, this fact does not
    // start counting one day twice.
    return known(new Set(reportDates).size, p);
  },
};

// ── Fact 6 ──────────────────────────────────────────────────────────────────

export const loggedToday: FactDef<DailyLogInput, boolean> = {
  key: 'logged_today',
  version: 'v1',
  semanticType: 'FACT',
  meaning:
    "Whether the student has submitted a daily log for the CareerRai day in progress. False means no submission — it does not mean they did not study.",
  canonicalSource: 'dailyLogState',
  unit: 'boolean',
  timeBasis: 'point_in_time',
  unknownWhen: [
    '`today` is not a valid YYYY-MM-DD CareerRai day key',
    'a report_date is malformed',
  ],
  produce: ({ reportDates, today }) => {
    const p = prov('logged_today', 'v1', { rows: reportDates.length, today });

    if (!isDayKey(today)) {
      return unknown('invalid_input', p, [`today is not a day key: ${String(today)}`]);
    }
    const malformed = reportDates.filter((d) => !isDayKey(d));
    if (malformed.length > 0) {
      return unknown('invalid_input', p, [
        `${malformed.length} report_date value(s) are not day keys, first: ${String(malformed[0])}`,
      ]);
    }
    // No window check: this fact asks about ONE day, so any wider row set the
    // caller happens to hold is harmless — it cannot change the answer.
    return known(reportDates.includes(today), p);
  },
};
