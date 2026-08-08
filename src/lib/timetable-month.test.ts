import { describe, it, expect } from 'vitest';
import {
  anchorToMonth, detectShape, topicsOnDate, sectionsOnDate,
  monthHorizon, monthDaysLeft, summariseMonth, PLAN_WINDOW_DAYS, SEQUENCE_SAME_DAY_THRESHOLD,
} from './timetable-month';
import type { TimetableBlock } from './timetable';

// The two real uploads in the live database on 8 Aug 2026 are the fixtures.
// Both extracted well and both produced a plan that did nothing, so both are
// pinned here permanently — if either ever stops working again, this fails.

const b = (over: Partial<TimetableBlock> = {}): TimetableBlock => ({
  day: null, date: null, dayIndex: null, start: null, end: null, allDay: false,
  section: null, topic: null, label: '', minutes: null, ...over,
} as TimetableBlock);

const MON = '2026-08-10'; // a Monday

describe('shape detection — decided from evidence, never from a label', () => {
  it('a real class grid spreads across weekdays', () => {
    const blocks = [
      b({ day: 0, section: 'QA', topic: 'Percentages' }),
      b({ day: 2, section: 'VARC', topic: 'Reading Comprehension' }),
      b({ day: 4, section: 'DILR', topic: 'Arrangements' }),
    ];
    expect(detectShape(blocks)).toBe('weekly');
  });

  it("RIYA'S REAL FILE: 48 topics all on day 0 is a LIST, not a Monday", () => {
    // The defect this module exists for. No coaching teaches 48 CAT topics in
    // one Monday evening; the extractor had to anchor them somewhere.
    const blocks = Array.from({ length: 48 }, (_, i) =>
      b({ day: 0, section: 'QA', topic: `T${i}` }));
    expect(detectShape(blocks)).toBe('sequence');
  });

  it('but a genuinely small single-day sheet is still a weekly grid', () => {
    // Three classes on a Tuesday is a real Tuesday. The threshold has to let
    // this through or a legitimate one-day-a-week batch breaks.
    const blocks = [
      b({ day: 1, section: 'QA', topic: 'Percentages' }),
      b({ day: 1, section: 'QA', topic: 'Averages' }),
      b({ day: 1, section: 'VARC', topic: 'Reading Comprehension' }),
    ];
    expect(blocks.length).toBeLessThan(SEQUENCE_SAME_DAY_THRESHOLD);
    expect(detectShape(blocks)).toBe('weekly');
  });

  it('a mostly-dated sheet is dated', () => {
    const blocks = [
      b({ date: '2026-08-10', section: 'QA', topic: 'Percentages' }),
      b({ date: '2026-08-11', section: 'QA', topic: 'Averages' }),
      b({ date: '2026-08-12', section: 'VARC', topic: 'Reading Comprehension' }),
      b({ day: 3, section: 'DILR', topic: 'Arrangements' }),
    ];
    expect(detectShape(blocks)).toBe('dated');
  });

  it('ONE stray date among many undated rows is NOT a dated sheet', () => {
    // Riya's sheet carried a single "2023-10-16" sample row. Believing it is
    // what pushed "your timetable has run out" to her phone on 7 Aug.
    const blocks = [
      ...Array.from({ length: 20 }, (_, i) => b({ day: 0, section: 'QA', topic: `T${i}` })),
      b({ date: '2023-10-16', section: 'QA', topic: 'Sample' }),
    ];
    expect(detectShape(blocks)).not.toBe('dated');
  });

  it('a sheet with nothing studyable in it is empty, not an error', () => {
    // Sleep, gym, lunch. Dropped quietly — they are not our business, and they
    // are not a failed upload either.
    const blocks = [b({ day: 0, label: 'SLEEP' }), b({ day: 0, label: 'GYM' })];
    expect(detectShape(blocks)).toBe('empty');
  });
});

