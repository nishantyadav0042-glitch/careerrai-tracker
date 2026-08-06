import { describe, it, expect } from 'vitest';
import {
  computeBreach, isAlertable, DRIFT_DAYS, BREACH_DAYS, CRITICAL_DAYS,
} from './plan-breach';

// A breach alert is the sharpest thing we say to a student. These tests pin
// that it fires on evidence, never on vibes — and that it never fires at
// someone who is actually doing the work.

const TODAY = new Date('2026-08-05T00:00:00Z');
const ago = (days: number) => new Date(Date.parse('2026-08-05T00:00:00Z') - days * 86_400_000)
  .toISOString().split('T')[0];

const base = {
  requiredPerDay: 4,
  observedPerDay: 4,
  daysToTarget: 40,
  today: TODAY,
  firstName: 'Harsh',
};

describe('a student doing the work is never accused', () => {
  it('logging today at the required pace is not a breach', () => {
    const r = computeBreach({ ...base, lastLogDate: ago(0) });
    expect(r.level).toBe('none');
    expect(isAlertable(r.level)).toBe(false);
    expect(r.studentLine).toContain('inside your plan');
  });

  it('yesterday still counts as inside the plan', () => {
    expect(computeBreach({ ...base, lastLogDate: ago(1) }).level).toBe('none');
  });

  it('exceeding the required pace is never a breach', () => {
    const r = computeBreach({ ...base, lastLogDate: ago(1), observedPerDay: 9 });
    expect(r.level).toBe('none');
    expect(r.debtHours).toBe(0);
  });
});

describe('silence escalates', () => {
  it(`${DRIFT_DAYS} days quiet = drifting, not yet a breach`, () => {
    const r = computeBreach({ ...base, lastLogDate: ago(DRIFT_DAYS) });
    expect(r.level).toBe('drifting');
    expect(isAlertable(r.level)).toBe(false);
    expect(r.studentLine).toMatch(/Not a breach yet/i);
  });

  it(`${BREACH_DAYS} days quiet = breach, and says the word`, () => {
    const r = computeBreach({ ...base, lastLogDate: ago(BREACH_DAYS) });
    expect(r.level).toBe('breach');
    expect(isAlertable(r.level)).toBe(true);
    expect(r.studentLine).toMatch(/breaching your study plan/i);
  });

  it(`${CRITICAL_DAYS} days quiet = critical, and tells the buddy to CALL`, () => {
    const r = computeBreach({ ...base, lastLogDate: ago(CRITICAL_DAYS) });
    expect(r.level).toBe('critical');
    expect(r.buddyLine).toMatch(/call/i);
    expect(r.targetAtRisk).toBe(true);
  });

  it('never having logged reads as fully silent', () => {
    expect(computeBreach({ ...base, lastLogDate: null }).level).toBe('critical');
  });
});

describe('the case a streak counter misses entirely', () => {
  // The reason this module exists. A student logging EVERY day at 2 hrs
  // against a date needing 9 has a perfect streak and is quietly failing.
  it('perfect consistency at half the required pace is still a breach', () => {
    // Requirement kept UNDER MAX_HUMAN_HOURS_PER_DAY on purpose. Above that
    // ceiling the honest answer is "the date is wrong", not "you are behind" —
    // covered separately below. This still pins the case the module exists
    // for: a reachable plan the student is quietly missing.
    const r = computeBreach({
      ...base, lastLogDate: ago(0), requiredPerDay: 6, observedPerDay: 2,
    });
    expect(r.daysSilent).toBe(0);          // logged today — streak intact
    expect(r.level).toBe('breach');        // and still in breach
    expect(r.planImpossible).toBe(false);
    expect(r.studentLine).toMatch(/slips away quietly/i);
  });

  it('slightly under pace is drifting, not breach — we do not cry wolf', () => {
    const r = computeBreach({
      ...base, lastLogDate: ago(0), requiredPerDay: 4, observedPerDay: 3,
    });
    expect(r.level).toBe('drifting');
  });
});

describe('the debt is real arithmetic, not a feeling', () => {
  it('prices silence at the pace the plan demanded', () => {
    const r = computeBreach({ ...base, lastLogDate: ago(6), requiredPerDay: 4 });
    // 6 days silent → 5 missed days × 4 hrs
    expect(r.debtHours).toBe(20);
    expect(r.debtDays).toBe(5); // at their own 4 hrs/day
  });

  it('flags the target at risk when the debt outgrows the runway', () => {
    const r = computeBreach({
      ...base, lastLogDate: ago(8), requiredPerDay: 6, observedPerDay: 2, daysToTarget: 5,
    });
    expect(r.targetAtRisk).toBe(true);
  });

  it('always shows its working', () => {
    const r = computeBreach({ ...base, lastLogDate: ago(7) });
    expect(r.receipts.length).toBeGreaterThan(1);
    expect(r.receipts.join(' ')).toMatch(/days since your last log/);
    expect(r.receipts.join(' ')).toMatch(/days left to your date/);
  });
});

