import { describe, it, expect } from 'vitest';
import { timetableDailyHours } from './timetable-align';
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

// The TODAY constant went with the two date-based blocks removed on 14 Aug —
// the remaining tests price a timetable's hours, which no date can change.

// The todaysTaughtTopics block was deleted with the function on 14 Aug.
// timetable-month.coachingTopicsForDate answers this question now, and its own
// tests cover it — including the anchored-month behaviour the old function had
// no concept of. The block below is kept and still passes, because "today's
// class wins topic selection" is a claim about the PLANNER, and that claim
// survived the change of which module supplies today's topics.

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

// The horizon block went with timetableHorizon/horizonDaysLeft. Reading the
// max raw date out of an OCR'd sheet is the bug that told Riya her timetable
// expired in 2023; timetable-month's anchored monthDaysLeft replaced it, and
// its tests pin the stray-date case this pair got wrong.

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
