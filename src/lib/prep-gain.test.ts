import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  computePrepGain,
  MIN_DAYS_FOR_GAIN,
  MIN_GAIN_PER_DAY,
  BASELINE_DAYS,
  RECENT_DAYS,
} from './prep-gain';

// This number goes on the home screen of every student, every day, under a
// sentence that says CareerRai put hours into their prep. It has to be
// impossible to inflate. The tests below are mostly about the ways a gain
// could be claimed when none was earned.

const TODAY = '2026-08-13';
const DAY = 86_400_000;
const ago = (n: number) => new Date(new Date(`${TODAY}T00:00:00Z`).getTime() - n * DAY).toISOString().split('T')[0];

/** `hours[0]` is the oldest day, one row per calendar day. */
function run(hours: number[]) {
  const logs = hours.map((h, i) => ({ report_date: ago(hours.length - 1 - i), study_duration: h }));
  return computePrepGain(logs, TODAY);
}

describe('nothing logged, nothing claimed', () => {
  it('an empty history has no line at all', () => {
    expect(computePrepGain([], TODAY)).toEqual({ kind: 'none' });
  });

  it('days on record with zero hours are still no hours', () => {
    expect(run([0, 0, 0])).toEqual({ kind: 'none' });
  });
});

describe('below the density gate we bank, we do not claim', () => {
  it('a day-one student gets their hours and no trend', () => {
    expect(run([8])).toEqual({ kind: 'banked', banked: 8, daysLogged: 1 });
  });

  it('the gate holds right up to the boundary', () => {
    const justUnder = run(Array.from({ length: MIN_DAYS_FOR_GAIN - 1 }, (_, i) => (i < 3 ? 1 : 6)));
    expect(justUnder.kind).toBe('banked');
  });

  it('and opens on it', () => {
    const atGate = run(Array.from({ length: MIN_DAYS_FOR_GAIN }, (_, i) => (i < 3 ? 1 : 6)));
    expect(atGate.kind).toBe('gain');
  });

  it('the windows never overlap at the gate', () => {
    // If they did, "then" and "now" would partly be the same days and the
    // comparison would be measuring a stretch of time against itself.
    expect(BASELINE_DAYS + RECENT_DAYS).toBeLessThan(MIN_DAYS_FOR_GAIN);
  });
});

describe('a real improvement is reported, and only its measured size', () => {
  it('1h a day for the first three days, 4h a day since', () => {
    const g = run([1, 1, 1, ...Array(17).fill(4)]);
    expect(g.kind).toBe('gain');
    if (g.kind !== 'gain') return;
    // Baseline 1h/day, last seven days 4h/day.
    expect(g.perDay).toBe(3);
    // 17 days at 4h = 68h logged; the arrival rate would have produced 17h.
    expect(g.extraHours).toBe(51);
    expect(g.banked).toBe(71);
  });

  it('never projects today\'s rate backwards over weeks that did not go that way', () => {
    // Two weeks of nothing, then a strong final week. The rate genuinely
    // improved, but only seven days of it actually happened — a projection
    // would bill all 17 days at the new rate.
    const g = run([2, 2, 2, ...Array(10).fill(0), ...Array(7).fill(5)]);
    expect(g.kind).toBe('gain');
    if (g.kind !== 'gain') return;
    expect(g.extraHours).toBe(35 - 2 * 17);
    expect(g.extraHours).toBeLessThan(35);
  });
});

describe('the ways a gain could be faked', () => {
  it('a skipped day counts as zero, not as absent', () => {
    // Logged days only: 3h then one 9h day = a "3x improvement". Calendar
    // days: 9h across a whole week is 1.3h/day, which is a decline.
    const g = run([3, 3, 3, ...Array(10).fill(0), 0, 0, 0, 0, 0, 0, 9]);
    expect(g.kind).toBe('banked');
  });

  it('a flat student is never told they improved', () => {
    expect(run(Array(20).fill(4)).kind).toBe('banked');
  });

  it('a student who slowed down is never told they improved', () => {
    expect(run([6, 6, 6, ...Array(17).fill(1)]).kind).toBe('banked');
  });

  it('drift under the threshold is not a headline', () => {
    // +0.3h/day — inside the noise of rounding a day's hours.
    const g = run([3, 3, 3, ...Array(17).fill(3.3)]);
    expect(g.kind).toBe('banked');
    expect(MIN_GAIN_PER_DAY).toBeGreaterThan(0.3);
  });

  it('a positive rate with no cumulative hours behind it is not a headline', () => {
    // Improved only in the last few days, after a long empty stretch: the
    // rate is up but the measured extra is still negative.
    const g = run([4, 4, 4, ...Array(20).fill(0), 5, 5, 5, 5, 5, 5, 5]);
    if (g.kind === 'gain') expect(g.extraHours).toBeGreaterThan(0);
  });
});

describe('robustness against the shape the database actually returns', () => {
  it('accepts newest-first order, which is how the page queries it', () => {
    const asc = run([1, 1, 1, ...Array(17).fill(4)]);
    const logs = Array.from({ length: 20 }, (_, i) => ({
      report_date: ago(i),
      study_duration: i >= 17 ? 1 : 4,
    }));
    expect(computePrepGain(logs, TODAY)).toEqual(asc);
  });

  it('accepts numeric strings and nulls without producing NaN', () => {
    const logs = [
      { report_date: ago(1), study_duration: '4.5' },
      { report_date: ago(2), study_duration: null },
    ];
    const g = computePrepGain(logs, TODAY);
    expect(g.kind).toBe('banked');
    if (g.kind === 'banked') expect(g.banked).toBe(5);
  });

  it('ignores rows dated in the future rather than banking them', () => {
    const logs = [{ report_date: '2027-01-01', study_duration: 99 }, { report_date: TODAY, study_duration: 2 }];
    const g = computePrepGain(logs, TODAY);
    expect(g.kind === 'banked' && g.banked).toBe(2);
  });
});

describe('the card stops saying the same number twice', () => {
  // Founder, 13 Aug: "why repeating 8 hours again and again". The card showed
  // "8h today" in the streak row and "8h a day — you're ahead" as the
  // headline, with "Date is safe" in the chip between them.
  const src = () => readFileSync('src/components/home/pace-card.tsx', 'utf8');

  it('the streak row no longer prints today\'s hours', () => {
    expect(src()).not.toContain('todayHours');
  });

  it('the headline no longer restates the committed hours', () => {
    const code = src().replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('${mine}h a day');
  });

  it('the date verdict is still said — once, by the chip', () => {
    expect(src()).toContain('{tone.label}');
  });

  it('the headline still yields to the two instructions that outrank it', () => {
    // A finished syllabus, and an account whose plan cannot be sized until it
    // sets its hours. Neither is decoration.
    const s = src();
    expect(s).toContain('Syllabus complete 🎉');
    expect(s).toContain('Set your daily hours to size your plan');
  });

  it('"Free" is only ever shown to students on the free plan', () => {
    expect(src()).toMatch(/!isPremium \?[\s\S]{0,200}Free/);
  });
});
