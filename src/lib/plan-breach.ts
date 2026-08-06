// ── Plan Breach ─────────────────────────────────────────────────────────────
//
// Founder, 5 Aug: "if student doesn't follow the rules or logs, send a red
// alert — tell them they are breaching their study plan."
//
// The word matters. A streak is a game; a BREACH is a broken agreement. The
// student set this date themselves ("you own the deadline"), so falling off it
// isn't us scolding them — it's us holding up the thing they committed to.
// That is the elder sibling's actual job.
//
// Two ways to breach, because they fail differently:
//   SILENCE — days with no log at all. We cannot see the preparation.
//   DEFICIT — logging, but far under the pace their own date demands.
// A student can be perfectly consistent and still breaching (2 hrs/day against
// a date needing 9), which the streak counter would happily call a win. This
// is the honest counter.
//
// Every level carries the arithmetic and a plain sentence, because the same
// object is read by three audiences: the student (red banner), the buddy
// (attention queue) and the founder (admin). One computation, one truth —
// the Incident #5/#17 rule.

import { REPLAN_DEBT_UNRECOVERABLE_DAYS } from './plan-breach-constants';

export type BreachLevel = 'none' | 'drifting' | 'breach' | 'critical' | 'plan_impossible';

/**
 * The most hours/day we will ever call a student's own commitment.
 *
 * Two live students on 6 Aug proved this needs a ceiling. One was told he was
 * "breaching" a plan needing 12 hrs/day while keeping a 9-day streak at 2.7.
 * Another asked, in her own words: "Bhaiya 11 hr ka plan bnwayi hu aur sirf
 * 4 hr ka task milta hai?" — she set 11 hours and the planner could only fill
 * four, because eleven hours of genuine study is not a thing.
 *
 * Above this line the number is not a target, it is arithmetic left over from
 * a date that no longer fits. Saying "you need 12 hrs/day" is not honesty; it
 * is a demand nobody can meet, and it makes every downstream sentence a lie.
 *
 * Set at 8, not lower, on purpose: a full-time dropper genuinely does 8 hours
 * and calling their plan impossible would be its own insult. Beyond 8, every
 * day, for months, alongside anything else — that is where it stops being a
 * plan and starts being arithmetic.
 */
export const MAX_HUMAN_HOURS_PER_DAY = 8;

export interface BreachResult {
  level: BreachLevel;
  /** Full days since the last log. 0 = logged today. */
  daysSilent: number;
  /** Hours the plan expected by now that were never studied. */
  debtHours: number;
  /** Days of THEIR OWN pace it would take to clear that debt. */
  debtDays: number;
  /** True once the debt can no longer be absorbed before the target date. */
  targetAtRisk: boolean;
  /**
   * What the date honestly demands, before any cap. Kept separate from the
   * number shown to students so the founder and buddy can still see the raw
   * arithmetic.
   */
  requiredPerDayRaw: number;
  /** True when the date demands more hours than anyone can actually study. */
  planImpossible: boolean;
  /** One line for the student — second person, honest, never shaming. */
  studentLine: string;
  /** One line for the buddy — third person, actionable. */
  buddyLine: string;
  /** The arithmetic behind the numbers above. */
  receipts: string[];
}

export interface BreachInput {
  /** ISO yyyy-mm-dd of the most recent log, or null if never. */
  lastLogDate: string | null;
  /** Hours/day the student's own target date demands. */
  requiredPerDay: number;
  /** Hours/day they actually average (recent window). Null = no logs yet. */
  observedPerDay: number | null;
  /** Days until their target date. */
  daysToTarget: number;
  /**
   * How many days this student has actually been on the plan. The debt window
   * is capped by it, so we never bill someone for days before they joined.
   */
  daysOnPlan?: number | null;
  today: Date;
  /** First name, for the buddy line. */
  firstName?: string;
}

/** Silence thresholds, in full days with no log. */
export const DRIFT_DAYS = 3;
export const BREACH_DAYS = 5;
export const CRITICAL_DAYS = 10;
/** Fraction of the required pace below which effort itself is a breach. */
export const DRIFT_PACE_RATIO = 0.8;
export const BREACH_PACE_RATIO = 0.5;

