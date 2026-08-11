// ── Is this plan actually going to finish the syllabus? ─────────────────────
//
// Abhishek, 11 Aug, to his mentor:
//   "Bhaiya ye baar baar same hi percentage kyu revise krwata hai… sirf aur
//    sirf revise, new chapter to start hi nhi hote."
//   "Aisa na ho ki syllabus wala date tk syllabus hi complete na ho, darr
//    lagti hai 🥲"
//
// He was right, and the numbers were worse than he thought. In 18 days his
// plan scheduled 13 DISTINCT topics out of 53. Percentages appeared 7 times.
// Reading Comprehension 9 times. Twenty-three QA topics had never been
// scheduled once — and his syllabus date was 25 days away.
//
// The cause was a missing idea, not a broken rule. The selector could rank
// topics against each other, but nothing in the product ever asked the only
// question that matters to a student with a deadline: AT THIS RATE, DO WE
// FINISH? Revision could earn up to +30 points while "never started" was worth
// +22, so any topic already touched permanently outranked any topic never seen
// — and practising it reset its clock, so it came back around days later. A
// closed loop of five topics, arithmetically incapable of covering a syllabus.
//
// This module supplies the missing question. It is pure arithmetic on two
// numbers the student already gave us — how much is left, and how long until
// the date they chose — and it produces the pressure that lets untouched
// topics outrank comfortable revision when, and only when, the calendar says
// they must.

/** Below this, a plan is comfortably ahead and revision should lead. */
export const PACE_RELAXED = 0.5;

export interface SyllabusPaceInput {
  /** Topics the student has never started (coverage 'not_started' or unmapped). */
  untouchedTopics: number;
  /** Calendar days until their chosen syllabus-finish date. Past due ⇒ ≤ 0. */
  daysToTarget: number;
  /**
   * New topics the plan can realistically open per day. The daily card carries
   * one task per section, so a normal day can introduce at most 3 — but only
   * one of those slots should ever be spent on novelty for a student who is on
   * pace, which is what makes 1 the honest default.
   */
  newTopicsPerDay?: number;
}

export interface SyllabusPace {
  /** New topics per day needed to finish on time. */
  requiredPerDay: number;
  /**
   * 0 → comfortably on pace, revision can lead.
   * 1 → cannot finish without opening new topics today.
   * Clamped, so a hopeless backlog does not produce an infinite bonus.
   */
  pressure: number;
  /** True when the date cannot be met at the honest maximum rate. */
  behind: boolean;
  /** Plain sentence for the student/mentor. Never a number without meaning. */
  summary: string;
}

/**
 * How hard the plan must push new topics today.
 *
 * Deliberately NOT a cliff. A student two weeks ahead of schedule should still
 * revise; a student one week behind should see new topics lead but not have
 * revision stripped out. Pressure ramps smoothly so the plan changes character
 * gradually, the way a good teacher's would.
 */
export function syllabusPace(input: SyllabusPaceInput): SyllabusPace {
  const perDayCeiling = Math.max(1, input.newTopicsPerDay ?? 1);
  const untouched = Math.max(0, input.untouchedTopics);

  if (untouched === 0) {
    return {
      requiredPerDay: 0,
      pressure: 0,
      behind: false,
      summary: 'Every topic has been started — the plan is revision and depth from here.',
    };
  }

  // Past the date, or on it: nothing left to pace against. Maximum urgency.
  if (input.daysToTarget <= 0) {
    return {
      requiredPerDay: untouched,
      pressure: 1,
      behind: true,
      summary: `${untouched} topic${untouched === 1 ? '' : 's'} still unopened and the finish date has passed.`,
    };
  }

  const requiredPerDay = untouched / input.daysToTarget;

  // Pressure is "how much of the honest daily capacity this demands".
  // requiredPerDay ≥ capacity ⇒ 1. Below PACE_RELAXED of capacity ⇒ 0.
  const demand = requiredPerDay / perDayCeiling;
  const pressure = demand >= 1 ? 1 : Math.max(0, (demand - PACE_RELAXED) / (1 - PACE_RELAXED));

  const behind = demand > 1;
  const rounded = Math.round(requiredPerDay * 10) / 10;
  const summary = behind
    ? `${untouched} topics unopened, ${input.daysToTarget} days left — that needs ${rounded} new topics a day, more than a day can hold.`
    : `${untouched} topics unopened, ${input.daysToTarget} days left — about ${rounded} new topics a day keeps the date.`;

  return { requiredPerDay, pressure, behind, summary };
}

