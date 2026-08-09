import { describe, it, expect } from 'vitest';
import { creditedHours } from './study-credit';

describe('hours are credited from coverage, never self-reported', () => {
  it('completing the whole plan earns the full day', () => {
    expect(creditedHours({ generatedHours: 11, plannedTasks: 3, fullDone: 3, halfDone: 0, offPlanCount: 0 })).toBe(11);
  });

  it('half the plan earns half the hours (rounded to 0.1)', () => {
    // (1 full + 1 half) / 3 = 0.5 → 11 × 0.5 = 5.5
    expect(creditedHours({ generatedHours: 11, plannedTasks: 3, fullDone: 1, halfDone: 1, offPlanCount: 0 })).toBe(5.5);
  });

  it('off-plan topics count as coverage — the Abhishek pattern is no longer 0', () => {
    // He marked "studied" + 3 off-plan sections but no plan tasks. Under the old
    // hours field this saved 0h and moved his date. Now: 3/3 → full credit.
    expect(creditedHours({ generatedHours: 11, plannedTasks: 3, fullDone: 0, halfDone: 0, offPlanCount: 3 })).toBe(11);
  });

  it('coverage is capped at the plan — extra work cannot inflate the day', () => {
    expect(creditedHours({ generatedHours: 11, plannedTasks: 3, fullDone: 3, halfDone: 0, offPlanCount: 5 })).toBe(11);
  });

  it('a day with no plan credits 0 — nothing syllabus to price', () => {
    expect(creditedHours({ generatedHours: 0, plannedTasks: 0, fullDone: 0, halfDone: 0, offPlanCount: 2 })).toBe(0);
  });

  it('nothing covered credits 0', () => {
    expect(creditedHours({ generatedHours: 11, plannedTasks: 3, fullDone: 0, halfDone: 0, offPlanCount: 0 })).toBe(0);
  });
});
