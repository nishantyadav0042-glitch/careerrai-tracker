import { describe, it, expect } from 'vitest';
import {
  todaysTaughtTopics, timetableDailyHours, timetableHorizon, horizonDaysLeft,
} from './timetable-align';
import { chooseTopicForSection } from './topic-selector';
import type { TimetableBlock } from './timetable';

// "My study plan didn't get aligned with the updated timetable — then what's
// the benefit of uploading?" — founder, 7 Aug. These tests pin the answer:
// today's class leads today's plan, the timetable's hours are checked against
// the student's, and a dated plan running out triggers a reminder.

const block = (over: Partial<TimetableBlock>): TimetableBlock => ({
  day: null, date: null, dayIndex: null, start: null, end: null,
  allDay: false, section: 'QA', topic: null, label: 'x', minutes: null,
  ...over,
});

// 2026-08-07 is a Friday (day index 4 in our Monday=0 scheme).
const TODAY = '2026-08-07';

describe('todaysTaughtTopics', () => {
  it('picks dated rows matching today', () => {
    const blocks = [
      block({ date: '2026-08-07', topic: 'Percentages' }),
      block({ date: '2026-08-08', topic: 'Time & Work' }),
    ];
    expect(todaysTaughtTopics(blocks, TODAY)).toEqual(['Percentages']);
  });

  it('picks recurring-weekly rows matching the weekday', () => {
    const blocks = [
      block({ day: 4, topic: 'Reading Comprehension' }), // Friday
      block({ day: 0, topic: 'Tables' }),                // Monday
    ];
    expect(todaysTaughtTopics(blocks, TODAY)).toEqual(['Reading Comprehension']);
  });

  it('gives Day-N plans nothing — no anchor, no guess', () => {
    expect(todaysTaughtTopics([block({ dayIndex: 2, topic: 'Charts' })], TODAY)).toEqual([]);
  });

  it('dedupes a topic taught in two slots the same day', () => {
    const blocks = [
      block({ date: TODAY, topic: 'Percentages' }),
      block({ date: TODAY, topic: 'Percentages' }),
    ];
    expect(todaysTaughtTopics(blocks, TODAY)).toEqual(['Percentages']);
  });
});

describe("today's class actually WINS topic selection", () => {
  // The founder-visible claim. A +25 evergreen priority flag was not enough
  // for a class taught today to beat a high-weightage revision candidate —
  // which is precisely why uploading felt like it changed nothing.
  it('beats an overdue high-weightage topic', () => {
    const candidates = [
      { topic: 'Time Speed Distance', coverageStatus: 'practicing' as const, daysSinceLastPracticed: 9, selfReportedBonus: false, priorityBonus: true, focusBonus: false, postponedBonus: false, todayClassBonus: false },
      { topic: 'Percentages', coverageStatus: 'practicing' as const, daysSinceLastPracticed: 1, selfReportedBonus: false, priorityBonus: true, focusBonus: false, postponedBonus: false, todayClassBonus: true },
    ];
    const chosen = chooseTopicForSection(candidates, 1, false);
    expect(chosen.topic).toBe('Percentages');
    expect(chosen.reasons.join(' ')).toMatch(/coaching.*today/i);
  });

  it("still loses to yesterday's postponement promise", () => {
    // "Never delete, always postpone" is a promise made to the student in
    // words. A promise outranks a schedule.
    const candidates = [
      { topic: 'Tables', coverageStatus: 'practicing' as const, daysSinceLastPracticed: 2, selfReportedBonus: false, priorityBonus: false, focusBonus: false, postponedBonus: true, todayClassBonus: false },
      { topic: 'Charts', coverageStatus: 'practicing' as const, daysSinceLastPracticed: 2, selfReportedBonus: false, priorityBonus: false, focusBonus: false, postponedBonus: false, todayClassBonus: true },
    ];
    expect(chooseTopicForSection(candidates, 1, false).topic).toBe('Tables');
  });
});

