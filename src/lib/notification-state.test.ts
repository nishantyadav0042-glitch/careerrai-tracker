import { describe, it, expect } from 'vitest';
import { classifyNotificationState, needsRecovery } from './notification-state';

describe('classifyNotificationState — the one place permission/subscription logic lives', () => {
  it('never asked: no preference, no prompt, no subscription', () => {
    const s = classifyNotificationState({ prefsPush: false, wasPrompted: false, hasSubscription: false, diedAt: null });
    expect(s.permission).toBe('not_requested');
    expect(s.subscription).toBe('missing');
  });

  it('denied: no preference, but a real prompt is on record', () => {
    const s = classifyNotificationState({ prefsPush: false, wasPrompted: true, hasSubscription: false, diedAt: null });
    expect(s.permission).toBe('denied');
  });

  it('granted + active: the only fully healthy combination', () => {
    const s = classifyNotificationState({ prefsPush: true, wasPrompted: true, hasSubscription: true, diedAt: null });
    expect(s).toEqual({ permission: 'granted', subscription: 'active' });
  });

  it('granted + provider_dead: requires diedAt, not just a missing subscription', () => {
    const s = classifyNotificationState({ prefsPush: true, wasPrompted: true, hasSubscription: false, diedAt: '2026-08-01T00:00:00Z' });
    expect(s.subscription).toBe('provider_dead');
  });

  it('granted + missing: no subscription, but no proof of death either — a different, less certain fact', () => {
    const s = classifyNotificationState({ prefsPush: true, wasPrompted: true, hasSubscription: false, diedAt: null });
    expect(s.subscription).toBe('missing');
  });

  it('a live subscription is never read as consent: prefsPush=false always wins, regardless of hasSubscription', () => {
    // The exact contradiction the forensic audit found between
    // notification-health.ts and push-state.ts, now impossible by
    // construction: permission is decided ONLY from the student's stored
    // preference, never inferred from whether a subscription still exists.
    const s = classifyNotificationState({ prefsPush: false, wasPrompted: false, hasSubscription: true, diedAt: null });
    expect(s.permission).toBe('not_requested');
    const s2 = classifyNotificationState({ prefsPush: false, wasPrompted: true, hasSubscription: true, diedAt: '2026-08-01T00:00:00Z' });
    expect(s2.permission).toBe('denied');
  });
});

describe('needsRecovery — the Phase 17 priority queue predicate', () => {
  it('granted + active: does not need recovery', () => {
    expect(needsRecovery({ permission: 'granted', subscription: 'active' })).toBe(false);
  });

  it('granted + missing: needs recovery — this is the whole point of the queue', () => {
    expect(needsRecovery({ permission: 'granted', subscription: 'missing' })).toBe(true);
  });

  it('granted + provider_dead: needs recovery', () => {
    expect(needsRecovery({ permission: 'granted', subscription: 'provider_dead' })).toBe(true);
  });

  it('never asked or denied: never in the recovery queue, regardless of subscription state', () => {
    expect(needsRecovery({ permission: 'not_requested', subscription: 'missing' })).toBe(false);
    expect(needsRecovery({ permission: 'denied', subscription: 'missing' })).toBe(false);
    expect(needsRecovery({ permission: 'not_requested', subscription: 'active' })).toBe(false);
  });
});
