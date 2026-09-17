import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from './test-support/code-only';
import {
  computeCapacity, readHoursReality, shouldOfferHoursCorrection,
  OVERSTATE_RATIO, MIN_GAP_HOURS, OFFER_COOLDOWN_DAYS,
} from './capacity-engine';
import { MIN_DAILY_HOURS, MAX_DAILY_HOURS } from './daily-hours';

// ── THE GAP IS SHOWN TO THE STUDENT, NEVER APPLIED BEHIND THEM ──────────────
//
// Measured 16 Sep 2026 over the 804 students who have been given a routine:
// median claimed 5h/day, median actually reported by an active student 0.6h.
// The plan is not over-reaching — it is building the day the student asked
// for, and 413 of them personally confirmed that number.
//
// daily-hours.ts carries the standing rule that makes this delicate: the hours
// belong to the student and nothing may derive, cap or trim them. These tests
// exist to keep this module on the right side of that line. It may observe. It
// may propose. It must never write, and it must never decide.

const cap = (hours: number[], loggedDays: number, claimed: number | null) =>
  computeCapacity(hours, loggedDays, claimed);

describe('the gap is only read once there is behaviour to read', () => {
  it('says nothing about a student with too little history', () => {
    // Punishing a three-day-old account for having no history is the one thing
    // ruled out by name. Below the behaviour threshold we do not know them.
    const r = readHoursReality(cap([0.5, 0.5], 2, 6));
    expect(r.established).toBe(false);
    expect(r.direction).toBeNull();
    expect(r.suggestedHours).toBeNull();
  });

  it('says nothing when the student has logged only zero-hour days', () => {
    const r = readHoursReality(cap([0, 0, 0, 0, 0, 0], 6, 5));
    expect(r.established).toBe(false);
    expect(r.suggestedHours).toBeNull();
  });

  it('reads the gap once there are enough logged days', () => {
    const r = readHoursReality(cap([0.5, 0.6, 0.6, 0.5, 0.7], 5, 5));
    expect(r.established).toBe(true);
    expect(r.direction).toBe('over');
  });
});

describe('direction', () => {
  it('flags a student claiming far more than they do', () => {
    // The median case in production: 5h claimed, ~0.6h delivered.
    const r = readHoursReality(cap([0.5, 0.6, 0.6, 0.5, 0.7], 5, 5));
    expect(r.direction).toBe('over');
    expect(r.ratio).toBeGreaterThan(OVERSTATE_RATIO);
  });

  it('flags a student doing far MORE than they claimed', () => {
    // A capacity signal that can only revise downward is a permanent label,
    // not a planning input. The founder said it must recover.
    const r = readHoursReality(cap([3, 3, 3, 3, 3], 5, 1));
    expect(r.direction).toBe('under');
    expect(r.suggestedHours).toBe(3);
  });

  it('stays quiet when claim and behaviour roughly agree', () => {
    expect(readHoursReality(cap([2, 2, 2, 2, 2], 5, 2)).direction).toBe('matched');
    expect(readHoursReality(cap([2, 2, 2, 2, 2], 5, 3)).direction).toBe('matched');
  });

  it('needs BOTH a large ratio and a real absolute gap', () => {
    // 1h claimed against 0.5h observed is a 2x ratio but only half an hour of
    // daylight. Telling somebody to halve a one-hour plan is noise.
    const r = readHoursReality(cap([0.5, 0.5, 0.5, 0.5, 0.5], 5, 1));
    expect(Math.abs((r.claimedHours ?? 0) - (r.observedHours ?? 0))).toBeLessThan(MIN_GAP_HOURS);
    expect(r.direction).toBe('matched');
  });
});

describe('the proposal is the student\'s own number, not a formula', () => {
  it('proposes what they typically do, to the nearest half hour', () => {
    expect(readHoursReality(cap([0.6, 0.7, 0.6, 0.5, 0.6], 5, 6)).suggestedHours).toBe(0.5);
    expect(readHoursReality(cap([1.4, 1.6, 1.5, 1.5, 1.5], 5, 8)).suggestedHours).toBe(1.5);
  });

  it('is robust to a single heroic day', () => {
    // Median, not mean: one 9-hour Sunday must not redefine a student, in
    // either direction.
    const r = readHoursReality(cap([0.5, 0.5, 9, 0.5, 0.5], 5, 6));
    expect(r.suggestedHours).toBe(0.5);
  });

  it('never proposes a number outside what the student could pick', () => {
    const low = readHoursReality(cap([0.1, 0.1, 0.1, 0.1, 0.1], 5, 8));
    expect(low.suggestedHours ?? 0).toBeGreaterThanOrEqual(MIN_DAILY_HOURS);
    const high = readHoursReality(cap([20, 20, 20, 20, 20], 5, 1));
    expect(high.suggestedHours ?? 0).toBeLessThanOrEqual(MAX_DAILY_HOURS);
  });

  it('proposes nothing when there is nothing to change', () => {
    expect(readHoursReality(cap([2, 2, 2, 2, 2], 5, 2)).suggestedHours).toBeNull();
  });
});

describe('asking is a separate decision from knowing', () => {
  const over = readHoursReality(cap([0.5, 0.6, 0.6, 0.5, 0.7], 5, 5));
  const now = new Date('2026-09-16T10:00:00.000Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  it('offers when the gap is real and nothing was decided recently', () => {
    expect(shouldOfferHoursCorrection(over, { now })).toBe(true);
  });

  it('does not ask a student who just set their hours', () => {
    // They have answered. Asking again is not adaptation, it is pestering
    // somebody who already decided.
    expect(shouldOfferHoursCorrection(over, { hoursSetAt: daysAgo(3), now })).toBe(false);
  });

  it('does not ask a student who just dismissed it', () => {
    expect(shouldOfferHoursCorrection(over, { dismissedAt: daysAgo(2), now })).toBe(false);
  });

  it('asks again once the cooldown has genuinely passed', () => {
    expect(shouldOfferHoursCorrection(over, { hoursSetAt: daysAgo(OFFER_COOLDOWN_DAYS + 1), now })).toBe(true);
  });

  it('never asks a student we have no evidence about', () => {
    expect(shouldOfferHoursCorrection(readHoursReality(cap([0.5], 1, 6)), { now })).toBe(false);
  });

  it('survives a corrupt timestamp rather than blocking forever', () => {
    expect(shouldOfferHoursCorrection(over, { hoursSetAt: 'not-a-date', now })).toBe(true);
  });
});

describe('the engine still may not touch the student\'s number', () => {
  const engine = codeOnly(readFileSync(join(process.cwd(), 'src/lib/capacity-engine.ts'), 'utf8'));

  it('writes no profile column', () => {
    // daily-hours.ts: "nothing in this codebase may derive, cap, trim, round
    // toward behaviour, or otherwise improve it". setDailyHours is the only
    // writer, and it is only called from a request the student made.
    expect(engine).not.toMatch(/study_target_hours/);
    expect(engine).not.toMatch(/setDailyHours/);
    expect(engine).not.toMatch(/\.update\(|\.upsert\(|\.insert\(/);
  });

  it('keeps capBudget unwired — the plan is still sized by the student', () => {
    const callers = engine.split('\n')
      .filter((l) => /\bcapBudget\s*\(/.test(l) && !/export function capBudget\(/.test(l));
    expect(callers, 'wiring capBudget would size plans from behaviour behind the student').toEqual([]);
  });
});
