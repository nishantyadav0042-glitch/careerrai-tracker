import { describe, it, expect } from 'vitest';
import {
  OUTCOME_OPTIONS, BLOCKER_REASONS, VALID_BLOCKER_REASONS, VALID_DAY_OUTCOMES,
  isDayOutcome, isBlockerReason, outcomeAsksWhy,
} from './check-in';

// The check-in is the highest-leverage screen in the product: it is the only
// place a student tells us why a day did not happen. These tests defend the
// two properties that make it work — every option is answerable, and every
// answer the UI can produce is one the server will accept.

describe('the four outcomes', () => {
  it('offers exactly the four states a real day has', () => {
    expect(OUTCOME_OPTIONS.map((o) => o.id)).toEqual(['studied', 'partial', 'not_studied', 'skipped']);
  });

  it('gives every option a label and a subtitle a student can act on', () => {
    for (const o of OUTCOME_OPTIONS) {
      expect(o.label.length, `${o.id} label`).toBeGreaterThan(2);
      expect(o.sub.length, `${o.id} subtitle`).toBeGreaterThan(5);
      expect(o.emoji.length).toBeGreaterThan(0);
    }
  });

  it('asks WHY on the two answers that carry a reason', () => {
    // 'partial' asks as well as 'not_studied' on purpose: someone who sat down
    // and did not finish is telling us the PLAN is wrong, which is the most
    // actionable signal in the whole product.
    expect(outcomeAsksWhy('not_studied')).toBe(true);
    expect(outcomeAsksWhy('partial')).toBe(true);
    // A good day and a planned rest day need no interrogation.
    expect(outcomeAsksWhy('studied')).toBe(false);
    expect(outcomeAsksWhy('skipped')).toBe(false);
  });

  it('validates outcomes, and rejects anything invented', () => {
    for (const o of VALID_DAY_OUTCOMES) expect(isDayOutcome(o)).toBe(true);
    expect(isDayOutcome('studied_a_lot')).toBe(false);
    expect(isDayOutcome('')).toBe(false);
    expect(isDayOutcome(null)).toBe(false);
  });
});

describe('the blocker reasons', () => {
  it('includes the one that indicts us, not the student', () => {
    // "Didn't know what to study" is the answer that means the PRODUCT failed.
    // It must always be offerable, or we only ever learn about students' lives
    // and never about our own plan.
    expect(BLOCKER_REASONS.map((r) => r.value)).toContain('unclear_what_to_study');
    expect(BLOCKER_REASONS.map((r) => r.value)).toContain('plan_too_heavy');
  });

  it('accepts every reason the UI can produce', () => {
    // The exact failure this prevents: a value offered by a button that the
    // server silently drops, so the student answers and we record nothing.
    for (const r of BLOCKER_REASONS) {
      expect(isBlockerReason(r.value), `${r.value} must be accepted server-side`).toBe(true);
    }
  });

  it('still accepts values retired from the UI but present in old rows', () => {
    // Never reject a value we ourselves once wrote.
    expect(isBlockerReason('procrastination')).toBe(true);
    expect(BLOCKER_REASONS.map((r) => r.value)).not.toContain('procrastination');
  });

  it('rejects anything not on the list', () => {
    expect(isBlockerReason('because')).toBe(false);
    expect(isBlockerReason('')).toBe(false);
    expect(isBlockerReason(undefined)).toBe(false);
  });

  it('has no duplicate values and no empty labels', () => {
    const values = BLOCKER_REASONS.map((r) => r.value);
    expect(new Set(values).size).toBe(values.length);
    for (const r of BLOCKER_REASONS) expect(r.label.trim().length).toBeGreaterThan(1);
  });

  it('leads with the most common answers, so the usual case is the first tap', () => {
    expect(BLOCKER_REASONS[0].value).toBe('office');
    expect(BLOCKER_REASONS[1].value).toBe('college');
  });
});

describe('nothing in the check-in reads as a demand', () => {
  it('never uses shaming or admin language', () => {
    const copy = [
      ...OUTCOME_OPTIONS.flatMap((o) => [o.label, o.sub]),
      ...BLOCKER_REASONS.map((r) => r.label),
    ].join(' ').toLowerCase();
    for (const banned of ['must', 'required', 'mandatory', 'failed', 'missed', 'lazy', 'excuse']) {
      expect(copy, `copy contains "${banned}"`).not.toContain(banned);
    }
  });
});
