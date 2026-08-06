import { describe, it, expect } from 'vitest';
import { reconcileWeek } from './plan-extension';

// The founder's rule, pinned: hours never move, the DATE moves, once a week.
//
// Everything here is arithmetic a student could redo on paper. That matters —
// "your date moved by 4 days" is a claim, and a claim they cannot check is a
// claim they will not trust.

const weekdays = [false, false, false, false, false, true, true]; // Mon..Sun
const base = {
  weekdayHours: 5,
  weekendHours: 6,
  isWeekendByDay: weekdays,
  currentTargetDate: '2026-08-31',
  examDate: '2026-11-29',
};

/** 5x5 weekday + 2x6 weekend = 37 expected hours in a week. */
const FULL_WEEK = 37;

describe('a student who keeps up is left completely alone', () => {
  it('does not move the date when the week was met', () => {
    const r = reconcileWeek({ ...base, loggedHoursByDay: [5, 5, 5, 5, 5, 6, 6] });
    expect(r.expectedHours).toBe(FULL_WEEK);
    expect(r.actualHours).toBe(FULL_WEEK);
    expect(r.daysAdded).toBe(0);
    expect(r.newDate).toBe('2026-08-31');
    expect(r.warning).toBeNull();
  });

  it('says nothing at all when they overshoot', () => {
    const r = reconcileWeek({ ...base, loggedHoursByDay: [7, 7, 7, 7, 7, 8, 8] });
    expect(r.deficitHours).toBe(0);
    expect(r.warning).toBeNull();
  });
});

describe('missed hours move the date, priced at the student’s own rate', () => {
  it('adds the days the missed hours are actually worth', () => {
    // Studied 2h on each weekday, nothing at the weekend: 10 of 37.
    // 27 hours short / 5 hrs a day = 6 days.
    const r = reconcileWeek({ ...base, loggedHoursByDay: [2, 2, 2, 2, 2, 0, 0] });
    expect(r.actualHours).toBe(10);
    expect(r.deficitHours).toBe(27);
    expect(r.daysAdded).toBe(6);
    expect(r.newDate).toBe('2026-09-06');
  });

  it('counts a silent day as a full miss', () => {
    // Founder's call: no log means no study. A student who never opens the app
    // must still see their date move, or the mechanism does nothing.
    const silent = reconcileWeek({ ...base, loggedHoursByDay: [null, null, null, null, null, null, null] });
    expect(silent.actualHours).toBe(0);
    expect(silent.deficitHours).toBe(FULL_WEEK);
    expect(silent.daysAdded).toBe(8); // 37 / 5, rounded up
  });

  it('quotes both numbers so the student can check the maths', () => {
    const r = reconcileWeek({ ...base, loggedHoursByDay: [2, 2, 2, 2, 2, 0, 0] });
    expect(r.warning).toContain('10 of the 37 hours');
    expect(r.warning).toContain('27 hours short');
    expect(r.warning).toContain('31 Aug');
    expect(r.warning).toContain('6 Sept');
  });

  it('does not invent a move it did not make', () => {
    // Two hours short is not a day. Saying "your date moved" here would be a
    // small lie, and small lies about dates are how a tracker stops being
    // believed.
    const r = reconcileWeek({ ...base, loggedHoursByDay: [5, 5, 5, 5, 3, 6, 6] });
    expect(r.deficitHours).toBe(2);
    expect(r.daysAdded).toBe(1); // 2 / 5 rounds up to 1
    expect(r.warning).toContain('moved');
  });

  it('says "not enough to move it yet" when the date genuinely held', () => {
    // Only reachable when the exam wall clips the move to zero.
    const r = reconcileWeek({
      ...base, currentTargetDate: '2026-11-29', loggedHoursByDay: [5, 5, 5, 5, 4, 6, 6],
    });
    expect(r.daysAdded).toBe(0);
    expect(r.warning).toMatch(/cannot move again|Not enough to move/i);
  });
});

describe('the date never passes the exam', () => {
  it('clips the extension at CAT day', () => {
    const r = reconcileWeek({
      ...base, currentTargetDate: '2026-11-26', loggedHoursByDay: [0, 0, 0, 0, 0, 0, 0],
    });
    expect(r.newDate).toBe('2026-11-29');
    expect(r.hitExamWall).toBe(true);
    expect(r.daysAdded).toBe(3); // 26 Nov -> 29 Nov, not the full 8
  });

  it('changes the message once the date is against the wall', () => {
    const r = reconcileWeek({
      ...base, currentTargetDate: '2026-11-29', loggedHoursByDay: [0, 0, 0, 0, 0, 0, 0],
    });
    expect(r.daysAdded).toBe(0);
    expect(r.hitExamWall).toBe(true);
    expect(r.warning).toMatch(/cannot move again/i);
    expect(r.warning).toMatch(/revision time/i);
  });

  it('never moves a date backwards, even if it is already past the exam', () => {
    const r = reconcileWeek({
      ...base, currentTargetDate: '2026-12-15', loggedHoursByDay: [0, 0, 0, 0, 0, 0, 0],
    });
    expect(r.newDate).toBe('2026-12-15');
    expect(r.daysAdded).toBe(0);
  });
});

describe('the student’s hours are used exactly as they set them', () => {
  it('respects an 11-hour day without shrinking it', () => {
    // Abhishek set 11. We do not second-guess that any more — we just hold him
    // to it, and move the date when he misses.
    const r = reconcileWeek({
      ...base, weekdayHours: 11, weekendHours: 11,
      loggedHoursByDay: [5, 5, 5, 5, 5, 5, 5],
    });
    expect(r.expectedHours).toBe(77);
    expect(r.actualHours).toBe(35);
    expect(r.deficitHours).toBe(42);
    expect(r.daysAdded).toBe(4); // 42 / 11
  });

  it('uses the weekend figure on weekend days', () => {
    const r = reconcileWeek({ ...base, loggedHoursByDay: [5, 5, 5, 5, 5, 0, 0] });
    expect(r.deficitHours).toBe(12); // the two 6-hour weekend days
  });

  it('falls back to the weekday figure when no weekend one is set', () => {
    const r = reconcileWeek({
      ...base, weekendHours: null, loggedHoursByDay: [0, 0, 0, 0, 0, 0, 0],
    });
    expect(r.expectedHours).toBe(35); // 7 x 5
  });
});