describe('timetableDailyHours — the hours check', () => {
  it('reads the median day from stated minutes', () => {
    const blocks = [
      block({ date: '2026-08-10', minutes: 120 }), block({ date: '2026-08-10', minutes: 180 }), block({ date: '2026-08-10', minutes: 180 }), // 480
      block({ date: '2026-08-11', minutes: 480 }),
      block({ date: '2026-08-12', minutes: 480 }),
      block({ date: '2026-08-15', minutes: 330 }), // the lighter Saturday
    ];
    expect(timetableDailyHours(blocks)).toBe(8); // median 480min, not the mean
  });

  it('derives minutes from start-end pairs via the sanitizer contract', () => {
    const blocks = [
      block({ day: 0, minutes: 120 }), block({ day: 1, minutes: 120 }), block({ day: 2, minutes: 90 }),
    ];
    expect(timetableDailyHours(blocks)).toBe(2);
  });

  it('refuses to judge from fewer than three priced days', () => {
    // This number questions the student's own setting. Two data points are an
    // anecdote, and an anecdote must not open that conversation.
    expect(timetableDailyHours([block({ date: '2026-08-10', minutes: 480 }), block({ date: '2026-08-11', minutes: 480 })])).toBeNull();
    expect(timetableDailyHours([block({ date: '2026-08-10' })])).toBeNull();
  });

  it('ignores sub-hour days as breaks, not study days', () => {
    const blocks = [
      block({ date: '2026-08-10', minutes: 480 }), block({ date: '2026-08-11', minutes: 480 }),
      block({ date: '2026-08-12', minutes: 480 }), block({ date: '2026-08-13', minutes: 30 }),
    ];
    expect(timetableDailyHours(blocks)).toBe(8);
  });
});

describe('the horizon — when a dated plan runs out', () => {
  it('finds the last covered day and counts what is left', () => {
    const blocks = [block({ date: '2026-08-09' }), block({ date: '2026-08-20' })];
    expect(timetableHorizon(blocks)).toBe('2026-08-20');
    expect(horizonDaysLeft(blocks, '2026-08-18')).toBe(3);
    expect(horizonDaysLeft(blocks, '2026-08-20')).toBe(1);
    expect(horizonDaysLeft(blocks, '2026-08-25')).toBe(0);
  });

  it('never expires a recurring weekly timetable', () => {
    expect(timetableHorizon([block({ day: 2 })])).toBeNull();
    expect(horizonDaysLeft([block({ day: 2 })], TODAY)).toBeNull();
  });
});

describe('duplicate tasks are one task', () => {
  it('collapses the same class stated twice — the live 17-hour bug', () => {
    // The extractor emitted each task once from the daily sheet and once from
    // the weekly sheet. Without the collapse, an 8-hour day read as 17 and the
    // hours check would have told every student their own number was wrong.
    const twice = ['2026-08-10', '2026-08-11', '2026-08-12'].flatMap((date) => [
      block({ date, section: 'VARC', topic: 'Reading Comprehension', minutes: 120 }),
      block({ date, section: 'VARC', topic: 'Reading Comprehension', minutes: 120 }),
      block({ date, section: 'QA', topic: 'Percentages', minutes: 180 }),
      block({ date, section: 'QA', topic: 'Percentages', minutes: 180 }),
      block({ date, section: 'DILR', topic: 'Tables', minutes: 120 }),
      block({ date, section: 'DILR', topic: 'Tables', minutes: 120 }),
    ]);
    expect(timetableDailyHours(twice)).toBe(7); // 420 min, not 840
  });

  it('still sums genuinely distinct tasks in one section', () => {
    const days = ['2026-08-10', '2026-08-11', '2026-08-12'].flatMap((date) => [
      block({ date, section: 'VARC', topic: 'Editorial Reading', minutes: 30 }),
      block({ date, section: 'VARC', topic: 'Reading Comprehension', minutes: 90 }),
    ]);
    expect(timetableDailyHours(days)).toBe(2);
  });
});
