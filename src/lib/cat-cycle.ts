import { catExamDate } from '@/lib/routine-engine';

// Which CAT is this student sitting?
//
// Everything used to assume "the next November", which quietly locked the
// signup funnel to one exam cycle: /start priced every finish-date option
// against 10 Nov of the CURRENT year, so a student who came to us wanting to
// prepare for CAT 2027 was handed a syllabus deadline in 2026 and a countdown
// for an exam they aren't taking.
//
// CAT is the last Sunday of November. catExamDate() already encodes that and
// gives 29 Nov 2026 and 28 Nov 2027, so nothing about the date needs inventing
// — what was missing was letting a student CHOOSE the cycle.

export interface CatCycle {
  year: number;
  /** The exam itself. */
  examDate: Date;
  /** Last sensible day to still be finishing the syllabus — 3 weeks out. */
  syllabusCutoff: Date;
  label: string;
}

/** Three weeks before the exam: mocks and revision need that window clear. */
const CUTOFF_DAYS_BEFORE = 21;

export function catCycle(year: number): CatCycle {
  const examDate = catExamDate(year);
  return {
    year,
    examDate,
    syllabusCutoff: new Date(examDate.getTime() - CUTOFF_DAYS_BEFORE * 86_400_000),
    label: `CAT ${year}`,
  };
}

/**
 * The cycles a student can still realistically choose, soonest first.
 *
 * A cycle drops off the list once its syllabus cutoff has passed — there is no
 * honest way to offer "finish the syllabus for CAT 2026" in mid-November 2026,
 * and offering it produces exactly the impossible target dates we already have
 * three students stuck on.
 */
export function selectableCatCycles(now: Date = new Date(), count = 2): CatCycle[] {
  const out: CatCycle[] = [];
  let year = now.getFullYear();
  // Walk forward until we find the first cycle still worth starting.
  while (out.length < count) {
    const c = catCycle(year);
    if (c.syllabusCutoff > now) out.push(c);
    year += 1;
    // Guard: never loop unbounded if the clock is wrong.
    if (year > now.getFullYear() + 6) break;
  }
  return out;
}

/** The cycle a student is actually on, from their stored attempt year. */
export function cycleForStudent(attemptYear: number | null | undefined, now: Date = new Date()): CatCycle {
  const cycles = selectableCatCycles(now, 3);
  const match = attemptYear ? cycles.find((c) => c.year === attemptYear) : null;
  // An attempt year whose cutoff has already gone (a repeater who never
  // updated it) rolls to the soonest cycle still open, rather than producing a
  // countdown to a date in the past.
  return match ?? cycles[0] ?? catCycle(now.getFullYear() + 1);
}

/** Has this student's own syllabus deadline already gone? */
export function isTargetExpired(targetIso: string | null | undefined, now: Date = new Date()): boolean {
  if (!targetIso) return false;
  const t = Date.parse(`${targetIso}T23:59:59`);
  if (Number.isNaN(t)) return false;
  return t < now.getTime();
}
