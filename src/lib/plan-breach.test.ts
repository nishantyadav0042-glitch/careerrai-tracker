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
    const r = computeBreach({
      ...base, lastLogDate: ago(0), requiredPerDay: 9, observedPerDay: 2,
    });
    expect(r.daysSilent).toBe(0);          // logged today — streak intact
    expect(r.level).toBe('breach');        // and still in breach
    expect(r.studentLine).toMatch(/slipping away quietly/i);
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
