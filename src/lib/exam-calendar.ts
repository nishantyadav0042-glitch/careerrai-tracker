// ── THE EXAM CALENDAR — one authority for what the exam claims of a day ─────
//
// PR #88 unified the topic planner but left the exam calendar owned by
// full-plan alone, and said so out loud: "Home does not yet know about the
// Whole Plan's exam calendar, so on a mock day the two still differ by the
// mock's two hours. Tracked, not hidden." This module closes that gap.
//
// Everything calendar-shaped lives here — which day carries a mock, which day
// owes the analysis, what phase a date is in, and how many hours the calendar
// claims before any topic may be placed. full-plan builds the Whole Plan on
// it; generateRoutine builds Home (and the 6am cron's persisted plan) on the
// SAME claim, so day 0 of the projection equals Home on mock days too — by
// construction, not by coincidence.
//
// The research behind the numbers is docs/SELFPREP-PLAN-RESEARCH-2026-08.md:
// mocks start months out and ramp; analysis time equals exam time; November
// takes no new topics.

/** CAT is always the last Sunday of November of a given year. */
export function catExamDate(year: number): Date {
  const nov30 = new Date(year, 10, 30);
  const lastSunday = new Date(nov30);
  lastSunday.setDate(30 - nov30.getDay());
  return lastSunday;
}

/** Mocks per week, by how close the exam is. Founder-approved, 8 Aug. */
export const MOCKS_PER_WEEK = {
  /** Now through September. The floor: "one complete mock every week." */
  build: 1,
  /** October and November. Two, not three — the founder's call: three a week
   *  leaves no room to act on what the analysis found. */
  intensive: 2,
} as const;

/** A mock's exam sitting. Its analysis is priced separately below. */
export const MOCK_SIT_HOURS = 2;

/** Analysis is scheduled as its own block the NEXT day, never bundled in. */
export const MOCK_ANALYSIS_HOURS = 2;

export type PlanPhase = 'build' | 'intensive' | 'revision';

/**
 * Which phase a date falls in.
 *
 * September and October are "intensive" and November is "revision", matching
 * getPhase() in routine-engine so the long view and the daily plan can never
 * disagree about what season it is.
 */
export function phaseOn(date: Date, exam: Date): PlanPhase {
  if (date.getFullYear() === exam.getFullYear()) {
    const m = date.getMonth();
    if (m === 10) return 'revision';        // November, to exam day
    if (m === 8 || m === 9) return 'intensive'; // September, October
  }
  return 'build';
}

/**
 * How many mocks the week containing `date` should carry.
 *
 * Keyed on the MONTH, not on phaseOn — the study phase and the mock cadence
 * are different things and conflating them silently put September on two
 * mocks a week. The founder's rule is October and November: "two a week is
 * right; three is too many."
 */
export function mocksForWeekOf(date: Date, exam: Date): number {
  const sameYear = date.getFullYear() === exam.getFullYear();
  const m = date.getMonth();
  return sameYear && (m === 9 || m === 10) ? MOCKS_PER_WEEK.intensive : MOCKS_PER_WEEK.build;
}

/**
 * Is this a mock day?
 *
 * Sunday always — a full mock needs an unbroken two hours plus analysis, and a
 * weekday evening is where good intentions go to die. The second mock, once
 * October starts, goes on Wednesday: far enough from Sunday that the analysis
 * of one is done before the next begins, which is the entire point of two.
 */
export function isMockDay(date: Date, exam: Date): boolean {
  if (date > exam) return false;
  const dow = date.getUTCDay(); // 0 = Sunday
  const perWeek = mocksForWeekOf(date, exam);
  if (dow === 0) return true;
  return perWeek >= 2 && dow === 3; // Wednesday
}

export interface CalendarClaim {
  /** This day carries the full mock (2h of the day's budget). */
  mockToday: boolean;
  /** Yesterday was a mock day, so today owes its 2h analysis block. */
  analysisToday: boolean;
  /** Hours the calendar claims before any topic is placed. 0, 2, or 4. */
  reservedHours: number;
}

const DAY_MS = 86_400_000;

/**
 * What the exam calendar claims of this date.
 *
 * A mock day owes 2h to the mock; the day after owes 2h to its analysis.
 * Reserving the WHOLE day was full-plan's first attempt and it was too blunt —
 * a student with six hours still has four left after a mock. Every surface
 * that turns a day's hours into topic blocks must subtract this claim FIRST,
 * or two surfaces describe two different days again.
 */
export function calendarClaim(date: Date, exam: Date): CalendarClaim {
  const mockToday = isMockDay(date, exam);
  const analysisToday = isMockDay(new Date(date.getTime() - DAY_MS), exam);
  return {
    mockToday,
    analysisToday,
    reservedHours: (mockToday ? MOCK_SIT_HOURS : 0) + (analysisToday ? MOCK_ANALYSIS_HOURS : 0),
  };
}
