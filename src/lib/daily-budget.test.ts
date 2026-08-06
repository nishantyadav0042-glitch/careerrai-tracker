import { describe, it, expect } from 'vitest';
import { computeCapacity, capBudget } from './capacity-engine';
import { MAX_HUMAN_HOURS_PER_DAY } from './plan-breach';

// How many hours of work today's plan is built to.
//
// "Bhaiya 11 hr ka plan bnwayi hu aur sirf 4 hr ka task milta hai?" — Abhishek,
// 6 Aug. Two separate things were wrong and they pulled in opposite directions:
//
//   · the DATE demanded 12 hrs/day (syllabus finished by 31 Aug), and that
//     number was fed in as the proposed daily budget
//   · capacity then correctly trimmed it to what he actually sustains
//
// So the plan was right and completely unexplained. He set 11, saw 4, and
// concluded the app was broken. These tests pin both ceilings and, above all,
// that the number is never silently different from what the student asked for.

/** Mirrors humanCap() in /api/routine/today. */
const humanCap = (h: number | null): number | null =>
  h == null ? null : Math.min(h, MAX_HUMAN_HOURS_PER_DAY);

/** The full chain the route runs: date-driven pace -> human ceiling -> capacity. */
function dailyBudget(paceHours: number | null, claimedHours: number | null, recentStudyHours: number[]) {
  const capacity = computeCapacity(recentStudyHours, recentStudyHours.length, claimedHours);
  return capBudget(humanCap(paceHours ?? claimedHours), capacity);
}

describe('a date can never build an inhuman task list', () => {
  it('caps a 12 hrs/day requirement before it becomes tasks', () => {
    // Abhishek's real numbers: 25 days to clear the syllabus -> 12 hrs/day.
    // Without the ceiling that produced a twelve-hour list nobody finishes.
    const budget = dailyBudget(12, 11, []);
    expect(budget).toBeLessThanOrEqual(MAX_HUMAN_HOURS_PER_DAY);
  });

  it('leaves a realistic requirement alone', () => {
    // The cap must not quietly shrink students whose plan is already sane.
    expect(dailyBudget(4, 6, [])).toBe(4);
  });

  it('caps the claim too, not just the pace', () => {
    // A student who types 14 into onboarding is just as wrong as a date that
    // demands 14 — and gets the same ceiling.
    expect(dailyBudget(null, 14, [])).toBe(MAX_HUMAN_HOURS_PER_DAY);
  });
});

describe('behaviour still wins once we have enough of it', () => {
  it('sizes the day to what this student actually finishes', () => {
    // Nine logged days averaging ~4.8h. The plan should be ~5h, not 8, and
    // certainly not 12.
    const logs = [5, 4.5, 5, 4, 6, 5, 4.5, 5, 5];
    const budget = dailyBudget(12, 11, logs);
    expect(budget).toBeGreaterThan(3);
    expect(budget).toBeLessThanOrEqual(6);
  });

  it('trusts a new student rather than starving their first days', () => {
    // Under MIN_DAYS_FOR_BEHAVIOUR there is nothing to learn from, so the
    // stated hours stand — capped, but not second-guessed.
    expect(dailyBudget(null, 6, [6, 5])).toBe(6);
  });

  it('never plans ABOVE what the student said they can do', () => {
    // Even a student who occasionally does 9 keeps the plan at their claim.
    const logs = [9, 8, 9, 8, 9, 9, 8];
    expect(dailyBudget(12, 5, logs)!).toBeLessThanOrEqual(5);
  });
});

describe('the student is told when the number differs from their own', () => {
  // The whole complaint. Trimming is correct; trimming SILENTLY is what made a
  // working feature read as a bug.
  const trimmed = (claimed: number | null, hours: number) =>
    claimed != null && hours < claimed - 0.25;

  it('flags a trim the student would notice', () => {
    expect(trimmed(11, 5)).toBe(true);
  });

  it('stays silent when the plan matches what they asked for', () => {
    expect(trimmed(5, 5)).toBe(false);
  });

  it('does not nag over a rounding-sized difference', () => {
    // 5 vs 4.9 is not worth a sentence on the card every single day.
    expect(trimmed(5, 4.9)).toBe(false);
  });

  it('says nothing when there is no claim to compare against', () => {
    expect(trimmed(null, 4)).toBe(false);
  });
});
