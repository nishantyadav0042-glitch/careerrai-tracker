import { describe, it, expect } from 'vitest';
import {
  alivenessBoost, livenessNote, ALIVE_DAYS, IN_ORBIT_DAYS, ALIVE_BOOST, IN_ORBIT_BOOST,
} from './sales-liveness';

const NOW = Date.parse('2026-09-15T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const boost = (lane: string, lastSeenAt: string | null) => alivenessBoost({ lane, lastSeenAt, nowMs: NOW });

// The whole point: of 401 CAT-2026 students never called, 15 were in the app
// this week and 220 had opened once and never come back. The fresh lane ranked
// them identically, because its only recency signal was daysSinceLastLog —
// logging — and neither group logs.
describe('a student who is in the app outranks one who is gone', () => {
  it('lifts the student seen this week', () => {
    expect(boost('fresh', daysAgo(1))).toBe(ALIVE_BOOST);
    expect(boost('fresh', daysAgo(ALIVE_DAYS))).toBe(ALIVE_BOOST);
  });

  it('lifts the student still in orbit, by less', () => {
    expect(boost('fresh', daysAgo(ALIVE_DAYS + 1))).toBe(IN_ORBIT_BOOST);
    expect(boost('fresh', daysAgo(IN_ORBIT_DAYS))).toBe(IN_ORBIT_BOOST);
    expect(IN_ORBIT_BOOST).toBeLessThan(ALIVE_BOOST);
  });

  it('ranks T1 above T2 above T4', () => {
    const t1 = boost('fresh', daysAgo(2));
    const t2 = boost('fresh', daysAgo(14));
    const t4 = boost('fresh', daysAgo(40));
    expect(t1).toBeGreaterThan(t2);
    expect(t2).toBeGreaterThan(t4);
  });
});

// Being unreachable is not a fault, and a student who went quiet is exactly
// who retention is for. They are simply not the cheapest conversation today.
describe('it lifts the present, it never punishes the quiet', () => {
  it('never returns a negative', () => {
    for (const d of [0, 1, 7, 21, 60, 400]) expect(boost('fresh', daysAgo(d))).toBeGreaterThanOrEqual(0);
    expect(boost('fresh', null)).toBe(0);
  });

  it('treats an unreadable or missing timestamp as no information', () => {
    expect(boost('fresh', 'not-a-date')).toBe(0);
    expect(boost('fresh', undefined as unknown as string)).toBe(0);
  });

  it('does not let clock skew demote somebody', () => {
    expect(boost('fresh', new Date(NOW + 3600_000).toISOString())).toBe(ALIVE_BOOST);
  });
});

describe('a promise is not reordered by whether they opened the app', () => {
  it.each(['callback', 'retry', 'followup', 'checkout_abandoned', 'conversion'])(
    '%s is untouched', (lane) => {
      expect(boost(lane, daysAgo(1))).toBe(0);
      expect(boost(lane, daysAgo(90))).toBe(0);
    });

  it('stays inside its lane — a slipping student still outranks a present stranger', () => {
    // going_cold sits at 4,000,000. This may order within a lane, never across.
    expect(ALIVE_BOOST).toBeLessThan(100_000);
  });
});

describe('the card tells the counsellor what they are walking into', () => {
  it('says when they were last in the app', () => {
    expect(livenessNote(daysAgo(0), NOW)).toBe('In the app today');
    expect(livenessNote(daysAgo(1), NOW)).toBe('In the app 1 day ago');
    expect(livenessNote(daysAgo(3), NOW)).toBe('In the app 3 days ago');
    expect(livenessNote(daysAgo(14), NOW)).toContain('Last opened the app 14 days ago');
  });

  it('says nothing rather than guessing', () => {
    expect(livenessNote(null, NOW)).toBeNull();
    expect(livenessNote(daysAgo(90), NOW)).toBeNull();
  });
});
