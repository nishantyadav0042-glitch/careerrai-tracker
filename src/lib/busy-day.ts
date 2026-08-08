import { catExamDate } from './routine-engine';

// The busy-day decision, as a pure function — so the rule can be tested
// without a database and can never differ between the route and any surface
// that wants to explain it before the student taps.
//
// Founder, 8 Aug: "Busy day (personal commitments)." On a day the student says
// they were busy, shift that day's plan and the target date forward by one.
// "This won't happen in coaching student case."

export interface BusyDayInput {
  planSource: string | null;   // 'coaching' | 'careerrai' | null
  targetDate: string | null;   // syllabus_target_date, yyyy-mm-dd
  attemptYear: number | null;
  today: string;               // yyyy-mm-dd (the 3 AM IST log day)
}

export interface BusyDayVerdict {
  shift: boolean;
  reason: 'ok' | 'coaching' | 'no_date' | 'exam_wall';
  previousTargetDate: string | null;
  newTargetDate: string | null;
  /** True when the date could not move because it is already at the exam. */
  hitExamWall: boolean;
  message: string;
}

/** One day later, in ISO. UTC arithmetic — no timezone can shift the result. */
export function shiftIsoDay(iso: string, days = 1): string {
  return new Date(Date.parse(iso + 'T00:00:00Z') + days * 86_400_000)
    .toISOString().slice(0, 10);
}

export function busyDayOutcome(input: BusyDayInput): BusyDayVerdict {
  const base = {
    previousTargetDate: input.targetDate,
    newTargetDate: null as string | null,
    hitExamWall: false,
  };

  // A coaching student's plan is anchored to what their class teaches on a
  // given DATE. Sliding it a day would leave them a day behind their own
  // classroom — desynchronised from the one schedule they cannot move.
  if (input.planSource === 'coaching') {
    return {
      ...base, shift: false, reason: 'coaching',
      message:
        "Your plan follows your coaching's dates, so it can't move — your class won't. " +
        "Today's topics stay on your list and we'll keep them in the revision queue.",
    };
  }

  // No finish date to give. The postpone still happens in the route; there is
  // simply no date arithmetic to report.
  if (!input.targetDate) {
    return {
      ...base, shift: true, reason: 'no_date',
      message: "Today's work moves to tomorrow. Nothing is lost.",
    };
  }

  const proposed = shiftIsoDay(input.targetDate, 1);
  const examYear = input.attemptYear ?? Number(input.today.slice(0, 4));
  const exam = catExamDate(examYear).toISOString().slice(0, 10);

  // The date can give right up to exam day and no further. Past that, moving
  // it would be a promise the calendar cannot keep — the same wall the weekly
  // reconcile already respects (lib/plan-extension).
  if (proposed > exam) {
    return {
      ...base, shift: true, reason: 'exam_wall', hitExamWall: true,
      message:
        "Today's work moves to tomorrow. Your finish date is already at exam day, " +
        "so from here a missed day comes out of revision time rather than the syllabus.",
    };
  }

  return {
    shift: true, reason: 'ok',
    previousTargetDate: input.targetDate,
    newTargetDate: proposed,
    hitExamWall: false,
    message: "Today's work moves to tomorrow, and your finish date moves with it. Nothing is lost.",
  };
}
