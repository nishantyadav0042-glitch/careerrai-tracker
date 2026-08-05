import { describe, it, expect } from 'vitest';

// Which sessions have their booking lock released.
//
// This is the sharp edge of "one live session per pair": a session nobody
// closes out holds the lock FOREVER. The database already had one from 21 July
// still marked `scheduled` — under the new rule that pair could never book
// again, and nobody would report it as "the lock is stuck". They would report
// "booking is broken".
//
// The window has to be generous. Releasing a session that is merely running
// long would cancel a call while the two people are on it.

const STALE_AFTER_HOURS = 6;

/** Mirrors the filter in /api/cron/release-stale-sessions. */
function isStale(session: { scheduledAt: string; durationMins: number; status: string }, now: number): boolean {
  if (!['scheduled', 'active'].includes(session.status)) return false;
  const end = Date.parse(session.scheduledAt) + session.durationMins * 60_000;
  return now - end > STALE_AFTER_HOURS * 3_600_000;
}

const NOW = Date.parse('2026-08-05T18:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe('a session nobody closed out stops blocking the pair', () => {
  it('releases the real 21 July row that was still live', () => {
    // The one this cron was written for.
    expect(isStale({ scheduledAt: '2026-07-21T13:30:00Z', durationMins: 30, status: 'scheduled' }, NOW)).toBe(true);
  });

  it('releases a session whose window ended well over the threshold ago', () => {
    expect(isStale({ scheduledAt: hoursAgo(9), durationMins: 30, status: 'scheduled' }, NOW)).toBe(true);
  });

  it('releases an "active" session too — a call left open holds the lock the same way', () => {
    expect(isStale({ scheduledAt: hoursAgo(9), durationMins: 30, status: 'active' }, NOW)).toBe(true);
  });
});

describe('a live session is never touched', () => {
  it('leaves an upcoming session alone', () => {
    expect(isStale({ scheduledAt: new Date(NOW + 3_600_000).toISOString(), durationMins: 30, status: 'scheduled' }, NOW)).toBe(false);
  });

  it('leaves a call happening right now alone', () => {
    expect(isStale({ scheduledAt: hoursAgo(0.25), durationMins: 60, status: 'active' }, NOW)).toBe(false);
  });

  it('leaves a call that ran long alone', () => {
    // Ended two hours ago. A mentor who has not closed it out yet is normal,
    // not stale — cancelling here would be cancelling someone's real session.
    expect(isStale({ scheduledAt: hoursAgo(3), durationMins: 60, status: 'scheduled' }, NOW)).toBe(false);
  });

  it('measures from the session\'s END, not its start', () => {
    // A 60-minute session starting 6.5h ago ended 5.5h ago — inside the window.
    // Measuring from the start would have released it while a long call could
    // still plausibly be wrapping up.
    expect(isStale({ scheduledAt: hoursAgo(6.5), durationMins: 60, status: 'scheduled' }, NOW)).toBe(false);
    expect(isStale({ scheduledAt: hoursAgo(7.5), durationMins: 60, status: 'scheduled' }, NOW)).toBe(true);
  });

  it('never re-touches something already closed out', () => {
    for (const status of ['completed', 'cancelled', 'expired']) {
      expect(isStale({ scheduledAt: hoursAgo(500), durationMins: 30, status }, NOW)).toBe(false);
    }
  });
});
