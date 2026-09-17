// ── THE FROZEN BASELINE — 16 Sep 2026, before confirm-or-correct ────────────
//
// Founder: "Before changing the logging experience, record the current
// baseline. Do not start changing other retention mechanics simultaneously.
// Otherwise, three weeks later you'll have no idea what caused the movement."
//
// So these numbers are frozen here, in code, with their definitions beside
// them. A number in a chat message can be remembered wrongly; a number in a
// document can be edited to match a later hope. This file exists so the
// "after" readout is forced through the SAME definitions as the "before", and
// so a metric cannot be quietly redefined into a success.
//
// EVERY NUMBER HERE IS COMPUTED FROM `daily_reports`, NEVER FROM `daily_log`.
// The event undercounted real logs by 80-88% for nine days (Incident #96's
// neighbour, Incident #95), so any retention figure quoted before 16 Sep sat
// on a wrong denominator — including the ~29.4% Day-2 figure that had been
// circulating. Measured from the table, Day-2 is 26.8%.
//
// Staff, demo and test accounts are excluded from every figure.

export const BASELINE_FROZEN_ON = '2026-09-16';

export interface Metric {
  /** What it measures, in one line a human can check a query against. */
  definition: string;
  value: number;
  unit: '%' | 'count' | 'per_day' | 'hours' | 'minutes' | 'tasks';
  /** Rows the figure was computed over — a rate with no denominator is a rumour. */
  n: number;
}

export const BASELINE: Record<string, Metric> = {
  // ── Return behaviour ──────────────────────────────────────────────────────
  day2_return: {
    definition: 'Students who logged again on the calendar day after their first log. Cohort: first log at least 7 days ago.',
    value: 26.8, unit: '%', n: 302,
  },
  second_log_within_7d: {
    definition: 'THE PRIMARY METRIC. Students with any second log within 7 days of their first. Cohort: first log at least 7 days ago.',
    value: 36.1, unit: '%', n: 302,
  },
  repeat_log_within_7d: {
    definition: 'Of every log by any student (not only first logs), the share followed by another log within 7 days. Window: 8-37 days ago, so every log has a complete 7-day tail.',
    value: 59.2, unit: '%', n: 561,
  },
  one_and_done: {
    definition: 'Students whose entire history is exactly one log. Same cohort as day2_return.',
    value: 57.6, unit: '%', n: 302,
  },

  // ── Volume: what the intervention can actually be measured on ────────────
  new_first_loggers_per_day: {
    definition: 'Students whose first-ever log fell in the last 7 days, divided by 7.',
    value: 3.9, unit: 'per_day', n: 27,
  },
  logs_per_week: {
    definition: 'Logs written in the last 7 days.',
    value: 159, unit: 'count', n: 159,
  },
  loggers_per_week: {
    definition: 'Distinct students who logged in the last 7 days. This is the population that will meet the new flow.',
    value: 68, unit: 'count', n: 68,
  },

  // ── The plan: what we ask for, against what happens ──────────────────────
  tasks_planned_per_day: {
    definition: 'Mean tasks in a generated daily routine, last 30 days.',
    value: 4.36, unit: 'tasks', n: 1713,
  },
  tasks_completed_per_day: {
    definition: 'Mean routine tasks ticked per generated routine, last 30 days.',
    value: 0.44, unit: 'tasks', n: 1713,
  },
  task_completion: {
    definition: 'Routine tasks ticked as a share of routine tasks planned, last 30 days.',
    value: 10.0, unit: '%', n: 1713,
  },
  routines_untouched: {
    definition: 'Generated routines where the student ticked NOTHING at all, last 30 days.',
    value: 83.7, unit: '%', n: 1713,
  },
  planned_minutes_median: {
    definition: 'Median est_minutes on a generated routine, last 30 days. The p90 is 600 and the maximum is 960.',
    value: 300, unit: 'minutes', n: 1713,
  },
  reported_hours_median: {
    definition: 'Median study_duration a student actually reports, last 30 days. Stored in HOURS — 0.6h is 36 minutes.',
    value: 0.6, unit: 'hours', n: 639,
  },
  routines_calibrated: {
    definition: 'Generated routines carrying any calibration against the student. The adaptation mechanism exists and is essentially unused.',
    value: 0.8, unit: '%', n: 1713,
  },
};

/**
 * How much bigger the daily ask is than the daily delivery.
 *
 * Median planned 300 minutes against a median 0.6 hours reported. The plan is
 * not slightly ambitious, it is eight times the observed behaviour, and it
 * regenerates at that size every morning regardless of what happened
 * yesterday. 83.7% of routines never get a single tick.
 *
 * This is why confirm-or-correct cannot ship as a logging change alone. On a
 * five-hour plan, "what happened?" asks a student to confirm their own failure
 * once a day, which is a worse experience than the blank form it replaces.
 */
export const PLAN_TO_REALITY_RATIO =
  BASELINE.planned_minutes_median.value / (BASELINE.reported_hours_median.value * 60);

// ── THE DECISION RULE, SET BEFORE THE NUMBERS ARRIVE ────────────────────────
//
// Founder: "Don't wait until the numbers arrive to decide what they mean …
// This protects you from 'we shipped a feature and retention didn't move, so
// let's add another feature.'"
//
// Read against `repeat_log_within_7d`, NOT against second_log_within_7d.
// At 3.9 new first-loggers a day, detecting even a 14-point lift on the
// first-logger metric needs roughly 195 students and therefore ~50 days;
// a realistic 8-point lift needs over 600 and cannot be read this year. The
// repeat-log metric covers 68 students a week and the same behaviour — another
// useful preparation event — so it is the one that can answer in 14 days.
// second_log_within_7d stays the stated goal and is reported alongside; it is
// simply not the gate.

export type Signal = 'strong' | 'weak' | 'none' | 'negative';

export interface SignalBand {
  meaning: string;
  then: string;
}

export const SIGNAL_BANDS: Record<Signal, SignalBand> = {
  strong: {
    meaning: 'Repeat logging up by 8 points or more, and students name the adjusted plan when asked why they came back.',
    then: 'The loop works. Deepen adaptive execution, then add the timetable context that makes it better.',
  },
  weak: {
    meaning: 'Students return but the returning logs carry no real preparation — no tasks ticked, minutes near zero.',
    then: 'An opening problem or weak task value, not a retention breakthrough. Do not build more surface area.',
  },
  none: {
    meaning: 'Repeat logging moves by less than 3 points either way.',
    then: 'Stop assuming logging and adaptation are the core solution. The interviews decide what is next, not another feature.',
  },
  negative: {
    meaning: 'Repeat logging falls, or students say the automatic plan changes are wrong.',
    then: 'Roll back the healing, keep the confirm-or-correct input, and fix the engine before re-enabling it.',
  },
};

/** Points of movement in repeat_log_within_7d that count as a real signal. */
export const STRONG_LIFT_POINTS = 8;
export const NOISE_BAND_POINTS = 3;

/**
 * Which band the post-change number falls in.
 *
 * `meaningful` is what separates 'strong' from 'weak': a return that carries no
 * ticked task and no reported minutes is an opening, not a preparation event,
 * and counting it as success is how a vanity metric is born.
 */
export function readSignal(afterRepeatPct: number, meaningful: boolean): Signal {
  const delta = afterRepeatPct - BASELINE.repeat_log_within_7d.value;
  if (delta <= -NOISE_BAND_POINTS) return 'negative';
  if (delta < NOISE_BAND_POINTS) return 'none';
  if (delta >= STRONG_LIFT_POINTS && meaningful) return 'strong';
  return 'weak';
}
