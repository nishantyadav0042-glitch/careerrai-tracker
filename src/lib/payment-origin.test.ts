import { describe, it, expect } from 'vitest';
import {
  needsCheckoutHandoff, checkoutHandoffUrl,
  CHECKOUT_ORIGIN, NON_TRANSACTABLE_ORIGINS,
} from './payment-origin';
import { PAYMENT_RETURNS, isPaymentReturnKey } from './payment-return';

describe('needsCheckoutHandoff — fail-closed by design', () => {
  it('moves a student off the origin Razorpay proved it refuses', () => {
    expect(needsCheckoutHandoff('https://careerrai-daily.vercel.app')).toBe(true);
  });

  it('leaves the canonical checkout origin alone', () => {
    expect(needsCheckoutHandoff(CHECKOUT_ORIGIN)).toBe(false);
    expect(needsCheckoutHandoff('https://careerrai.in')).toBe(false);
  });

  it('NEVER fires on localhost or a preview deployment', () => {
    // The inverted rule ("anything that is not CHECKOUT_ORIGIN") would send
    // every developer and every preview reviewer into a hand-off to production.
    for (const o of [
      'http://localhost:3000',
      'https://localhost:3000',
      'https://careerrai-tracker-git-somebranch.vercel.app',
      'https://careerrai-daily-abc123.vercel.app',
    ]) expect(needsCheckoutHandoff(o)).toBe(false);
  });

  it('treats an unknown, empty or non-string origin as transactable', () => {
    // A false positive bounces a paying student off a WORKING checkout, which
    // is worse than the bug being fixed. Unknown means leave it alone.
    for (const o of ['', null, undefined, 'https://evil.example', 'not a url', 42 as unknown as string]) {
      expect(needsCheckoutHandoff(o as string)).toBe(false);
    }
  });

  it('ignores a trailing slash', () => {
    expect(needsCheckoutHandoff('https://careerrai-daily.vercel.app/')).toBe(true);
  });

  it('does not match a lookalike host that merely contains the legacy one', () => {
    for (const o of [
      'https://careerrai-daily.vercel.app.evil.com',
      'https://not-careerrai-daily.vercel.app',
      'http://careerrai-daily.vercel.app',   // wrong scheme is a different origin
    ]) expect(needsCheckoutHandoff(o)).toBe(false);
  });

  it('the deny-list never contains the checkout origin itself', () => {
    // If these ever collided, every payment on the live domain would hand off
    // to itself in a loop.
    expect(NON_TRANSACTABLE_ORIGINS).not.toContain(CHECKOUT_ORIGIN);
  });
});

describe('checkoutHandoffUrl', () => {
  it('lands on the checkout origin, never the origin being left', () => {
    const u = new URL(checkoutHandoffUrl('tok123', 'buddy'));
    expect(u.origin).toBe(CHECKOUT_ORIGIN);
    expect(u.pathname).toBe('/pay/continue');
    expect(u.searchParams.get('k')).toBe('tok123');
    expect(u.searchParams.get('to')).toBe('buddy');
  });

  it('resolves the destination through the payment-return allow-list', () => {
    // ONE allow-list. A screen must not be reachable by the hand-off but not
    // by the payment callback, or vice versa.
    for (const key of Object.keys(PAYMENT_RETURNS)) {
      expect(isPaymentReturnKey(key)).toBe(true);
      const u = new URL(checkoutHandoffUrl('t', key as never));
      expect(u.searchParams.get('next')).toBe(PAYMENT_RETURNS[key as never]);
    }
  });

  it('percent-encodes a hostile token instead of letting it alter the URL', () => {
    const u = new URL(checkoutHandoffUrl('a&to=evil#x', 'buddy'));
    expect(u.searchParams.get('k')).toBe('a&to=evil#x');
    expect(u.searchParams.get('to')).toBe('buddy');
    expect(u.origin).toBe(CHECKOUT_ORIGIN);
  });
});