describe('anchoring produces one real month, every time', () => {
  it('always returns a contiguous run of real dates with no gaps', () => {
    const cal = anchorToMonth([b({ day: 0, section: 'QA', topic: 'Percentages' })], MON);
    expect(cal).toHaveLength(PLAN_WINDOW_DAYS);
    expect(cal[0].date).toBe(MON);
    for (let i = 1; i < cal.length; i++) {
      const prev = Date.parse(cal[i - 1].date + 'T00:00:00Z');
      const cur = Date.parse(cal[i].date + 'T00:00:00Z');
      expect(cur - prev).toBe(86_400_000);
    }
  });

  it('a weekly grid repeats on every matching weekday of the month', () => {
    const cal = anchorToMonth([
      b({ day: 0, section: 'QA', topic: 'Percentages' }),
      b({ day: 3, section: 'VARC', topic: 'Reading Comprehension' }),
    ], MON);
    expect(topicsOnDate(cal, '2026-08-10')).toEqual(['Percentages']); // Mon
    expect(topicsOnDate(cal, '2026-08-13')).toEqual(['Reading Comprehension']); // Thu
    expect(topicsOnDate(cal, '2026-08-17')).toEqual(['Percentages']); // next Mon
    expect(topicsOnDate(cal, '2026-08-11')).toEqual([]); // Tue — nothing
  });

  it('a dated sheet keeps its own dates and drops what falls outside the month', () => {
    const cal = anchorToMonth([
      b({ date: '2026-08-11', section: 'QA', topic: 'Percentages' }),
      b({ date: '2026-08-12', section: 'QA', topic: 'Averages' }),
      b({ date: '2026-08-13', section: 'VARC', topic: 'Reading Comprehension' }),
      b({ date: '2027-01-01', section: 'QA', topic: 'Far Future' }),
    ], MON);
    expect(topicsOnDate(cal, '2026-08-11')).toEqual(['Percentages']);
    expect(topicsOnDate(cal, '2026-08-13')).toEqual(['Reading Comprehension']);
    expect(cal.some((d) => d.topics.includes('Far Future'))).toBe(false);
  });

  it("RIYA'S FILE, FIXED: 48 topics become a month, not 48 Mondays", () => {
    const blocks = Array.from({ length: 48 }, (_, i) =>
      b({ day: 0, section: 'QA', topic: `Topic ${i + 1}` }));
    const cal = anchorToMonth(blocks, MON);

    // Before: every Monday returned all 48 (a bonus on everything is a bonus
    // on nothing) and Tue-Sun returned zero.
    const monday = topicsOnDate(cal, MON);
    expect(monday.length).toBeGreaterThan(0);
    expect(monday.length).toBeLessThanOrEqual(3);

    // Every day now carries something, and the whole list is used exactly once.
    const busyDays = cal.filter((d) => d.topics.length > 0).length;
    expect(busyDays).toBeGreaterThanOrEqual(24);
    const all = cal.flatMap((d) => d.topics);
    expect(all).toHaveLength(48);
    expect(new Set(all).size).toBe(48);
  });

  it('sequence order follows the sheet, and dayIndex wins when present', () => {
    const cal = anchorToMonth([
      b({ dayIndex: 3, topic: 'Third', section: 'QA' }),
      b({ dayIndex: 1, topic: 'First', section: 'QA' }),
      b({ dayIndex: 2, topic: 'Second', section: 'QA' }),
      ...Array.from({ length: 30 }, (_, i) => b({ dayIndex: i + 4, topic: `T${i}`, section: 'QA' })),
    ], MON);
    const order = cal.flatMap((d) => d.topics);
    expect(order.slice(0, 3)).toEqual(['First', 'Second', 'Third']);
  });

  it("ABHISHEK'S FILE: sleep and cricket vanish, the DPP sections survive", () => {
    // His upload was his own routine. One topic in sixteen blocks — but three
    // blocks named a section, and a section is still worth knowing.
    const cal = anchorToMonth([
      b({ day: 0, label: 'SLEEP' }),
      b({ day: 0, label: 'GYM' }),
      b({ day: 0, label: 'CRICKET' }),
      b({ day: 0, label: 'REVISION / FORMULA / VOCABULARY', topic: 'Vocabulary' }),
      b({ day: 0, label: 'QUANT DPP', section: 'QA' }),
      b({ day: 0, label: 'VARC DPP', section: 'VARC' }),
      b({ day: 0, label: 'LRDI DPP', section: 'DILR' }),
    ], MON);
    expect(topicsOnDate(cal, MON)).toEqual(['Vocabulary']);
    expect(sectionsOnDate(cal, MON).sort()).toEqual(['DILR', 'QA', 'VARC']);
    expect(cal[0].labels).not.toContain('SLEEP');
    expect(cal[0].labels).not.toContain('CRICKET');
  });

  it('an empty sheet still yields a full, honest, empty month', () => {
    const cal = anchorToMonth([], MON);
    expect(cal).toHaveLength(PLAN_WINDOW_DAYS);
    expect(cal.every((d) => d.topics.length === 0)).toBe(true);
  });
});

describe('the horizon can no longer be poisoned by one stray date', () => {
  it('a weekly sheet with a 2023 sample row still has a full month left', () => {
    // The exact live failure: max-date over raw blocks read three years into
    // the past, so daysLeft was 0 and the push said "run out".
    const blocks = [
      ...Array.from({ length: 20 }, (_, i) => b({ day: i % 7, section: 'QA', topic: `T${i}` })),
      b({ date: '2023-10-16', section: 'QA', topic: 'Sample' }),
    ];
    const cal = anchorToMonth(blocks, MON);
    expect(monthHorizon(cal)).toBe('2026-09-09');
    expect(monthDaysLeft(cal, MON)).toBe(PLAN_WINDOW_DAYS);
  });

  it('counts down honestly as the month is used up, and floors at zero', () => {
    const cal = anchorToMonth([b({ day: 0, topic: 'Percentages', section: 'QA' })], MON);
    expect(monthDaysLeft(cal, '2026-09-08')).toBe(2);
    expect(monthDaysLeft(cal, '2026-09-09')).toBe(1);
    expect(monthDaysLeft(cal, '2026-10-01')).toBe(0);
  });
});

describe('the summary a student checks against their own sheet', () => {
  it('counts what was actually read, so the numbers can be verified by eye', () => {
    const blocks = [
      b({ day: 0, section: 'QA', topic: 'Percentages', label: 'Arithmetic', minutes: 120 }),
      b({ day: 3, section: 'VARC', topic: 'Reading Comprehension', label: 'RC', minutes: 60 }),
    ];
    const cal = anchorToMonth(blocks, MON);
    const s = summariseMonth(cal, detectShape(blocks));
    expect(s.shape).toBe('weekly');
    expect(s.topics).toBe(2);
    expect(s.sections.sort()).toEqual(['QA', 'VARC']);
    expect(s.totalDays).toBe(PLAN_WINDOW_DAYS);
    expect(s.daysCovered).toBe(9); // 5 Mondays + 4 Thursdays in a 31-day window
    expect(s.firstDate).toBe(MON);
    expect(s.plannedMinutes).toBe(5 * 120 + 4 * 60);
  });

  it('reports no minutes rather than inventing them', () => {
    const cal = anchorToMonth([b({ day: 0, section: 'QA', topic: 'Percentages' })], MON);
    expect(summariseMonth(cal, 'weekly').plannedMinutes).toBeNull();
  });
});
