// Weekly plan extension — the whole rule, in one pure function.
//
// Founder, 6 Aug, verbatim: "keep the daily hours same... in case any student
// misses its hours or doesn't study just give them a red warning that your
// target date is extending... keep the routine same just extend the syllabus
// completion date... warning should be weekly not daily... you won't take any
// action yourself."
//
// That is a deliberate reversal of how this app used to behave. It used to
// negotiate with the student's day — shrinking the plan toward what they
// actually logged, and saying so in a red banner every morning. Two live
// students showed what that costs: one asked why an 11-hour plan produced
// four hours of tasks, and another was accused of "breaching" while holding a
// nine-day streak.
//
// The new deal is simpler and, more importantly, honest about who owns what.
// The student owns their hours; we never change them. WE own the consequence,
// and the consequence is the date. Miss hours, the date moves. Once a week,
// with the arithmetic attached.

/** Sunday, IST — the day the week is measured and the warning goes out. */
export const RECONCILE_WEEKDAY_IST = 0;

export interface WeekInput {
  /** Hours the student themselves set for a weekday. Never modified by us. */
  weekdayHours: number;
  /** Their weekend figure; falls back to the weekday one. */
  weekendHours?: number | null;
  /** study_duration for each of the 7 days, indexed Mon..Sun. Missing = 0. */
  loggedHoursByDay: (number | null)[];
  /**
   * Days where our own surface never asked for a duration, Mon..Sun.
   *
   * 23 Aug. A row whose study_duration_source is 'not_collected' is the daily
   * check-in gate having posted hours: 0 because "a check-in is not a study
   * claim" (see lib/study-duration-source). Counting it as zero studied is
   * UNKNOWN becoming ZERO at the row level — the same mistake as the failed
   * read, one layer down, and it survives fixing that one.
   *
   * This does NOT touch the founder's standing call that a day with NO log at
   * all is a day with no study. That stays. This is only the narrower case
   * where a row exists and we are the reason it holds no number: such a day is
   * removed from BOTH sides of the arithmetic, so a student is judged on the
   * days we actually measured and never billed for a question we never asked.
   */
  unmeasuredByDay?: boolean[];
  /** Which of those 7 days were Saturday/Sunday. Same Mon..Sun indexing. */
  isWeekendByDay: boolean[];
  /** The student's current syllabus finish date, yyyy-mm-dd. */
  currentTargetDate: string;
  /** The exam. The date can never move past it. */
  examDate: string;
  /**
   * The day this student joined, yyyy-mm-dd. Days before it are not counted
   * against them — they were not here. Optional: omit and the whole week counts.
   */
  joinedOn?: string | null;
  /** The seven dates, Mon..Sun, yyyy-mm-dd. Required to honour joinedOn. */
  daysInWeek?: string[];
}

export interface WeekResult {
  expectedHours: number;
  actualHours: number;
  deficitHours: number;
  /** Days the finish date moves. 0 = they kept up, nothing happens. */
  daysAdded: number;
  previousDate: string;
  newDate: string;
  /** True when the extension was clipped by the exam. */
  hitExamWall: boolean;
  /** The one sentence the student reads. Null when nothing moved. */
  warning: string | null;
}

const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (isoDate: string, n: number) => iso(new Date(Date.parse(isoDate + 'T00:00:00Z') + n * DAY_MS));
const round1 = (n: number) => Math.round(n * 10) / 10;

function pretty(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

export function reconcileWeek(input: WeekInput): WeekResult {
  const weekday = Math.max(0, input.weekdayHours);
  const weekend = Math.max(0, input.weekendHours ?? input.weekdayHours);

  // Expected is what the student's OWN setting asked of them, day by day —
  // but only for the days they were actually here.
  //
  // Without this, a student who signed up on Friday is told on Sunday that they
  // missed Monday through Thursday and their date has moved a week. Three live
  // students would have got exactly that message this Sunday. A warning that
  // blames someone for time before they arrived is not a coach, it is a bug
  // wearing a coach's voice, and it is the first thing they would ever hear
  // from us.
  const joined = input.joinedOn ?? null;
  let expected = 0;
  let countedDays = 0;
  const unmeasured = input.unmeasuredByDay ?? [];
  for (let i = 0; i < 7; i++) {
    if (joined && input.daysInWeek && input.daysInWeek[i] < joined) continue;
    // A day we never asked about cannot be a day they owe us hours for.
    if (unmeasured[i]) continue;
    expected += input.isWeekendByDay[i] ? weekend : weekday;
    countedDays++;
  }

  // A day with no log is a day with no study. Founder's call, and it is what
  // actually happened — counting only logged days would mean a student who
  // never opens the app never sees their date move, which defeats the point.
  const actual = input.loggedHoursByDay
    .slice(0, 7)
    .reduce((sum: number, h, i) => {
      if (joined && input.daysInWeek && input.daysInWeek[i] < joined) return sum;
      if (unmeasured[i]) return sum;   // excluded from expected too — both sides or neither
      return sum + Math.max(0, Number(h ?? 0));
    }, 0);

  const deficit = Math.max(0, expected - actual);

  // Days to add = the missed hours priced at their own daily rate. Missing 20
  // hours at 5 hrs/day is four days of syllabus, not four days of calendar
  // guesswork.
  const clearRate = weekday > 0 ? weekday : 1;
  const rawDaysAdded = deficit > 0 ? Math.ceil(deficit / clearRate) : 0;

  const previousDate = input.currentTargetDate;
  const uncappedDate = addDays(previousDate, rawDaysAdded);

  // The date can never move past the exam. Beyond that it stops being a plan
  // and becomes a number nobody can act on.
  const hitExamWall = uncappedDate > input.examDate;
  const newDate = hitExamWall ? (previousDate > input.examDate ? previousDate : input.examDate) : uncappedDate;
  const daysAdded = Math.round((Date.parse(newDate + 'T00:00:00Z') - Date.parse(previousDate + 'T00:00:00Z')) / DAY_MS);

  let warning: string | null = null;
  if (deficit > 0) {
    // "last week" is a lie for someone who joined on Friday. Say what we counted.
    const span = countedDays >= 7 ? 'last week' : `since you joined (${countedDays} day${countedDays === 1 ? '' : 's'})`;
    const short = `You studied ${round1(actual)} of the ${round1(expected)} hours your plan needed ${span} — ${round1(deficit)} hours short.`;
    warning = hitExamWall
      ? `${short} Your finish date is already at ${pretty(newDate)}, exam day, so it cannot move again. From here every missed hour comes out of your revision time, not the syllabus.`
      : daysAdded > 0
        ? `${short} Your finish date has moved from ${pretty(previousDate)} to ${pretty(newDate)} — ${daysAdded} day${daysAdded === 1 ? '' : 's'} later.`
        // Deficit too small to cost a whole day. Say it plainly rather than
        // inventing a move that did not happen.
        : `${short} Not enough to move your date yet — pull it back this week and it stays where it is.`;
  }

  return {
    expectedHours: round1(expected),
    actualHours: round1(actual),
    deficitHours: round1(deficit),
    daysAdded,
    previousDate,
    newDate,
    hitExamWall,
    warning,
  };
}
