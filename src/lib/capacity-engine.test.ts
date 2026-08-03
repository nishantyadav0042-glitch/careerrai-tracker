import { describe, it, expect } from 'vitest';
import { computeCapacity, capBudget } from './capacity-engine';

// This file exists because of one line: `const behaviour = typical ?? 0.5`.
//
// It invented half an hour of capacity for a student we had never seen study.
// capBudget takes min(pace, sustainable), so that invented 0.5h beat a real 9h
// requirement, and routine-engine's `Math.max(30, hours * 60)` floored the day
// at exactly 30 minutes — the 12m + 9m + 9m a student sent us a screenshot of.
//
// He had marked VARC, DILR and QA as studied and skipped the OPTIONAL hours
// field. LoggingModal sends `hours ?? 0`, so "didn't say" was stored as "zero",
// and we read those zeros as proof he studies nothing. Twenty-eight such days
// exist across twenty students.
//
// The rule these tests pin: WE ONLY PLAN BELOW SOMEONE'S CLAIM WHEN WE CAN
// NAME THE DAYS THAT JUSTIFY IT. Absent evidence, trust what they told us.

describe('no positive evidence → trust the claim, never invent a number', () => {
  it('does not shrink the plan when every logged day has no hours', () => {
    // The exact production shape: 6 logged days, none with hours, claimed 10h.
    const c = computeCapacity([0, 0, 0, 0, 0, 0], 6, 10);
    expect(c.sustainableHours).toBe(10);
    expect(c.trust).toBe('input');
    // The old behaviour — and the whole bug — was this being 0.5.
    expect(c.sustainableHours).not.toBe(0.5);
  });

  it('leaves a 9h requirement intact instead of capping it to half an hour', () => {
    const c = computeCapacity([0, 0, 0, 0, 0, 0], 6, 10);
    expect(capBudget(9, c)).toBe(9);
  });

  it('says WHY in the note, without blaming the student', () => {
    const c = computeCapacity([0, 0, 0, 0, 0], 5, 10);
    expect(c.note).toContain('No day with hours recorded');
    expect(c.note).not.toMatch(/lazy|failed|didn.t study/i);
  });

  it('agrees with the too-early branch — both trust the claim', () => {
    const early = computeCapacity([0, 0], 2, 8);         // under MIN_DAYS
    const noEvidence = computeCapacity([0, 0, 0, 0, 0, 0], 6, 8); // over it
    expect(early.sustainableHours).toBe(noEvidence.sustainableHours);
    expect(early.trust).toBe(noEvidence.trust);
  });

  it('returns null hours, not 0.5, when there is nothing to report', () => {
    expect(computeCapacity([0, 0, 0, 0, 0, 0], 6, 4).typicalStudyHours).toBeNull();
  });
});

describe('real evidence still caps the plan — the protection is intact', () => {
  it('believes behaviour over an inflated claim', () => {
    // Says 10h, actually does ~2h. Planning 10h would guarantee failure.
    const c = computeCapacity([2, 2, 2, 2, 2, 2], 6, 10);
    expect(c.sustainableHours).toBe(2);
    expect(c.trust).toBe('behaviour');
    expect(capBudget(9, c)).toBe(2);
  });

  it('never plans ABOVE the claim, even when behaviour is higher', () => {
    const c = computeCapacity([8, 8, 8, 8, 8, 8], 6, 3);
    expect(c.sustainableHours).toBe(3);
  });

  it('ignores the zero days when real ones exist', () => {
    // Mixed week: the zeros are unknowns, the 4s are the evidence.
    const c = computeCapacity([0, 4, 0, 4, 0, 4], 6, 10);
    expect(c.sustainableHours).toBe(4);
  });

  it('falls back to behaviour when no claim was ever entered', () => {
    const c = computeCapacity([3, 3, 3, 3, 3, 3], 6, null);
    expect(c.sustainableHours).toBe(3);
  });
});

describe('capBudget', () => {
  it('only ever trims down', () => {
    const c = computeCapacity([2, 2, 2, 2, 2, 2], 6, 10);
    expect(capBudget(1, c)).toBe(1);
    expect(capBudget(9, c)).toBe(2);
  });

  it('leaves the budget untouched when capacity is unknown', () => {
    const c = computeCapacity([0, 0, 0, 0, 0, 0], 6, null);
    expect(c.sustainableHours).toBeNull();
    expect(capBudget(9, c)).toBe(9);
  });
});

describe('the student can overrule us — plan_sizing = full', () => {
  it('ignores the behavioural cap when the student asked for their full plan', () => {
    // Claimed 10h, has been doing 2h. Adaptive protects them; full is their
    // explicit "no, plan the 9h" — a fortnight of 2h must not become a ceiling.
    const c = computeCapacity([2, 2, 2, 2, 2, 2], 6, 10);
    expect(capBudget(9, c, 'adaptive')).toBe(2);
    expect(capBudget(9, c, 'full')).toBe(9);
  });

  it('defaults to adaptive, so no existing caller changes behaviour', () => {
    const c = computeCapacity([2, 2, 2, 2, 2, 2], 6, 10);
    expect(capBudget(9, c)).toBe(capBudget(9, c, 'adaptive'));
  });

  it('full still returns null when there is no proposal to size', () => {
    const c = computeCapacity([2, 2, 2, 2, 2, 2], 6, 10);
    expect(capBudget(null, c, 'full')).toBeNull();
  });
});
