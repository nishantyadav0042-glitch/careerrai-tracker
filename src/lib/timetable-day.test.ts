import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  timetableDayTasks, coachingBlocksForDate, tasksFromCoachingDay,
  coachingDayMinutes, sheetInstruction, MIN_BLOCK_MINUTES,
} from './timetable-day';
import type { TimetableBlock } from './timetable';

// ── One study plan per student ──────────────────────────────────────────────
//
// Founder, 14 Aug: "if someone uploads their timetable it must be implemented
// then and there, and the timetable built through the coverage matrix should
// become dead instantly."
//
// The regression these tests exist for is real and is reproduced verbatim
// below: Vedashri kale's 13 August. Her coaching sheet planned three sessions
// totalling seven hours. The app served four tasks totalling eight, the fourth
// being a DILR topic her coaching never assigned — because the day was sized
// from her profile's hours, sliced into blocks, and only then filled with
// topics. Alignment "passed" (every one of her topics did appear) while the
// student still could not tell which parts came from her coaching.

function blk(p: Partial<TimetableBlock>): TimetableBlock {
  return {
    day: 0, date: null, dayIndex: null, start: null, end: null, allDay: true,
    section: null, topic: null, label: '', minutes: null, ...p,
  } as TimetableBlock;
}

/** Vedashri's real rows, as stored in production. */
const VEDASHRI: TimetableBlock[] = [
  blk({ date: '2026-08-13', section: 'VARC', topic: 'Editorial Reading', minutes: 120, label: '2 hrs: 30 min editorial + 1 RC passage' }),
  blk({ date: '2026-08-13', section: 'QA', topic: 'Profit & Loss', minutes: 180, label: '3 hrs: Profit & Loss, Average, SI & CI' }),
  blk({ date: '2026-08-13', section: 'DILR', topic: 'Arrangements', minutes: 120, label: '2 hrs: Arrangements, Selection & Distribution' }),
];
const CONFIRMED = '2026-08-11T06:00:00Z';

describe('the day is the coaching\'s day, not ours', () => {
  const tasks = timetableDayTasks({
    planSource: 'coaching', blocks: VEDASHRI, confirmedAt: CONFIRMED,
    todayIso: '2026-08-13', dayMinutes: 8 * 60,
  })!;

  it('serves exactly the blocks the sheet assigned', () => {
    expect(tasks).toHaveLength(3);
    expect(tasks.map((t) => t.topic)).toEqual(['Editorial Reading', 'Profit & Loss', 'Arrangements']);
  });

  it('never appends a topic the coaching did not assign', () => {
    // THE bug. A fourth DILR block appeared because DILR's computed share
    // exceeded one block, and the coverage matrix filled the extra slot.
    expect(tasks.map((t) => t.topic)).not.toContain('Tables');
    expect(tasks.filter((t) => t.section === 'DILR')).toHaveLength(1);
  });

  it('keeps the sheet\'s own minutes, not minutes we compute', () => {
    expect(tasks.map((t) => t.estMinutes)).toEqual([120, 180, 120]);
  });

  it('does not stretch a 7-hour sheet to the 8 hours the profile claims', () => {
    // The extra hour is the student's to spend. Inventing work to fill it is
    // precisely the duplication this module removes.
    expect(tasks.reduce((s, t) => s + t.estMinutes, 0)).toBe(420);
  });

  it('shows the coaching\'s own instruction, not our generated one', () => {
    // targetPhrase produced "Learn Editorial Reading, solve 12 questions" for
    // a reading block that has no questions. Her sheet's words outrank ours.
    expect(tasks[0].target).toBe('30 min editorial + 1 RC passage');
    expect(tasks[1].target).toBe('Profit & Loss, Average, SI & CI');
  });

  it('says where every task came from', () => {
    for (const t of tasks) expect(t.reason).toBe('From your coaching timetable');
  });
});

describe('it hands back to the engine rather than showing an empty day', () => {
  it('is silent on a date the sheet does not cover', () => {
    expect(timetableDayTasks({
      planSource: 'coaching', blocks: VEDASHRI, confirmedAt: CONFIRMED,
      todayIso: '2026-08-14', dayMinutes: 480,
    })).toBeNull();
  });

  it('is silent before the sheet was confirmed', () => {
    expect(timetableDayTasks({
      planSource: 'coaching', blocks: VEDASHRI, confirmedAt: CONFIRMED,
      todayIso: '2026-08-01', dayMinutes: 480,
    })).toBeNull();
  });

  it('is silent for a student who is not following a coaching', () => {
    expect(timetableDayTasks({
      planSource: 'careerrai', blocks: VEDASHRI, confirmedAt: CONFIRMED,
      todayIso: '2026-08-13', dayMinutes: 480,
    })).toBeNull();
  });

  it('is silent when there is no sheet at all', () => {
    expect(timetableDayTasks({
      planSource: 'coaching', blocks: null, confirmedAt: null,
      todayIso: '2026-08-13', dayMinutes: 480,
    })).toBeNull();
  });

  it('ignores rows that are not study — SLEEP, GYM, LUNCH', () => {
    const day = coachingBlocksForDate([
      blk({ date: '2026-08-13', label: 'SLEEP' }),
      blk({ date: '2026-08-13', label: 'GYM' }),
    ], CONFIRMED, '2026-08-13');
    expect(day).toHaveLength(0);
    expect(tasksFromCoachingDay(day, 480)).toBeNull();
  });
});

