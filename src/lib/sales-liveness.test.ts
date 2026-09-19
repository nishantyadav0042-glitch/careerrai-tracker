import { describe, it, expect } from 'vitest';
import {
  alivenessBoost, livenessNote, ALIVE_DAYS, IN_ORBIT_DAYS, ALIVE_BOOST, IN_ORBIT_BOOST,
  NEVER_SEEN_PENALTY,
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
  // ── AMENDED 19 Sep 2026, NOT DELETED ──────────────────────────────────────
  //
  // This assertion used to read "never returns a negative", covering both a
  // student who went quiet AND one who never opened the app, because the
  // module treated them as the same thing. The founder separated them: "Not
  // the once never opened or tapped anything."
  //
  // The load-bearing half is kept exactly as it was and is the half that
  // matters: a student who HAS been present is never pushed down, however
  // long ago it was. 400 days quiet still scores zero, not a penalty. Only
  // the never-arrived case moved, and it has its own test below.
  it('never punishes a student who has ever been present', () => {
    for (const d of [0, 1, 7, 21, 60, 400]) expect(boost('fresh', daysAgo(d))).toBeGreaterThanOrEqual(0);
  });

  it('treats an UNREADABLE timestamp as no information', () => {
    // Deliberately still zero, and not the never-arrived penalty: a string
    // that failed to parse is missing DATA, not a missing student, and
    // sinking a real student on a bad value would be a data bug wearing a
    // policy. `undefined` is the absent case and is covered below.
    expect(boost('fresh', 'not-a-date')).toBe(0);
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

// ── NEVER ARRIVED IS NOT THE SAME AS WENT QUIET (founder, 19 Sep 2026) ──────
//
// "Not the once never opened or tapped anything." 72 of the one remaining
// rep's 1,006 live leads have never opened the app; everyone else has been
// present at least once.
describe('a student who never opened the app sorts last', () => {
  const now = Date.parse('2026-09-19T12:00:00.000Z');
  const at = (days: number) => new Date(now - days * 86_400_000).toISOString();

  it('ranks below a student who opened long ago and went quiet', () => {
    const neverArrived = alivenessBoost({ lane: 'fresh', lastSeenAt: null, nowMs: now });
    const wentQuiet = alivenessBoost({ lane: 'fresh', lastSeenAt: at(60), nowMs: now });
    expect(neverArrived).toBeLessThan(wentQuiet);
    expect(neverArrived).toBe(NEVER_SEEN_PENALTY);
  });

  it('keeps the full order: present > in orbit > quiet > never arrived', () => {
    const order = [at(1), at(14), at(60), null].map(
      (lastSeenAt) => alivenessBoost({ lane: 'fresh', lastSeenAt, nowMs: now }),
    );
    expect(order).toEqual([...order].sort((a, b) => b - a));
    expect(new Set(order).size).toBe(4);
  });

  it('never touches a promise', () => {
    // A promise is a promise whether they installed anything or not.
    for (const lane of ['callback', 'followup', 'retry', 'checkout_abandoned']) {
      expect(alivenessBoost({ lane, lastSeenAt: null, nowMs: now })).toBe(0);
    }
  });

  it('treats an unreadable timestamp as missing data, not as absence', () => {
    // Sinking a real student because a string failed to parse would be a
    // data bug wearing a policy.
    expect(alivenessBoost({ lane: 'fresh', lastSeenAt: 'not-a-date', nowMs: now })).toBe(0);
  });

  it('stays far inside its lane', () => {
    // going_cold's lane band sits at 4,000,000. This orders WITHIN a lane and
    // must never drag a card out of one.
    expect(Math.abs(NEVER_SEEN_PENALTY)).toBeLessThan(1_000_000);
  });
});

describe('absent is absent however it arrives', () => {
  it('treats undefined the same as null', () => {
    expect(boost('fresh', undefined as unknown as string)).toBe(NEVER_SEEN_PENALTY);
    expect(boost('fresh', null)).toBe(NEVER_SEEN_PENALTY);
  });
});
