/**
 * ── A count that is still being written must say so ────────────────────────
 *
 * Founder, 16 Sep 2026 at 09:36 IST: "why these daily logs decreased so
 * significantly suddenly?" LOGGED YESTERDAY read 12 against 30 the day before.
 * Nothing had decreased — 78% of a day's logs are written the NEXT day, mostly
 * after 10:00 IST, so a morning reading of "yesterday" is roughly a fifth of
 * the eventual number, sitting next to a finished one.
 *
 * The same shape as Incident #86 one layer out: the right number, read at the
 * wrong moment. These cases pin the arithmetic that stops it misleading.
 */
import { describe, it, expect } from 'vitest';
import { computeLogMaturity, SETTLE_DAYS, type LogRow } from './log-maturity';

const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`).toISOString();
const NOW = Date.parse('2026-09-16T09:36:00+05:30');

/** A day that ends at `final`, with `sameDay` of them written on the day. */
function day(reportDate: string, sameDay: number, nextDay: number): LogRow[] {
  const nextDayStr = new Date(Date.parse(`${reportDate}T00:00:00+05:30`) + 86_400_000)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return [
    ...Array.from({ length: sameDay }, () => ({ reportDate, createdAt: at(reportDate, '21:00') })),
    // The backfill lands in the EVENING of the next day, which is what the
    // production hour histogram shows (peak 19:00-21:00).
    ...Array.from({ length: nextDay }, () => ({ reportDate, createdAt: at(nextDayStr, '20:00') })),
  ];
}

// The real shape, from production: same-day 7-11, backfilled +11 to +18.
const HISTORY: LogRow[] = [
  ...day('2026-09-10', 7, 12),
  ...day('2026-09-11', 9, 12),
  ...day('2026-09-12', 8, 15),
  ...day('2026-09-13', 9, 14),
  ...day('2026-09-14', 11, 19),
];

describe('the tile can say how finished it is', () => {
  it('knows the last day whose count will not move again', () => {
    const m = computeLogMaturity(HISTORY, NOW);
    expect(SETTLE_DAYS).toBe(2);
    expect(m.settledDay, 'yesterday is still filling, so it is not settled').toBe('2026-09-14');
    expect(m.settledCount).toBe(30);
  });

  it('gives the figure a reader should compare against', () => {
    // Without this the founder compares an unfinished number to a finished one,
    // which is exactly what happened.
    const m = computeLogMaturity(HISTORY, NOW);
    expect(m.settledMedian).toBe(23);
  });

  it('measures how complete YESTERDAY typically is at this hour', () => {
    // 09:36 is before the evening backfill, so on every historical day only
    // the same-day rows existed at this point: 7/19, 9/21, 8/23, 9/23, 11/30.
    // Median ratio ~0.39 -> 39%.
    const m = computeLogMaturity(HISTORY, NOW);
    expect(m.yesterdaySharePct).toBeGreaterThan(30);
    expect(m.yesterdaySharePct).toBeLessThan(50);
  });

  it('measures how complete TODAY typically is at this hour, and it is far less', () => {
    // Today at 09:36 has had 9.6 hours; the same-day writes cluster in the
    // evening, so almost nothing is in yet.
    const m = computeLogMaturity(HISTORY, NOW);
    expect(m.todaySharePct).toBe(0);
    expect(m.todaySharePct!).toBeLessThan(m.yesterdaySharePct!);
  });

  it('later in the evening, yesterday reads as nearly done', () => {
    const lateNow = Date.parse('2026-09-16T23:30:00+05:30');
    const m = computeLogMaturity(HISTORY, lateNow);
    expect(m.yesterdaySharePct).toBe(100);
  });
});

describe('it never invents a number it cannot measure', () => {
  it('says nothing at all on an empty table', () => {
    const m = computeLogMaturity([], NOW);
    expect(m.settledDay).toBeNull();
    expect(m.settledCount).toBeNull();
    expect(m.settledMedian).toBeNull();
    expect(m.yesterdaySharePct).toBeNull();
    expect(m.todaySharePct).toBeNull();
  });

  it('a window with only unsettled days yields no share, not a guessed one', () => {
    // ENGINEERING-MEMORY L1: a trustworthy UNKNOWN beats a precise lie.
    const m = computeLogMaturity(day('2026-09-15', 9, 3), NOW);
    expect(m.settledDay).toBeNull();
    expect(m.yesterdaySharePct).toBeNull();
    expect(m.todaySharePct).toBeNull();
  });

  it('ignores rows with no date or no timestamp rather than counting them', () => {
    const junk = [
      { reportDate: '', createdAt: at('2026-09-14', '10:00') },
      { reportDate: '2026-09-14', createdAt: '' },
    ] as LogRow[];
    const m = computeLogMaturity([...HISTORY, ...junk], NOW);
    expect(m.settledCount, 'junk must not inflate a settled day').toBe(30);
  });

  it('one freak day cannot set the expectation', () => {
    // Median, not mean: a single day where everything was written instantly
    // must not make the tile claim today is usually complete.
    const freak = Array.from({ length: 40 }, () => ({
      reportDate: '2026-09-09', createdAt: at('2026-09-09', '00:30'),
    }));
    const m = computeLogMaturity([...HISTORY, ...freak], NOW);
    expect(m.todaySharePct, 'still near zero despite the outlier').toBeLessThan(30);
  });
});