describe('student and buddy get different words for the same fact', () => {
  it('student is addressed directly, buddy gets the name and an action', () => {
    const r = computeBreach({ ...base, lastLogDate: ago(BREACH_DAYS), firstName: 'Harsh' });
    expect(r.studentLine).toMatch(/^You /);
    expect(r.buddyLine).toContain('Harsh');
    expect(r.buddyLine).toMatch(/replan|call/i);
  });

  it('never shames — no "failed", "lazy", or exclamation marks', () => {
    for (const d of [0, DRIFT_DAYS, BREACH_DAYS, CRITICAL_DAYS]) {
      const r = computeBreach({ ...base, lastLogDate: ago(d) });
      expect(r.studentLine).not.toMatch(/lazy|failed|shame|disappoint|!/i);
    }
  });
});

// ── The 6 Aug fixes, pinned to the two live students that exposed them ──────

describe('the debt formula is no longer backwards', () => {
  // Abhishek's real card: 9-day streak, logged yesterday, 2.7 hrs/day against
  // a date needing 12. It billed him 65 hrs. A student silent for three days
  // was billed 24. Showing up every day produced the WORSE number, because
  // `silentDebt || paceShortfall * 7` stopped counting the shortfall the
  // moment anyone went quiet.
  it('logging yesterday never costs more than vanishing for three days', () => {
    const loyal = computeBreach({
      ...base, lastLogDate: ago(1), requiredPerDay: 6, observedPerDay: 2.7, daysOnPlan: 9,
    });
    const absent = computeBreach({
      ...base, lastLogDate: ago(3), requiredPerDay: 6, observedPerDay: 2.7, daysOnPlan: 9,
    });
    expect(loyal.debtHours).toBeLessThan(absent.debtHours);
  });

  it('counts BOTH the silence and the shortfall, not one or the other', () => {
    const r = computeBreach({
      ...base, lastLogDate: ago(3), requiredPerDay: 6, observedPerDay: 2, daysOnPlan: 7,
    });
    // 2 silent days x 6 = 12, plus 5 present days x 4 shortfall = 20 -> 32.
    // The old formula returned 12 and threw the shortfall away.
    expect(r.debtHours).toBe(32);
  });

  it('never bills a student for days before they joined', () => {
    // "65 hrs the plan expected and did not get" asserted a week that may
    // never have happened. Someone two days in cannot owe a week.
    const twoDaysIn = computeBreach({
      ...base, lastLogDate: ago(0), requiredPerDay: 6, observedPerDay: 1, daysOnPlan: 2,
    });
    const aWeekIn = computeBreach({
      ...base, lastLogDate: ago(0), requiredPerDay: 6, observedPerDay: 1, daysOnPlan: 7,
    });
    expect(twoDaysIn.debtHours).toBeLessThan(aWeekIn.debtHours);
    expect(twoDaysIn.debtHours).toBe(10); // 2 days x 5 hrs short
  });
});

describe('an impossible date blames the date, not the student', () => {
  // "Bhaiya 11 hr ka plan bnwayi hu aur sirf 4 hr ka task milta hai?" — a real
  // student, 6 Aug. Eleven hours is not a plan.
  const impossible = {
    ...base, lastLogDate: ago(1), requiredPerDay: 12, observedPerDay: 2.7, daysOnPlan: 9,
  };

  it('flags the plan, not a breach, while the student is still showing up', () => {
    const r = computeBreach(impossible);
    expect(r.planImpossible).toBe(true);
    expect(r.level).toBe('plan_impossible');
  });

  it('never accuses them of breaching', () => {
    const r = computeBreach(impossible);
    expect(r.studentLine).not.toMatch(/breach/i);
    expect(r.studentLine).toMatch(/the date is wrong, not you/i);
  });

  it('keeps the raw requirement visible for the buddy and the founder', () => {
    const r = computeBreach(impossible);
    expect(r.requiredPerDayRaw).toBe(12);
    expect(r.buddyLine).toMatch(/impossible/i);
    expect(r.buddyLine).toMatch(/don't push harder/i);
  });

  it('judges effort against what a human can do, not the fantasy number', () => {
    // 2.7 against 12 is 22% and would read as a catastrophic breach. Against
    // the 8-hour ceiling it is 34% — still short, but a real number.
    const r = computeBreach(impossible);
    expect(r.debtHours).toBeLessThan(65); // the number Abhishek was shown
  });

  it('still holds a genuinely silent student responsible', () => {
    // An impossible date is not an amnesty. Someone gone a week has their own
    // problem and the calendar must not excuse it.
    const r = computeBreach({ ...impossible, lastLogDate: ago(7) });
    expect(r.level).toBe('breach');
  });

  it('alerts — an unreachable date is the most urgent thing on the screen', () => {
    expect(isAlertable('plan_impossible')).toBe(true);
  });
});

describe('the card states its own conclusion', () => {
  it('says the date is unreachable instead of leaving two numbers side by side', () => {
    const r = computeBreach({
      ...base, lastLogDate: ago(6), requiredPerDay: 6, observedPerDay: 1,
      daysToTarget: 3, daysOnPlan: 7,
    });
    expect(r.targetAtRisk).toBe(true);
    expect(r.receipts.join(' ')).toMatch(/no longer reachable/i);
  });

  it('stays quiet when the date is still reachable', () => {
    const r = computeBreach({
      ...base, lastLogDate: ago(0), requiredPerDay: 3, observedPerDay: 3, daysToTarget: 60,
    });
    expect(r.receipts.join(' ')).not.toMatch(/no longer reachable/i);
  });
});
