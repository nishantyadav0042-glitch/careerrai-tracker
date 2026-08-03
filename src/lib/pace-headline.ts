// The Home pace headline — and the one rule it exists to enforce:
//
//   THE CARD MUST NEVER SHOW TWO NUMBERS THAT DISAGREE.
//
// A student wrote in with a screenshot: "9h needed · 1h ahead" across the top,
// and directly beneath it a day's plan of 12m + 9m + 9m. Thirty minutes. He
// asked, reasonably, "ye time aiss kyu show ho rha 12min, 9min ??"
//
// Both numbers were correct and they came from different engines:
//   • "9h needed" is study-pace — remaining syllabus ÷ days left.
//   • The 30 minutes is routine-engine, sized by capacity-engine, which caps
//     the day at what the student actually sustains. With five or more logged
//     days and none above zero hours, capacity falls to 0.5h, and
//     `Math.max(30, hours * 60)` floors the plan at exactly 30 minutes.
//
// Nothing reconciled them, so the screen asserted "you're 1h ahead" to someone
// who had logged zero hours for six days, and handed him half an hour of work
// 37 days from his syllabus deadline. Two engines disagreeing in public is
// worse than either being wrong: it teaches the student that the numbers are
// decorative.
//
// This function is the single place that decides what the card says. When the
// plan is materially smaller than the pace requires, it says SO — plainly, with
// the reason — instead of printing both figures and leaving the student to
// notice the gap.
//
// Pure: every input is passed in, so each branch is testable without a
// database and reads identically every run.

export type PaceStatus = 'ahead' | 'on_pace' | 'behind' | 'unrealistic' | 'done';

export interface PaceHeadlineInput {
  status: PaceStatus;
  requiredPerDay: number;
  aheadPerDay: number;
  catchUpPerDay: number;
  committedPerDay: number | null;
  /** Today's plan size, from daily_routines.est_minutes. Null before one is generated. */
  plannedMinutes: number | null;
  /** Hours logged on each of the last 7 days — the same array the sparkline draws. */
  weekHours: number[];
}

export interface PaceHeadline {
  text: string;
  /** The honest explanation. Rendered under the headline; null when there is nothing to reconcile. */
  sub: string | null;
  /** True when the plan is capped below what the pace needs — the card should read as a warning. */
  capped: boolean;
}

/**
 * A plan is "materially smaller" at under half of what the pace needs.
 *
 * Not a strict inequality. The plan is rounded to half-hours and the pace to
 * the nearest 0.5, so 2.5h of plan against 3h of need is noise, not a
 * contradiction — flagging that would make the warning meaningless within a
 * week. Half is far outside rounding and always worth saying out loud.
 */
const CAPPED_RATIO = 0.5;

export function paceHeadline(i: PaceHeadlineInput): PaceHeadline {
  if (i.status === 'done') {
    return { text: 'Syllabus complete 🎉', sub: null, capped: false };
  }

  const plannedHours = i.plannedMinutes != null ? i.plannedMinutes / 60 : null;
  const capped =
    plannedHours != null &&
    i.requiredPerDay > 0 &&
    plannedHours < i.requiredPerDay * CAPPED_RATIO;

  if (capped && i.plannedMinutes != null) {
    // Lead with the requirement, then the plan — in that order, because the
    // requirement is the fact that matters and the small plan is the
    // consequence. Never claim "ahead" here: a capped plan means the student is
    // not keeping up, whatever the syllabus ring says.
    return {
      text: `${i.requiredPerDay}h needed · today's plan is ${i.plannedMinutes}m`,
      sub: reasonForCap(i.weekHours, i.plannedMinutes),
      capped: true,
    };
  }

  if (i.catchUpPerDay > 0) {
    return {
      text: `${i.committedPerDay ?? i.requiredPerDay}h + ${i.catchUpPerDay}h catch-up`,
      sub: null,
      capped: false,
    };
  }

  if (i.aheadPerDay > 0) {
    // "Ahead" is only credible if they have actually studied. Claiming it to
    // someone who logged nothing all week is the same broken promise in a
    // friendlier voice.
    if (totalLogged(i.weekHours) === 0) {
      return {
        text: `${i.requiredPerDay}h a day needed`,
        sub: 'Nothing logged in the last 7 days — the plan can’t tell how you’re doing.',
        capped: false,
      };
    }
    return { text: `${i.requiredPerDay}h needed · ${i.aheadPerDay}h ahead`, sub: null, capped: false };
  }

  return { text: `${i.requiredPerDay}h a day, steady`, sub: null, capped: false };
}

/**
 * Why the plan is small — said in the student's terms, never the system's.
 *
 * "Capacity engine capped your budget" means nothing to anyone. "You've logged
 * 0h across 6 days" is the same fact, checkable by the student against their own
 * memory, which is what makes it believable.
 */
function reasonForCap(weekHours: number[], plannedMinutes: number): string {
  const logged = totalLogged(weekHours);
  const activeDays = weekHours.filter((h) => h > 0).length;

  if (logged === 0) {
    return `You’ve logged 0h in the last 7 days, so the plan starts small on purpose. Do these ${plannedMinutes} minutes today and it grows back tomorrow.`;
  }
  return `You’ve averaged about ${round1(logged / Math.max(1, activeDays))}h on the days you studied, so the plan is sized to finish — not to impress. It grows as you do.`;
}

function totalLogged(weekHours: number[]): number {
  return weekHours.reduce((a, h) => a + (h > 0 ? h : 0), 0);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
