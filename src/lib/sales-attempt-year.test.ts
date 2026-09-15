import { describe, it, expect } from 'vitest';
import { attemptYearBoost, attemptYearNote, CURRENT_ATTEMPT_YEAR } from './sales-attempt-year';

const boost = (lane: string, attemptYear: number | null) => attemptYearBoost({ lane, attemptYear });

describe('this year’s calls go to this year’s students', () => {
  it('lifts a current-year aspirant in the lanes we choose', () => {
    expect(boost('fresh', 2026)).toBeGreaterThan(0);
    expect(boost('rotation', 2026)).toBeGreaterThan(0);
    expect(boost('attention', 2026)).toBeGreaterThan(0);
  });

  it('moves a future-year aspirant down, never out', () => {
    // 201 real students. Their exam is next year; they are not failing.
    expect(boost('fresh', 2027)).toBeLessThan(0);
    expect(boost('fresh', 2027)).toBeGreaterThan(-1_000_000);
  });

  it('leaves an unanswered year in the middle, not at the bottom', () => {
    // 299 students never answered. That is a missing answer, not a verdict —
    // and the first real conversation is what settles it.
    expect(boost('fresh', null)).toBe(0);
    expect(boost('fresh', null)).toBeGreaterThan(boost('fresh', 2027));
    expect(boost('fresh', null)).toBeLessThan(boost('fresh', 2026));
  });
});

// ── THE LINE THIS MUST NOT CROSS ────────────────────────────────────────────
//
// A callback owed to a 2027 student is owed exactly as much as one owed to a
// 2026 student. Reordering commitments by how commercially interesting someone
// is, is the precise thing SALES-OS §0 forbids.
describe('a promise is never reordered by how useful the student is', () => {
  it.each(['callback', 'retry', 'followup', 'checkout_abandoned', 'conversion'])(
    '%s is untouched whatever the attempt year', (lane) => {
      expect(boost(lane, 2026)).toBe(0);
      expect(boost(lane, 2027)).toBe(0);
      expect(boost(lane, null)).toBe(0);
    });

  it('stays small enough that a slipping student still outranks a cold one', () => {
    // going_cold sits at 4,000,000; rotation at 100,000. This decides order
    // WITHIN a lane, never which lane someone is in.
    expect(Math.abs(boost('fresh', 2027))).toBeLessThan(100_000);
  });
});

describe('the card says why', () => {
  it('flags a future-year student in the counsellor’s words', () => {
    expect(attemptYearNote(2027)).toBe('Sitting CAT 2027, not this year');
  });

  it('turns an unanswered year into the first question to ask', () => {
    expect(attemptYearNote(null)).toContain('worth asking first');
  });

  it('says nothing about a current-year student — there is nothing to flag', () => {
    expect(attemptYearNote(CURRENT_ATTEMPT_YEAR)).toBeNull();
  });
});
