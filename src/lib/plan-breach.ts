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

export type BreachLevel = 'none' | 'drifting' | 'breach' | 'critical';

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
  const { requiredPerDay, observedPerDay, daysToTarget, today } = input;
  const who = input.firstName ?? 'This student';
  const daysSilent = fullDaysSince(input.lastLogDate, today);

  // Debt = what the plan expected during the silence but never got. Silence is
  // priced at the FULL required pace; under-study is priced at the shortfall.
  const silentDebt = Math.max(0, daysSilent - 1) * requiredPerDay;
  const paceShortfall = observedPerDay != null ? Math.max(0, requiredPerDay - observedPerDay) : 0;
  const debtHours = Math.round(silentDebt || paceShortfall * 7); // a week of drift
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

  const receipts: string[] = [];
  if (daysSilent > 0) receipts.push(`${daysSilent} day${daysSilent === 1 ? '' : 's'} since your last log`);
  if (observedPerDay != null) {
    receipts.push(`Your plan needs ${requiredPerDay} hrs/day — you are averaging ${HALF(observedPerDay)}`);
  }
  if (debtHours > 0) {
    receipts.push(`That is ${debtHours} hrs the plan expected and did not get${debtDays > 0 ? ` — ${debtDays} days of your own pace to clear` : ''}`);
  }
  receipts.push(`${daysToTarget} days left to your date`);

  let studentLine: string;
  let buddyLine: string;
  switch (level) {
    case 'critical':
      studentLine = `You are breaching your study plan. ${daysSilent} days with nothing logged — your plan has stopped describing your preparation. Let's fix the plan, not pretend.`;
      buddyLine = `${who} — ${daysSilent} days silent, ${debtHours} hrs behind. Call, don't message.`;
      break;
    case 'breach':
      studentLine = daysSilent >= BREACH_DAYS
        ? `You are breaching your study plan — ${daysSilent} days without a log, and ${debtHours} hrs behind what you committed to.`
        : `You are breaching your study plan: it needs ${requiredPerDay} hrs/day and you are averaging ${HALF(observedPerDay ?? 0)}. The date you picked is slipping away quietly.`;
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
    studentLine, buddyLine, receipts,
  };
}

/** Breach levels that should raise a red alert on the student's home. */
export function isAlertable(level: BreachLevel): boolean {
  return level === 'breach' || level === 'critical';
}
