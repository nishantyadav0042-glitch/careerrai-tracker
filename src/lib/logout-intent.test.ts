import { describe, it, expect, beforeEach } from 'vitest';
import { markLogoutIntent, consumeLogoutIntent, shouldShowSessionLoss } from './logout-intent';

// This repo's vitest environment is 'node' with no DOM, so the React component
// itself cannot be rendered here. Rather than fake auth-js behaviour to
// manufacture a passing test, the one decision the notice makes lives in a
// pure function and is exercised directly. What is NOT covered here is stated
// plainly in the PR: the live auth-js SIGNED_OUT emission is verified by
// reading GoTrueClient (_removeSession -> _notifyAllSubscribers), not by test.

function installStorage() {
  const map = new Map<string, string>();
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
  return map;
}

describe('a deliberate logout is remembered just long enough', () => {
  beforeEach(() => { installStorage(); });

  it('a logout started a moment ago is recognised as intentional', () => {
    markLogoutIntent(1_000_000);
    expect(consumeLogoutIntent(1_000_500)).toBe(true);
  });

  it('the mark is cleared on read, so it can never suppress a LATER real loss', () => {
    markLogoutIntent(1_000_000);
    expect(consumeLogoutIntent(1_000_500)).toBe(true);
    expect(consumeLogoutIntent(1_001_000)).toBe(false);
  });

  it('a stale mark does not count — an old logout is not this event', () => {
    markLogoutIntent(1_000_000);
    expect(consumeLogoutIntent(1_000_000 + 31_000)).toBe(false);
  });

  it('no mark at all means the session went away on its own', () => {
    expect(consumeLogoutIntent(1_000_000)).toBe(false);
  });

  it('storage being unavailable never throws — logout must still work', () => {
    (globalThis as { sessionStorage?: unknown }).sessionStorage = {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
      removeItem() { throw new Error('denied'); },
    };
    expect(() => markLogoutIntent(1)).not.toThrow();
    expect(consumeLogoutIntent(1)).toBe(false);
  });
});

describe('when the notice is allowed to appear', () => {
  const base = { alreadyShown: false, wasIntentional: false };

  it('an unexpected SIGNED_OUT shows it — the production case', () => {
    expect(shouldShowSessionLoss({ ...base, event: 'SIGNED_OUT' })).toBe(true);
  });

  it('the student choosing to log out shows nothing', () => {
    expect(shouldShowSessionLoss({ ...base, event: 'SIGNED_OUT', wasIntentional: true })).toBe(false);
  });

  it('a healthy session never triggers it', () => {
    for (const event of ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED', 'PASSWORD_RECOVERY']) {
      expect(shouldShowSessionLoss({ ...base, event })).toBe(false);
    }
  });

  it('it never repeats — a second SIGNED_OUT is silent', () => {
    expect(shouldShowSessionLoss({ ...base, event: 'SIGNED_OUT', alreadyShown: true })).toBe(false);
  });
});
