import { describe, it, expect } from 'vitest';
import { busyDayOutcome, shiftIsoDay } from './busy-day';

// The bad-day floor asked a student at signup to predict how bad their worst
// day would be, and then fought with their hours over which number sized the
// plan. It is gone. A busy day is reported, not predicted — and the only
// number that moves is the one this codebase has always said should move:
// "the date gives. The hours don't."

describe('shiftIsoDay', () => {
  it('crosses month and year ends without a timezone getting involved', () => {
    expect(shiftIsoDay('2026-08-31')).toBe('2026-09-01');
    expect(shiftIsoDay('2026-12-31')).toBe('2027-01-01');
    expect(shiftIsoDay('2028-02-28')).toBe('2028-02-29'); // leap year
  });
});

describe('a CareerRai-plan student', () => {
  const base = { planSource: 'careerrai', attemptYear: 2026, today: '2026-08-08' };

  it('moves today to tomorrow and the finish date with it', () => {
    const v = busyDayOutcome({ ...base, targetDate: '2026-10-17' });
    expect(v.shift).toBe(true);
    expect(v.reason).toBe('ok');
    expect(v.previousTargetDate).toBe('2026-10-17');
    expect(v.newTargetDate).toBe('2026-10-18');
    expect(v.message).toContain('Nothing is lost');
  });

  it('still moves the work when there is no finish date to move', () => {
    const v = busyDayOutcome({ ...base, targetDate: null });
    expect(v.shift).toBe(true);
    expect(v.reason).toBe('no_date');
    expect(v.newTargetDate).toBeNull();
  });

  it('a null plan_source is treated as our plan, not as coaching', () => {
    // Every one of the 256 existing students reads 'careerrai', but a null
    // must not silently become the refusal branch.
    const v = busyDayOutcome({ ...base, planSource: null, targetDate: '2026-10-17' });
    expect(v.shift).toBe(true);
    expect(v.newTargetDate).toBe('2026-10-18');
  });

  it('the date stops at exam day and says so honestly', () => {
    // CAT 2026 is the last Sunday of November. A date already there cannot be
    // pushed past it — the same wall the weekly reconcile respects.
    const exam = '2026-11-29';
    const v = busyDayOutcome({ ...base, targetDate: exam });
    expect(v.shift).toBe(true);              // the work still moves
    expect(v.hitExamWall).toBe(true);        // the date does not
    expect(v.newTargetDate).toBeNull();
    expect(v.message).toContain('revision time');
  });
});

describe('a coaching student is refused, and told why', () => {
  it('never shifts — their class will not move with them', () => {
    const v = busyDayOutcome({
      planSource: 'coaching', targetDate: '2026-10-17', attemptYear: 2026, today: '2026-08-08',
    });
    expect(v.shift).toBe(false);
    expect(v.reason).toBe('coaching');
    expect(v.newTargetDate).toBeNull();
    expect(v.previousTargetDate).toBe('2026-10-17'); // unchanged, and reported
  });

  it('the refusal explains itself instead of just failing', () => {
    const v = busyDayOutcome({
      planSource: 'coaching', targetDate: null, attemptYear: null, today: '2026-08-08',
    });
    expect(v.message).toMatch(/coaching/i);
    expect(v.message).toMatch(/revision/i); // what we DO still do for them
  });
});

describe('the floor is gone, and stays gone', () => {
  it('no module still exports the bad-day floor', async () => {
    const hours = await import('./daily-hours');
    for (const dead of ['badDayFloorMinutes', 'setBadDayFloor', 'planMinutesForDay',
                        'coreMinutesForDay', 'FLOOR_OPTIONS_MINUTES']) {
      expect(hours).not.toHaveProperty(dead);
    }
  });
});
