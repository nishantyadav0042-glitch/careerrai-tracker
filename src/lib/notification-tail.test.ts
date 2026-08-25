import { describe, it, expect } from 'vitest';
import { tailPicture, type PushRow } from './notification-tail';

// NOTIFICATION-OS §8: the tail is the metric that matters more than delivery.
// §0: the KPI is notifications that cause STUDYING. #22: a tap that changes no
// behaviour is a vanity success.
//
// These tests protect the one thing that makes the tail worth measuring: that
// it never quietly becomes a causal claim.

const logs = (m: Record<string, string[]>) =>
  new Map(Object.entries(m).map(([k, v]) => [k, new Set(v)]));

const push = (userId: string, day: string, clicked = false): PushRow => ({ userId, day, clicked });

describe('the tail counts what happened after a push', () => {
  it('counts same-day and next-day logging separately', () => {
    const rows = [
      ...Array.from({ length: 10 }, () => push('a', '2026-08-20')),
      ...Array.from({ length: 10 }, () => push('b', '2026-08-20')),
    ];
    const p = tailPicture(rows, logs({ a: ['2026-08-20'], b: ['2026-08-21'] }));
    expect(p.loggedSameDay.count).toBe(10);
    expect(p.loggedNextDay.count).toBe(10);
  });

  it('crosses a month boundary correctly', () => {
    // 31 Aug -> 1 Sep. A naive +1 on the date string would look for "2026-08-32".
    const p = tailPicture(
      Array.from({ length: 20 }, () => push('a', '2026-08-31')),
      logs({ a: ['2026-09-01'] }),
    );
    expect(p.loggedNextDay.count).toBe(20);
  });

  it('names the pushes that produced nothing observable', () => {
    const p = tailPicture(
      Array.from({ length: 20 }, () => push('a', '2026-08-20')),
      logs({ a: ['2026-08-25'] }),
    );
    expect(p.noObservedStudy).toBe(20);
    expect(p.loggedSameDay.count).toBe(0);
    expect(p.loggedNextDay.count).toBe(0);
  });

  it('a student with no logs at all does not crash the join', () => {
    const p = tailPicture(Array.from({ length: 20 }, () => push('ghost', '2026-08-20')), logs({}));
    expect(p.noObservedStudy).toBe(20);
    expect(p.loggedSameDay.rate).toBe(0);
  });
});

describe('the tail never becomes a causal claim', () => {
  it('is labelled ASSOCIATED, never FACT', () => {
    const p = tailPicture(Array.from({ length: 50 }, () => push('a', '2026-08-20')),
      logs({ a: ['2026-08-20'] }));
    expect(p.evidence).toBe('ASSOCIATED');
    expect(p.evidence).not.toBe('FACT');
  });

  it('states the selection problem in its own note', () => {
    // Students who can receive push installed the app and granted permission —
    // the population most likely to log anyway.
    const p = tailPicture([push('a', '2026-08-20')], logs({}));
    expect(p.note).toMatch(/not what the push caused/i);
    expect(p.note).toMatch(/most likely to log anyway/i);
  });

  it('an empty window is UNKNOWN, not a zero result', () => {
    const p = tailPicture([], logs({}));
    expect(p.evidence).toBe('UNKNOWN');
    expect(p.tapped.rate).toBeNull();
    expect(p.noObservedStudy).toBe(0);
  });
});

describe('a thin sample cannot produce a confident number', () => {
  it('routes every rate through the same choke point as the founder view', () => {
    const p = tailPicture([push('a', '2026-08-20', true)], logs({ a: ['2026-08-20'] }));
    expect(p.tapped.rate).toBeNull();
    expect(p.tapped.evidence).toBe('UNAVAILABLE');
    // The count is still a fact at any size.
    expect(p.tapped.count).toBe(1);
  });
});

describe('this module observes and never sends', () => {
  it('holds no send, suppression or budget CODE', async () => {
    const fs = await import('node:fs');
    // Comments are stripped first. The guard is about what this file DOES, not
    // which words it uses — a lesson this repo has now paid for four times:
    // three earlier guards banned a string that their own explanatory comment
    // legitimately contained, and so did the first draft of this one.
    const code = fs.readFileSync('src/lib/notification-tail.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

    // A second notification engine is explicitly out of scope. These are CALLS
    // and writes, not vocabulary.
    for (const banned of [
      /\bdispatch\s*\(/, /sendPushToUser\s*\(/, /\bBUDGET_[A-Z]+\b/,
      /\.insert\s*\(/, /\.update\s*\(/, /\.rpc\s*\(/, /\bfetch\s*\(/,
    ]) {
      expect(code, `notification-tail acquired sending behaviour: ${banned}`).not.toMatch(banned);
    }
  });

  it('is pure — it takes rows, not a database client', async () => {
    const fs = await import('node:fs');
    const code = fs.readFileSync('src/lib/notification-tail.ts', 'utf8');
    expect(code).not.toMatch(/createAdminClient|from\(['"]/);
  });
});
