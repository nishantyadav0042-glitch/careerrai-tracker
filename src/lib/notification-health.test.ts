import { describe, it, expect } from 'vitest';
import { scoreStudent, type NotifHealthState } from './notification-health';

// ── THE HONEST CLASSIFICATION, PROVEN STATE BY STATE ────────────────────────
//
// notification-health.ts had zero test coverage before 15 Aug — every state
// this function can return was trusted on read, never pinned. That is how
// "opted_out" and "never_opted_in" survived as long as they did: nothing
// would have failed when the second one became permanently unreachable
// (notif_prefs is never null — the DB default sets push:false explicitly —
// so the branch checking "no notif_prefs at all" could never fire).

const NOW = Date.parse('2026-08-15T12:00:00.000Z');
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const base = {
  notif_prefs: { push: false },
  push_subscription: null,
  push_subscribed_at: null,
  push_verified_at: null,
};

describe('the "opted out" / "never opted in" split is gone', () => {
  it('push:false with NO record of a prompt → not_asked (was the mislabeled "opted out")', () => {
    const { state } = scoreStudent({ ...base }, NOW);
    expect(state).toBe('not_asked');
  });

  it('push:false WITH a real push_prompted record → declined', () => {
    const { state } = scoreStudent({ ...base, notif_prefs: { push: false, push_prompted: true } }, NOW);
    expect(state).toBe('declined');
  });

  it('push:false WITH a push_reprompted record also counts as declined', () => {
    const { state } = scoreStudent({ ...base, notif_prefs: { push: false, push_reprompted: true } }, NOW);
    expect(state).toBe('declined');
  });

  it('a prompted flag alone, without push:false explicitly set, still reads not_asked if push is not true', () => {
    // Belt and suspenders: only a TRUE push flag counts as opted in — an
    // absent or non-boolean value must never accidentally read as granted.
    const { state } = scoreStudent({ ...base, notif_prefs: {} }, NOW);
    expect(state).toBe('not_asked');
  });
});

describe('the "disconnected" split — real churn vs. the closed instrumentation gap', () => {
  it('has a subscription birth date → disconnected_dead', () => {
    const { state } = scoreStudent(
      { ...base, notif_prefs: { push: true }, push_subscription: null, push_subscribed_at: day(5) }, NOW
    );
    expect(state).toBe('disconnected_dead');
  });

  it('no subscription birth date at all → disconnected_unexplained', () => {
    const { state } = scoreStudent(
      { ...base, notif_prefs: { push: true }, push_subscription: null, push_subscribed_at: null }, NOW
    );
    expect(state).toBe('disconnected_unexplained');
  });
});

describe('a live subscription — healthy / unverified / stale', () => {
  const withSub = (verifiedDaysAgo: number | null) => ({
    ...base,
    notif_prefs: { push: true },
    push_subscription: { endpoint: 'x' },
    push_verified_at: verifiedDaysAgo == null ? null : day(verifiedDaysAgo),
  });

  it('verified within 3 days → healthy', () => {
    expect(scoreStudent(withSub(0), NOW).state).toBe('healthy');
    expect(scoreStudent(withSub(3), NOW).state).toBe('healthy');
  });

  it('verified 7+ days ago → stale', () => {
    expect(scoreStudent(withSub(7), NOW).state).toBe('stale');
    expect(scoreStudent(withSub(30), NOW).state).toBe('stale');
  });

  it('4-6 days, or never verified → unverified', () => {
    expect(scoreStudent(withSub(4), NOW).state).toBe('unverified');
    expect(scoreStudent(withSub(6), NOW).state).toBe('unverified');
    expect(scoreStudent(withSub(null), NOW).state).toBe('unverified');
  });
});

describe('every state is reachable — the exact bug that let never_opted_in go dead', () => {
  it('all seven states are producible by some real input', () => {
    const seen = new Set<NotifHealthState>();
    seen.add(scoreStudent({ ...base }, NOW).state);
    seen.add(scoreStudent({ ...base, notif_prefs: { push: false, push_prompted: true } }, NOW).state);
    seen.add(scoreStudent({ ...base, notif_prefs: { push: true }, push_subscribed_at: day(5) }, NOW).state);
    seen.add(scoreStudent({ ...base, notif_prefs: { push: true } }, NOW).state);
    seen.add(scoreStudent({ ...base, notif_prefs: { push: true }, push_subscription: { endpoint: 'x' }, push_verified_at: day(0) }, NOW).state);
    seen.add(scoreStudent({ ...base, notif_prefs: { push: true }, push_subscription: { endpoint: 'x' }, push_verified_at: day(7) }, NOW).state);
    seen.add(scoreStudent({ ...base, notif_prefs: { push: true }, push_subscription: { endpoint: 'x' }, push_verified_at: null }, NOW).state);
    const all: NotifHealthState[] = [
      'healthy', 'unverified', 'stale', 'disconnected_dead', 'disconnected_unexplained', 'declined', 'not_asked',
    ];
    for (const s of all) expect(seen.has(s), `${s} is unreachable`).toBe(true);
  });
});
