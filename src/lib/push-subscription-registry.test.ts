import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { registerSubscription, normalisePushContext } from './push-subscription-registry';

// ── ONE DEFINITION OF "SUBSCRIBED", PROVEN AGAINST BOTH CALLERS ─────────────
//
// The bug this closes: /api/push/subscribe stamped push_subscribed_at once,
// ever. The pre-auth signup path (verify-phone-otp/route.ts) never stamped it
// at all — a second, hand-written definition of the same event that silently
// dropped one field. 24 students who subscribed through the pre-auth path,
// all dated 12–21 July, are "disconnected" on the dashboard today with no
// recorded birth, purely because of which of the two definitions happened to
// run for them.

describe('registerSubscription', () => {
  const NOW = '2026-08-15T12:00:00.000Z';

  it('stamps push_subscribed_at on a genuinely new subscriber', () => {
    const reg = registerSubscription({ notifPrefs: null, pushSubscribedAt: null }, { endpoint: 'x' }, NOW);
    expect(reg.push_subscribed_at).toBe(NOW);
  });

  it('never overwrites an existing push_subscribed_at — lifetime measurement depends on this', () => {
    const born = '2026-07-01T00:00:00.000Z';
    const reg = registerSubscription({ notifPrefs: null, pushSubscribedAt: born }, { endpoint: 'x' }, NOW);
    expect(reg.push_subscribed_at).toBe(born);
  });

  it('always moves push_resubscribed_at, on both a first sub and a resub', () => {
    const fresh = registerSubscription({ notifPrefs: null, pushSubscribedAt: null }, { endpoint: 'x' }, NOW);
    const resub = registerSubscription({ notifPrefs: null, pushSubscribedAt: '2026-07-01T00:00:00.000Z' }, { endpoint: 'x' }, NOW);
    expect(fresh.push_resubscribed_at).toBe(NOW);
    expect(resub.push_resubscribed_at).toBe(NOW);
  });

  it('clears push_died_at — a fresh subscription resurrects the channel', () => {
    const reg = registerSubscription({ notifPrefs: null, pushSubscribedAt: null }, { endpoint: 'x' }, NOW);
    expect(reg.push_died_at).toBeNull();
  });

  it('MERGES notif_prefs, never replaces the column — this is the field the pre-auth path used to destroy', () => {
    const reg = registerSubscription(
      { notifPrefs: { daily_reminder: true, email: true, reminder_time: '20:00', push: false }, pushSubscribedAt: null },
      { endpoint: 'x' }, NOW
    );
    expect(reg.notif_prefs).toEqual({ daily_reminder: true, email: true, reminder_time: '20:00', push: true });
  });

  it('sets push:true even from a completely empty prefs object (the brand-new-signup case)', () => {
    const reg = registerSubscription({ notifPrefs: null, pushSubscribedAt: null }, { endpoint: 'x' }, NOW);
    expect(reg.notif_prefs).toEqual({ push: true });
  });

  it('stores the subscription payload verbatim', () => {
    const sub = { endpoint: 'https://fcm.example/abc', keys: { p256dh: 'k', auth: 'a' } };
    const reg = registerSubscription({ notifPrefs: null, pushSubscribedAt: null }, sub, NOW);
    expect(reg.push_subscription).toBe(sub);
  });

  it('carries a valid push_context through, and omits it entirely when absent or invalid', () => {
    const withCtx = registerSubscription({ notifPrefs: null, pushSubscribedAt: null }, { endpoint: 'x' }, NOW, 'standalone');
    expect(withCtx.push_context).toBe('standalone');

    const noCtx = registerSubscription({ notifPrefs: null, pushSubscribedAt: null }, { endpoint: 'x' }, NOW);
    expect('push_context' in noCtx).toBe(false);

    const badCtx = registerSubscription({ notifPrefs: null, pushSubscribedAt: null }, { endpoint: 'x' }, NOW, 'not-a-real-context');
    expect('push_context' in badCtx).toBe(false);
  });
});

describe('normalisePushContext', () => {
  it('accepts exactly the known contexts', () => {
    for (const c of ['standalone', 'twa', 'ios_app', 'browser', 'unknown']) {
      expect(normalisePushContext(c)).toBe(c);
    }
  });
  it('rejects anything else, including non-strings', () => {
    expect(normalisePushContext('desktop')).toBeUndefined();
    expect(normalisePushContext(null)).toBeUndefined();
    expect(normalisePushContext(42)).toBeUndefined();
    expect(normalisePushContext(undefined)).toBeUndefined();
  });
});

describe('both write paths actually use the shared function — not just a same-named copy', () => {
  it('/api/push/subscribe imports and calls registerSubscription', () => {
    const src = readFileSync('src/app/api/push/subscribe/route.ts', 'utf8');
    expect(src).toContain("from '@/lib/push-subscription-registry'");
    expect(src).toContain('registerSubscription(');
  });

  it('the pre-auth signup route imports and calls registerSubscription', () => {
    const src = readFileSync('src/app/api/auth/verify-phone-otp/route.ts', 'utf8');
    expect(src).toContain("from '@/lib/push-subscription-registry'");
    expect(src).toContain('registerSubscription(');
    // The exact defect: writing notif_prefs as a bare object literal instead
    // of merging through the shared function. If this reappears, the merge
    // guarantee is gone again for this path specifically.
    expect(src).not.toContain("profileUpdate.notif_prefs = { push: true }");
  });

  it('neither route hand-stamps push_subscribed_at itself anymore', () => {
    for (const f of ['src/app/api/push/subscribe/route.ts', 'src/app/api/auth/verify-phone-otp/route.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/push_subscribed_at:\s*\(/);
    }
  });
});
