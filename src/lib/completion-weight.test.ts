import { describe, it, expect } from 'vitest';
import { completionWeight, weightedCompletedForDay, HALF_TICK_SIGNAL } from '@/lib/completion-portion';

// ── A half-tick is half a finished task, everywhere it is counted ───────────
//
// The plan-completion ratio counted DATABASE ROWS: a half-tick and a finished
// task both contributed 1.0, so a student who got halfway through every task
// showed as finishing 100% of the plan. That ratio feeds the founder-facing
// "finishes ~X% of the plan", lis-health, student-360, and -- the reason this
// is not cosmetic -- HEAVY_COMPLETION_RATIO, which decides whether a student's
// plan is adapted as too heavy.
//
// completion-portion.ts already ruled that a half-tick is PARTIAL (it is why a
// half-tick no longer closes the day). The ratio simply never asked it. The
// weight function lives here, next to portionOf, so there is exactly one place
// that decides what a half-tick is worth.

describe('completionWeight', () => {
  it('a full tick is worth a whole task', () => {
    expect(completionWeight('green')).toBe(1);
    expect(completionWeight(null)).toBe(1);
    expect(completionWeight(undefined)).toBe(1);
  });

  it('a half tick is worth half', () => {
    expect(completionWeight(HALF_TICK_SIGNAL)).toBe(0.5);
    expect(completionWeight('blue')).toBe(0.5);
  });

  it('derives from portionOf rather than re-deciding', () => {
    // Any confidence that is not the half-tick signal is a full tick, which is
    // portionOf's rule. A second opinion here is the defect this file prevents.
    for (const c of ['green', 'yellow', 'red', '', 'anything']) {
      expect(completionWeight(c)).toBe(1);
    }
  });
});

describe('weightedCompletedForDay', () => {
  const row = (task_id: string, confidence?: string | null) => ({ task_id, confidence });

  it('is zero when nothing was ticked', () => {
    expect(weightedCompletedForDay([], 4)).toBe(0);
  });

  it('counts full ticks exactly as before — no change for most students', () => {
    expect(weightedCompletedForDay([row('a'), row('b'), row('c')], 4)).toBe(3);
  });

  it('counts a half tick as 0.5', () => {
    expect(weightedCompletedForDay([row('a', 'blue')], 4)).toBe(0.5);
  });

  it('mixes 0 / 0.5 / 1 correctly', () => {
    // two full, one half, one untouched, out of four planned
    expect(weightedCompletedForDay([row('a'), row('b'), row('c', 'blue')], 4)).toBe(2.5);
  });

  it('a fully half-ticked plan is half done, not fully done', () => {
    const rows = ['a', 'b', 'c', 'd'].map((t) => row(t, 'blue'));
    expect(weightedCompletedForDay(rows, 4)).toBe(2);
  });

  it('never double-counts a task with duplicate rows', () => {
    // The old code used a Set of task_id for exactly this reason; the weighted
    // version must keep that property or a retick inflates the ratio.
    expect(weightedCompletedForDay([row('a'), row('a'), row('a')], 4)).toBe(1);
  });

  it('takes the strongest evidence when one task has conflicting rows', () => {
    // A half row and a full row for the same task means the task was finished.
    expect(weightedCompletedForDay([row('a', 'blue'), row('a', 'green')], 4)).toBe(1);
    expect(weightedCompletedForDay([row('a', 'green'), row('a', 'blue')], 4)).toBe(1);
  });

  it('caps at the day’s planned count, as the old code did', () => {
    // A regenerated routine can leave completions for tasks no longer planned;
    // the ratio must never exceed 100%.
    expect(weightedCompletedForDay([row('a'), row('b'), row('c')], 2)).toBe(2);
  });

  it('a zero-task day contributes nothing', () => {
    expect(weightedCompletedForDay([row('a')], 0)).toBe(0);
  });
});