const DAY_MS = 86_400_000;
const HALF = (n: number) => Math.round(n * 2) / 2;

function fullDaysSince(lastLogDate: string | null, today: Date): number {
  if (!lastLogDate) return CRITICAL_DAYS; // never logged reads as fully silent
  const last = Date.parse(lastLogDate + 'T00:00:00Z');
  const now = Date.parse(today.toISOString().split('T')[0] + 'T00:00:00Z');
  return Math.max(0, Math.round((now - last) / DAY_MS));
}

export function computeBreach(input: BreachInput): BreachResult {
  const { observedPerDay, daysToTarget, today } = input;
  const requiredPerDayRaw = input.requiredPerDay;
  const who = input.firstName ?? 'This student';
  const daysSilent = fullDaysSince(input.lastLogDate, today);

  // A date can demand more hours than exist in a student's day. Past the
  // ceiling the number stops being a plan and becomes leftover arithmetic, so
  // we judge effort against what a person can actually do and flag the DATE as
  // the thing that broke.
  const planImpossible = requiredPerDayRaw > MAX_HUMAN_HOURS_PER_DAY;
  const requiredPerDay = Math.min(requiredPerDayRaw, MAX_HUMAN_HOURS_PER_DAY);

  // Debt = hours the plan expected and did not get.
  //
  // The old formula was `silentDebt || paceShortfall * 7`, and it was exactly
  // backwards. `||` meant that as soon as someone went silent, the shortfall
  // stopped counting — so a student who logged YESTERDAY was billed 65 hrs
  // while one who vanished for three days was billed 24. The student showing
  // up every day got the worse number.
  //
  // Both now count, over a window bounded by how long they have actually been
  // on the plan. The old hardcoded 7 asserted "a week of drift" for someone
  // who might have joined two days ago — an invented fact, which this repo
  // does not allow.
  const DEBT_WINDOW_DAYS = 7;
  const observedDays = Math.max(1, Math.min(DEBT_WINDOW_DAYS, input.daysOnPlan ?? DEBT_WINDOW_DAYS));
  const silentDays = Math.max(0, daysSilent - 1);
  // Days they were present in the window — silence is already priced separately,
  // so it must not be charged twice.
  const presentDays = Math.max(0, observedDays - silentDays);
  const paceShortfall = observedPerDay != null ? Math.max(0, requiredPerDay - observedPerDay) : 0;
  const debtHours = Math.round(silentDays * requiredPerDay + paceShortfall * presentDays);
  const clearRate = observedPerDay && observedPerDay > 0 ? observedPerDay : requiredPerDay;
  const debtDays = clearRate > 0 ? Math.ceil(debtHours / clearRate) : 0;

  // The target is at risk once clearing the debt eats more of the remaining
  // window than is left, or the student has been silent past recovery.
  const targetAtRisk = debtDays >= daysToTarget || daysSilent >= REPLAN_DEBT_UNRECOVERABLE_DAYS;

  const paceRatio = observedPerDay != null && requiredPerDay > 0
    ? observedPerDay / requiredPerDay : 1;

  let level: BreachLevel = 'none';
  if (daysSilent >= CRITICAL_DAYS) level = 'critical';
  else if (daysSilent >= BREACH_DAYS || paceRatio < BREACH_PACE_RATIO) level = 'breach';
  else if (daysSilent >= DRIFT_DAYS || paceRatio < DRIFT_PACE_RATIO) level = 'drifting';

  // An impossible date outranks any judgement of effort — but only while the
  // student is actually showing up. Someone silent for a week has a real
  // problem of their own, and blaming the calendar would let them off it.
  if (planImpossible && daysSilent < BREACH_DAYS) level = 'plan_impossible';

  const receipts: string[] = [];
  if (daysSilent > 0) receipts.push(`${daysSilent} day${daysSilent === 1 ? '' : 's'} since your last log`);
  if (planImpossible) {
    receipts.push(`Your date needs ${HALF(requiredPerDayRaw)} hrs/day — nobody studies that, so this is the date's problem, not yours`);
    if (observedPerDay != null) receipts.push(`You are averaging ${HALF(observedPerDay)} hrs/day`);
  } else if (observedPerDay != null) {
    receipts.push(`Your plan needs ${requiredPerDay} hrs/day — you are averaging ${HALF(observedPerDay)}`);
  }
  if (debtHours > 0) {
    receipts.push(`That is ${debtHours} hrs the plan expected and did not get${debtDays > 0 ? ` — ${debtDays} days of your own pace to clear` : ''}`);
  }
  receipts.push(`${daysToTarget} days left to your date`);
  // The card used to print debtDays and daysToTarget side by side and never
  // say what they add up to. If clearing the debt takes longer than the time
  // left, the date is already gone — say it.
  if (targetAtRisk && level !== 'none') {
    receipts.push('At your current pace this date is no longer reachable — moving it is the honest fix');
  }

  let studentLine: string;
  let buddyLine: string;
  switch (level) {
    case 'plan_impossible':
      // Never "you are breaching". This student is showing up; the DATE is
      // what broke. Leading with an accusation here punishes the exact
      // behaviour we spend everything else trying to produce, and it is also
      // simply untrue.
      studentLine = `Your date now needs ${HALF(requiredPerDayRaw)} hrs/day. That is not a realistic day for anyone — the date is wrong, not you. You are putting in ${HALF(observedPerDay ?? 0)} hrs/day; let's move the date to match that.`;
      buddyLine = `${who}'s date demands ${HALF(requiredPerDayRaw)} hrs/day — impossible. They are doing ${HALF(observedPerDay ?? 0)} and still logging. Replan the date, don't push harder.`;
      break;
    case 'critical':
      studentLine = `You are breaching your study plan. ${daysSilent} days with nothing logged — your plan has stopped describing your preparation. Let's fix the plan, not pretend.`;
      buddyLine = `${who} — ${daysSilent} days silent, ${debtHours} hrs behind. Call, don't message.`;
      break;
    case 'breach':
      studentLine = daysSilent >= BREACH_DAYS
        ? `You are breaching your study plan — ${daysSilent} days without a log, and ${debtHours} hrs behind what you committed to.`
        : `You are under the plan you set: it needs ${requiredPerDay} hrs/day and you are averaging ${HALF(observedPerDay ?? 0)}. At this pace the date you picked slips away quietly — worth fixing now, while it is still cheap.`;
      buddyLine = `${who} is in breach — ${debtHours} hrs behind${daysSilent >= BREACH_DAYS ? `, ${daysSilent} days silent` : ` at ${HALF(observedPerDay ?? 0)} hrs/day`}. Worth a replan.`;
      break;
    case 'drifting':
      studentLine = daysSilent >= DRIFT_DAYS
        ? `${daysSilent} days without a log. Not a breach yet — log today and it stays that way.`
        : `You are running under your own plan: ${requiredPerDay} hrs/day needed, ${HALF(observedPerDay ?? 0)} logged. Still recoverable.`;
      buddyLine = `${who} is drifting — ${daysSilent >= DRIFT_DAYS ? `${daysSilent} days quiet` : `${HALF(observedPerDay ?? 0)} vs ${requiredPerDay} hrs/day`}. A nudge is probably enough.`;
      break;
    default:
      studentLine = 'You are inside your plan.';
      buddyLine = `${who} is on plan.`;
  }

  return {
    level, daysSilent, debtHours, debtDays, targetAtRisk,
    requiredPerDayRaw, planImpossible,
    studentLine, buddyLine, receipts,
  };
}

/** Breach levels that should raise a red alert on the student's home. */
export function isAlertable(level: BreachLevel): boolean {
  // 'plan_impossible' alerts too: it is the most urgent thing on the screen —
  // the student is working hard against a date that cannot be met, and every
  // day they spend not knowing that is a day wasted.
  return level === 'breach' || level === 'critical' || level === 'plan_impossible';
}