/**
 * The points an untouched topic earns from the calendar alone.
 *
 * Sized from the real gap, not picked round. A stale practising topic scores
 * coverage 12 + up to 30 revision = 42; an untouched one scores 22. So +28 is
 * what it takes to flip that at full pressure — enough to break the loop, and
 * deliberately NOT enough to outrank the things a student asked for
 * themselves (priority +25 and focus +22 stack on top of their own coverage
 * score; postpone +50 and today's class +45 outrank it outright).
 *
 * The first draft used 45. It broke the rule that a student's own choice wins:
 * a never-started topic beat their starred priority pick. Caught by test.
 */
export const MAX_NEW_TOPIC_URGENCY = 28;

export function newTopicUrgencyPoints(pressure: number): number {
  return Math.round(Math.min(1, Math.max(0, pressure)) * MAX_NEW_TOPIC_URGENCY);
}

/**
 * How much of the revision bonus survives at a given pressure.
 *
 * The other half of the fix, and the half that actually freed Abhishek.
 * Boosting new topics alone was not enough: five of his topics were 17 days
 * past their cadence, each earning the full +30, which still beat every
 * untouched topic. Pushing novelty harder would have papered over that by
 * inflating one number until it won.
 *
 * The honest statement is the reverse — REVISION IS WHAT YOU DO WHEN YOU HAVE
 * SLACK. A student on pace should revise thoroughly. A student who cannot
 * finish the syllabus cannot afford to spend today re-solving something they
 * did a fortnight ago, however overdue it is. So revision keeps its full pull
 * at pressure 0 and drops to 40% of it at pressure 1 — quieter, never silent,
 * because letting a topic rot entirely is its own kind of failure.
 */
export const MIN_REVISION_WEIGHT = 0.4;

export function revisionWeight(pressure = 0): number {
  const p = Math.min(1, Math.max(0, pressure));
  return 1 - (1 - MIN_REVISION_WEIGHT) * p;
}

/**
 * How hard to push a topic DOWN because the plan just showed it.
 *
 * Percentages was scheduled seven times in twelve days. Nothing in the score
 * knew a topic had recently been ON THE PLAN — only when it was last
 * *practised*, which a student who skips the task never updates. So a topic
 * could be served, ignored, and served again indefinitely.
 *
 * The cool-down GROWS with syllabus pressure, and that is the point: a student
 * comfortably ahead can revisit a topic after three days, but a student with 23
 * unopened topics and 25 days cannot afford to see the same one twice in a
 * week. Repetition is a luxury of being on schedule.
 *
 * A cool-down, never a ban — a genuinely overdue high-weightage topic still
 * returns, just not tomorrow.
 */
export const REPEAT_COOLDOWN_DAYS = 3;
export const REPEAT_COOLDOWN_MAX_DAYS = 6;

export function repeatCooldownDays(pressure = 0): number {
  const p = Math.min(1, Math.max(0, pressure));
  return REPEAT_COOLDOWN_DAYS + Math.round(p * (REPEAT_COOLDOWN_MAX_DAYS - REPEAT_COOLDOWN_DAYS));
}

export function repeatPenaltyPoints(daysSincePlanned: number | null, pressure = 0): number {
  if (daysSincePlanned == null) return 0;          // never planned — no penalty
  const cooldown = repeatCooldownDays(pressure);
  if (daysSincePlanned >= cooldown) return 0;
  return -Math.round((1 - daysSincePlanned / cooldown) * 40);
}
