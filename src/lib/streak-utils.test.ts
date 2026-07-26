import { describe, it, expect } from 'vitest';
import {
  isStreakActive, liveStreak, daysSinceLastLog, momentumStreak,
  getLogDateString, MS_PER_DAY,
} from './streak-utils';
import { studyDayString } from './study-day';

// The streak is the most-looked-at number in the product and the one that has
// broken most often. Two incidents are encoded here:
//
//  1. 20 July — isStreakActive used local-time setHours(). On Vercel (UTC),
//     "today" began at 5:30 AM IST and ignored the 3 AM boundary entirely.
//  2. 20 July — the admin sales queue showed a "7-day streak" badge for a
//     student who had not logged in two days, because streak_data.current_streak
//     is written at log time and never decays. Every DISPLAY must go through
//     liveStreak.

const ist = (s: string) => new Date(`${s}+05:30`);
const NOW = ist('2026-07-26T12:00:00');   // a normal afternoon
const TODAY = '2026-07-26';
const YESTERDAY = '2026-07-25';

describe('the streak day key is the study day, not the calendar day', () => {
  it('delegates to studyDayString so there is exactly one rule', () => {
    for (const t of ['02:00:00', '04:00:00', '12:00:00', '23:30:00']) {
      const d = ist(`2026-07-26T${t}`);
      expect(getLogDateString(d)).toBe(studyDayString(d));
    }
  });
});

describe('isStreakActive', () => {
  it('is active when the last log was today', () => {
    expect(isStreakActive(TODAY, NOW)).toBe(true);
  });

  it('is active when the last log was yesterday — the day is not over yet', () => {
    expect(isStreakActive(YESTERDAY, NOW)).toBe(true);
  });

  it('is broken at two days', () => {
    expect(isStreakActive('2026-07-24', NOW)).toBe(false);
  });

  it('is not active with no log at all', () => {
    expect(isStreakActive(null, NOW)).toBe(false);
  });

  it('respects the 3am boundary rather than UTC midnight (the 20 July bug)', () => {
    // 02:00 IST on 26 Jul is still study-day 25 Jul, so a log stamped 25 Jul
    // is TODAY's log, not yesterday's — and a 24 Jul log is still alive.
    const lateNight = ist('2026-07-26T02:00:00');
    expect(isStreakActive('2026-07-25', lateNight)).toBe(true);
    expect(isStreakActive('2026-07-24', lateNight)).toBe(true);
    expect(isStreakActive('2026-07-23', lateNight)).toBe(false);
  });

  it('works across a month boundary', () => {
    expect(isStreakActive('2026-07-31', ist('2026-08-01T12:00:00'))).toBe(true);
    expect(isStreakActive('2026-07-30', ist('2026-08-01T12:00:00'))).toBe(false);
  });
});

describe('liveStreak — a stored streak is not a current streak', () => {
  it('shows the stored streak while it is still alive', () => {
    expect(liveStreak(7, TODAY, NOW)).toBe(7);
    expect(liveStreak(7, YESTERDAY, NOW)).toBe(7);
  });

  it('shows 0 for a stale streak (the admin "7-day streak" contradiction)', () => {
    expect(liveStreak(7, '2026-07-24', NOW)).toBe(0);
    expect(liveStreak(30, '2026-06-01', NOW)).toBe(0);
  });

  it('shows 0 when there is no streak or no log', () => {
    expect(liveStreak(0, TODAY, NOW)).toBe(0);
    expect(liveStreak(null, TODAY, NOW)).toBe(0);
    expect(liveStreak(7, null, NOW)).toBe(0);
    expect(liveStreak(undefined, undefined, NOW)).toBe(0);
  });

  it('never invents a streak the stored value does not support', () => {
    for (const stored of [0, 1, 5, 100]) {
      expect(liveStreak(stored, TODAY, NOW)).toBeLessThanOrEqual(stored);
    }
  });
});

describe('daysSinceLastLog', () => {
  it('counts whole study days', () => {
    expect(daysSinceLastLog(TODAY, NOW)).toBe(0);
    expect(daysSinceLastLog(YESTERDAY, NOW)).toBe(1);
    expect(daysSinceLastLog('2026-07-19', NOW)).toBe(7);
  });

  it('returns null rather than 0 when nothing was ever logged', () => {
    expect(daysSinceLastLog(null, NOW)).toBeNull();
    expect(daysSinceLastLog(undefined, NOW)).toBeNull();
  });

  it('never returns a negative number for a future-dated log', () => {
    expect(daysSinceLastLog('2026-07-30', NOW)).toBe(0);
  });

  it('agrees with the raw day arithmetic', () => {
    const days = 12;
    const past = new Date(Date.parse(`${TODAY}T00:00:00Z`) - days * MS_PER_DAY)
      .toISOString().slice(0, 10);
    expect(daysSinceLastLog(past, NOW)).toBe(days);
  });
});

describe('momentumStreak — streaks break visibly, and are restored by hand', () => {
  it('is unbroken when logged today', () => {
    const m = momentumStreak(10, 2, TODAY, NOW);
    expect(m.broken).toBe(false);
    expect(m.streak).toBe(10);
    expect(m.canRestore).toBe(false);
  });

  it('is unbroken when logged yesterday — today is still loggable', () => {
    const m = momentumStreak(10, 2, YESTERDAY, NOW);
    expect(m.broken).toBe(false);
    expect(m.streak).toBe(10);
  });

  it('breaks after a full missed day and offers restore when a shield is held', () => {
    const m = momentumStreak(10, 2, '2026-07-24', NOW);
    expect(m.broken).toBe(true);
    expect(m.streak).toBe(0);          // shown as broken...
    expect(m.restorable).toBe(10);     // ...but recoverable to its old value
    expect(m.canRestore).toBe(true);
    expect(m.missedDays).toBe(1);
  });

  it('breaks without a restore option when no shields are held', () => {
    const m = momentumStreak(10, 0, '2026-07-24', NOW);
    expect(m.broken).toBe(true);
    expect(m.canRestore).toBe(false);
  });

  it('never auto-consumes a shield — shields survive the break', () => {
    const m = momentumStreak(10, 3, '2026-07-20', NOW);
    expect(m.shields).toBe(3);
    expect(m.shieldsUsed).toBe(0);
    expect(m.decayed).toBe(0);
  });

  it('has nothing to break when there is no streak yet', () => {
    const m = momentumStreak(0, 3, null, NOW);
    expect(m.broken).toBe(false);
    expect(m.streak).toBe(0);
    expect(m.canRestore).toBe(false);
  });

  it('never reports a negative streak or negative missed days', () => {
    for (const last of [TODAY, YESTERDAY, '2026-07-01', null]) {
      const m = momentumStreak(-5, 1, last, NOW);
      expect(m.streak).toBeGreaterThanOrEqual(0);
      expect(m.missedDays).toBeGreaterThanOrEqual(0);
    }
  });

  it('agrees with liveStreak about whether the streak is alive', () => {
    for (const last of [TODAY, YESTERDAY, '2026-07-24', '2026-07-01']) {
      const m = momentumStreak(9, 1, last, NOW);
      const live = liveStreak(9, last, NOW);
      expect(m.broken).toBe(live === 0);
    }
  });
});
