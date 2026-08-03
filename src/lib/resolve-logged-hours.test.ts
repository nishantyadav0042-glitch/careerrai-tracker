import { describe, it, expect } from 'vitest';
import { resolveLoggedHours } from './resolve-logged-hours';

describe('silence is not a zero — the bug this exists to end', () => {
  it('preserves earned hours when the student left the row alone', () => {
    // Abhishek, 30 Jul: completed a 9-hour plan, then opened the log and
    // submitted without touching hours. The old path wrote 0 over the 9.
    expect(resolveLoggedHours(null, 9)).toBe(9);
    expect(resolveLoggedHours(undefined, 9)).toBe(9);
  });

  it('treats an untouched field as unchanged even when nothing is recorded yet', () => {
    expect(resolveLoggedHours(null, 0)).toBe(0);
    expect(resolveLoggedHours(null, null)).toBe(0);
  });

  it('never lets an unstated value lower an existing one', () => {
    for (const existing of [1, 2, 6, 9, 10]) {
      expect(resolveLoggedHours(null, existing)).toBe(existing);
    }
  });
});

describe('a stated number is the student’s word', () => {
  it('honours it, including an explicit rest day', () => {
    // Distinct from null: they looked at the row and said zero.
    expect(resolveLoggedHours(0, 0)).toBe(0);
  });

  it('allows a correction DOWNWARD — no one-way ratchet', () => {
    // A mis-tapped 9h must be fixable. Math.max(stated, existing) would make it
    // permanent, which is its own kind of lying about the student.
    expect(resolveLoggedHours(2, 9)).toBe(2);
  });

  it('allows an explicit zero to overwrite a mistake', () => {
    expect(resolveLoggedHours(0, 6)).toBe(0);
  });

  it('takes a stated increase', () => {
    expect(resolveLoggedHours(8, 3)).toBe(8);
  });
});

describe('junk in, sane out', () => {
  it('treats NaN as "didn’t say" rather than writing NaN into a NOT NULL column', () => {
    expect(resolveLoggedHours(Number.NaN, 5)).toBe(5);
    expect(resolveLoggedHours(Number.POSITIVE_INFINITY, 5)).toBe(5);
  });

  it('never returns a negative', () => {
    expect(resolveLoggedHours(-3, 4)).toBe(0);
    expect(resolveLoggedHours(null, -2)).toBe(0);
  });

  it('rounds to whole hours, matching the integer RPC parameter', () => {
    // upsert_log_and_streak takes p_study_duration integer.
    expect(resolveLoggedHours(2.4, 0)).toBe(2);
    expect(resolveLoggedHours(null, 6.6)).toBe(7);
    expect(Number.isInteger(resolveLoggedHours(3.7, 1))).toBe(true);
  });
});
