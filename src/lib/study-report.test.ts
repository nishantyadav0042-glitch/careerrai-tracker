import { describe, it, expect } from 'vitest';
import {
  dailyBars, weeklyAverage, consistency, sectionSplit, concentrationLine,
  type StudyLogRow,
} from './study-report';

const row = (report_date: string, study_duration: number | null, topics_covered: string[] | null = null): StudyLogRow =>
  ({ report_date, study_duration, topics_covered });

// Every case below is anchored to real production shapes, because the report is
// only worth building if it is true. Two of the twelve students with 3+ logged
// days log 0.0 hours; one has 52 of 53 topics marked covered; logs name
// SECTIONS ('QA', 'DILR'), not topics. A report that renders those wrongly is
// worse than no report — it is a confident lie to the student who trusts us most.

describe('dailyBars — the gaps are the honest part', () => {
  it('zero-fills days with no log, oldest first', () => {
    const bars = dailyBars([row('2026-08-01', 3)], '2026-08-02', 3);
    expect(bars.map((b) => b.date)).toEqual(['2026-07-31', '2026-08-01', '2026-08-02']);
    expect(bars.map((b) => b.hours)).toEqual([0, 3, 0]);
  });

  it('distinguishes "logged 0 hours" from "never logged"', () => {
    // These are different problems. A student who shows up and records an
    // honest zero is not the same as one who vanished, and a chart that draws
    // them identically hides the only one we can act on.
    const bars = dailyBars([row('2026-08-02', 0)], '2026-08-02', 2);
    expect(bars[0]).toMatchObject({ hours: 0, logged: false }); // absent
    expect(bars[1]).toMatchObject({ hours: 0, logged: true });  // present, zero
  });

  it('treats a null duration as zero rather than dropping the day', () => {
    const bars = dailyBars([row('2026-08-02', null)], '2026-08-02', 1);
    expect(bars[0]).toMatchObject({ hours: 0, logged: true });
  });

  it('ignores rows outside the window', () => {
    const bars = dailyBars([row('2026-01-01', 9)], '2026-08-02', 3);
    expect(bars.every((b) => b.hours === 0)).toBe(true);
  });
});

describe('weeklyAverage — rolling, not calendar', () => {
  it('compares the last 7 days against the 7 before', () => {
    const rows = [row('2026-08-01', 4), row('2026-07-28', 2)];
    const w = weeklyAverage(rows, '2026-08-02');
    expect(w.thisWeek).toBe(6); // both within 7 days of 2 Aug
    expect(w.lastWeek).toBe(0);
  });

  it('splits at the 7-day boundary, not a Monday', () => {
    // 2026-07-25 is 8 days before 2026-08-02 → previous window.
    const w = weeklyAverage([row('2026-08-01', 3), row('2026-07-25', 5)], '2026-08-02');
    expect(w.thisWeek).toBe(3);
    expect(w.lastWeek).toBe(5);
    expect(w.direction).toBe('down');
  });

  it('reports "new" instead of a divide-by-zero percentage', () => {
    const w = weeklyAverage([row('2026-08-01', 4)], '2026-08-02');
    expect(w.deltaPct).toBeNull();
    expect(w.direction).toBe('new');
  });

  it('calls a small wobble flat, so the number stays believable', () => {
    // 10.0 → 10.3 is +3%: noise. Calling that "up" every week is how a metric
    // stops being read.
    const w = weeklyAverage([row('2026-08-01', 10.3), row('2026-07-26', 10)], '2026-08-02');
    expect(w.direction).toBe('flat');
  });

  it('is flat, not "new", when there is nothing at all', () => {
    expect(weeklyAverage([], '2026-08-02').direction).toBe('flat');
  });
});

describe('consistency — anchored to the first log, not signup', () => {
  it('counts logged days against days since the first log', () => {
    const c = consistency([row('2026-08-01', 1), row('2026-07-31', 1)], '2026-08-02');
    expect(c).toEqual({ daysLogged: 2, daysElapsed: 3, pct: 67 });
  });

  it('does not punish a student for lurking before they started', () => {
    // Signed up weeks earlier; the denominator starts when they did.
    const c = consistency([row('2026-08-02', 1)], '2026-08-02');
    expect(c).toEqual({ daysLogged: 1, daysElapsed: 1, pct: 100 });
  });

  it('is zero, not NaN, with no logs', () => {
    expect(consistency([], '2026-08-02')).toEqual({ daysLogged: 0, daysElapsed: 0, pct: 0 });
  });
});

describe('sectionSplit — the number nobody can compute in their head', () => {
  it('reproduces the real finding: 14 of 18 days on one section', () => {
    const rows = [
      ...Array.from({ length: 14 }, (_, i) => row(`2026-07-${String(i + 1).padStart(2, '0')}`, 2, ['DILR'])),
      ...Array.from({ length: 4 }, (_, i) => row(`2026-07-${String(i + 15).padStart(2, '0')}`, 2, ['QA'])),
    ];
    const split = sectionSplit(rows);
    expect(split[0]).toMatchObject({ label: 'DILR', days: 14 });
    expect(split[1]).toMatchObject({ label: 'QA', days: 4 });
  });

  it('splits a multi-section day evenly rather than inventing a weighting', () => {
    // We do not know how a 2-hour "QA, VARC" day was actually divided.
    // Guessing would be a number dressed up as a measurement.
    const split = sectionSplit([row('2026-08-01', 2, ['QA', 'VARC'])]);
    expect(split.map((s) => s.hours).sort()).toEqual([1, 1]);
  });

  it('still ranks by days when every logged hour is zero', () => {
    // Two of twelve real students log 0.0 hours. Percentages would all be 0;
    // the day counts still carry the truth.
    const split = sectionSplit([
      row('2026-08-01', 0, ['VARC']),
      row('2026-07-31', 0, ['VARC']),
      row('2026-07-30', 0, ['QA']),
    ]);
    expect(split[0]).toMatchObject({ label: 'VARC', days: 2, pct: 0 });
  });

  it('ignores days that name nothing', () => {
    expect(sectionSplit([row('2026-08-01', 3, null), row('2026-07-31', 1, [])])).toEqual([]);
  });
});

describe('concentrationLine — silent unless it has something to say', () => {
  it('fires when one section dominates', () => {
    const split = [
      { label: 'DILR', hours: 28, pct: 78, days: 14 },
      { label: 'QA', hours: 8, pct: 22, days: 4 },
    ];
    expect(concentrationLine(split, 18)).toBe(
      '14 of your 18 logged days were DILR. Everything else got 4.',
    );
  });

  it('stays silent on a balanced split', () => {
    const split = [
      { label: 'QA', hours: 10, pct: 50, days: 5 },
      { label: 'VARC', hours: 10, pct: 50, days: 5 },
    ];
    expect(concentrationLine(split, 10)).toBeNull();
  });

  it('stays silent on a thin sample — 3 days is not a pattern', () => {
    const split = [
      { label: 'QA', hours: 6, pct: 100, days: 3 },
      { label: 'VARC', hours: 0, pct: 0, days: 0 },
    ];
    expect(concentrationLine(split, 3)).toBeNull();
  });

  it('stays silent when only one section was ever logged', () => {
    expect(concentrationLine([{ label: 'QA', hours: 20, pct: 100, days: 10 }], 10)).toBeNull();
  });
});