describe('a weekly class grid repeats, a dated sheet does not', () => {
  const WEEKLY: TimetableBlock[] = [
    blk({ day: 2, section: 'QA', topic: 'Percentages', minutes: 90, label: 'Wed QA class' }),
    blk({ day: 4, section: 'VARC', topic: 'Reading Comprehension', minutes: 90, label: 'Fri VARC class' }),
  ];

  it('gives Wednesday\'s class on a Wednesday', () => {
    // 2026-08-12 is a Wednesday.
    const t = timetableDayTasks({ planSource: 'coaching', blocks: WEEKLY, confirmedAt: CONFIRMED, todayIso: '2026-08-12', dayMinutes: 480 })!;
    expect(t.map((x) => x.topic)).toEqual(['Percentages']);
  });

  it('gives nothing on a day the grid has no class', () => {
    // 2026-08-13 is a Thursday — no row.
    expect(timetableDayTasks({ planSource: 'coaching', blocks: WEEKLY, confirmedAt: CONFIRMED, todayIso: '2026-08-13', dayMinutes: 480 })).toBeNull();
  });
});

describe('pricing blocks the sheet left unpriced', () => {
  /**
   * Three dated rows, not two, because detectShape deliberately refuses to
   * read a handful of dates as a dated calendar — that rule is what stopped
   * one stray "2023-10-16" from expiring Riya's sheet three years into the
   * past. A fixture with two rows tests a sheet shape we would never trust.
   */
  const unpriced = (extra: Partial<TimetableBlock> = {}) => coachingBlocksForDate([
    blk({ date: '2026-08-13', section: 'QA', topic: 'Percentages', label: 'QA class', ...extra }),
    blk({ date: '2026-08-13', section: 'VARC', topic: 'Reading Comprehension', label: 'VARC class' }),
    blk({ date: '2026-08-14', section: 'QA', topic: 'Averages', label: 'QA class' }),
  ], CONFIRMED, '2026-08-13');

  it('splits only what the sheet already covers, and still adds nothing', () => {
    const tasks = tasksFromCoachingDay(unpriced(), 240)!;
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.estMinutes)).toEqual([120, 120]);
  });

  it('a priced block keeps its minutes while an unpriced one takes the rest', () => {
    const tasks = tasksFromCoachingDay(unpriced({ minutes: 180 }), 300)!;
    expect(tasks.map((t) => t.estMinutes)).toEqual([180, 120]);
  });

  it('never prices a block below the floor, even on a tiny day', () => {
    const tasks = tasksFromCoachingDay(unpriced(), 10)!;
    for (const t of tasks) expect(t.estMinutes).toBeGreaterThanOrEqual(MIN_BLOCK_MINUTES);
  });

  it('a sheet printing the same session twice is one task, with the time summed', () => {
    const day = coachingBlocksForDate([
      blk({ date: '2026-08-13', section: 'QA', topic: 'Percentages', minutes: 60, label: 'QA 10-11' }),
      blk({ date: '2026-08-13', section: 'QA', topic: 'Percentages', minutes: 60, label: 'QA 4-5' }),
      blk({ date: '2026-08-14', section: 'VARC', topic: 'Reading Comprehension', minutes: 60, label: 'VARC' }),
    ], CONFIRMED, '2026-08-13');
    const tasks = tasksFromCoachingDay(day, 480)!;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].estMinutes).toBe(120);
  });
});

describe('the sheet\'s instruction, read honestly', () => {
  it('strips a leading duration the task already shows beside it', () => {
    expect(sheetInstruction('2 hrs: 30 min editorial + 1 RC passage', 'Editorial Reading'))
      .toBe('30 min editorial + 1 RC passage');
    expect(sheetInstruction('90 mins - Solve 20 questions', 'Percentages')).toBe('Solve 20 questions');
  });

  it('declines a label that is just the topic restated', () => {
    expect(sheetInstruction('Percentages', 'Percentages')).toBeNull();
  });

  it('declines a label too thin to be an instruction', () => {
    expect(sheetInstruction('QA', null)).toBeNull();
    expect(sheetInstruction('', null)).toBeNull();
  });
});

describe('what the coaching itself planned', () => {
  it('totals the sheet\'s own minutes', () => {
    expect(coachingDayMinutes(coachingBlocksForDate(VEDASHRI, CONFIRMED, '2026-08-13'))).toBe(420);
  });

  it('is null when the sheet priced nothing', () => {
    const day = coachingBlocksForDate([blk({ date: '2026-08-13', section: 'QA', topic: 'Percentages', label: 'QA' })], CONFIRMED, '2026-08-13');
    expect(coachingDayMinutes(day)).toBeNull();
  });
});

describe('both plan writers ask the same authority', () => {
  // There are exactly two writers of daily_routines, and the cron runs FIRST
  // (6am). A fix applied only to the tracker route would have been overwritten
  // before the student woke up — invisible in production, green in every test.
  it('the 6am cron generator uses it', () => {
    const s = readFileSync('src/lib/routine-plan.ts', 'utf8');
    expect(s).toContain('timetableDayTasks({');
    expect(s.indexOf('timetableDayTasks({')).toBeLessThan(s.indexOf('generateRoutine(routineProfile, now'));
  });

  it('the tracker route uses it', () => {
    const s = readFileSync('src/app/api/routine/today/route.ts', 'utf8');
    expect(s).toContain('timetableDayTasks({');
  });

  it('neither writer builds its own version of the decision', () => {
    for (const f of ['src/lib/routine-plan.ts', 'src/app/api/routine/today/route.ts']) {
      const s = readFileSync(f, 'utf8');
      expect(s, `${f} must not re-implement block selection`).not.toContain('coachingBlocksForDate(');
    }
  });

  it('saving a timetable kills today\'s stored plan so the switch is immediate', () => {
    // "Implemented then and there" — without this the student keeps yesterday's
    // coverage-matrix day until tomorrow's generation.
    const s = readFileSync('src/lib/timetable-apply.ts', 'utf8');
    expect(s).toMatch(/from\('daily_routines'\)\s*\.delete\(\)/);
  });
});
