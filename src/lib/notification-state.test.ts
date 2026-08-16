import { describe, it, expect } from 'vitest';
import { classifyNotificationState, needsRecovery, classifyRecovery } from './notification-state';

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

describe('classifyRecovery — Installment 2 Part 1/6: the exact lifecycle the founder specified', () => {
  it('permission not granted: not_applicable regardless of subscription or recovery history', () => {
    expect(classifyRecovery({
      permission: 'not_requested', subscription: 'missing', recoveryAttemptedAt: null, recoveryLastError: null,
    })).toBe('not_applicable');
    expect(classifyRecovery({
      permission: 'denied', subscription: 'provider_dead', recoveryAttemptedAt: '2026-08-01T00:00:00Z', recoveryLastError: 'x',
    })).toBe('not_applicable');
  });

  it('granted + active, never known broken: not_applicable — nothing to recover', () => {
    expect(classifyRecovery({
      permission: 'granted', subscription: 'active', recoveryAttemptedAt: null, recoveryLastError: null,
    })).toBe('not_applicable');
  });

  it('granted + active, WITH a recovery attempt on record: recovered', () => {
    // The exact case the healer's fix produces: subscription is live again,
    // and it's on record that it got there via a recovery attempt — not
    // just "was always fine".
    expect(classifyRecovery({
      permission: 'granted', subscription: 'active', recoveryAttemptedAt: '2026-08-01T00:00:00Z', recoveryLastError: null,
    })).toBe('recovered');
  });

  it('granted + unusable, never attempted: recovery_required — the priority queue', () => {
    expect(classifyRecovery({
      permission: 'granted', subscription: 'provider_dead', recoveryAttemptedAt: null, recoveryLastError: null,
    })).toBe('recovery_required');
    expect(classifyRecovery({
      permission: 'granted', subscription: 'missing', recoveryAttemptedAt: null, recoveryLastError: null,
    })).toBe('recovery_required');
  });

  it('granted + unusable, attempted, real reason captured: recovery_failed', () => {
    // This is the exact fix for the 7 students found returning to the app
    // with no visible trace of what happened — now the reason is captured
    // instead of being an indistinguishable silent no-op.
    expect(classifyRecovery({
      permission: 'granted', subscription: 'provider_dead',
      recoveryAttemptedAt: '2026-08-16T00:00:00Z', recoveryLastError: 'subscribe_threw:AbortError',
    })).toBe('recovery_failed');
  });

  it('granted + unusable, attempted, but no reason captured: recovery_attempted (honest UNKNOWN, not invented)', () => {
    // e.g. the report beacon itself failed after a real attempt — we know
    // an attempt happened (attemptedAt is set) but not why it didn't work.
    // Must never be silently promoted to recovery_failed OR recovered.
    expect(classifyRecovery({
      permission: 'granted', subscription: 'missing', recoveryAttemptedAt: '2026-08-16T00:00:00Z', recoveryLastError: null,
    })).toBe('recovery_attempted');
  });
});
