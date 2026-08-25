import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  paymentSurface, needsBrowserHandoff, usesRedirectCheckout,
  type PaymentSurfaceSignals,
} from './payment-surface';
import { redirectCheckoutOptions } from './razorpay-checkout';

// ── Buying must be ONE tap on every surface ────────────────────────────────
//
// 25 Aug, founder on an iPhone: tapping Pay produced a page saying "Open this
// in Safari to pay — tap the share icon and choose Open in Safari", with a
// "Copy my payment link" button. Three taps and a system menu to buy a ₹299
// session.
//
// The cause was NOT a Razorpay limitation. paymentSurface returned the same
// strategy for two iOS surfaces that behave differently: a WKWebView wrapper
// honours a real anchor and escapes to Safari, an installed PWA does NOT — it
// navigates inside the app, landing on our own /go page, which then asked the
// student to escape by hand.

const sig = (o: Partial<PaymentSurfaceSignals> = {}): PaymentSurfaceSignals => ({
  escapedTab: false, iosStoreBuild: false, androidStoreBuild: false,
  ios: false, standalone: false, ...o,
});

describe('the installed iOS PWA gets ONE tap', () => {
  it('uses redirect, not the hand-off that cannot escape', () => {
    const s = sig({ ios: true, standalone: true });
    expect(paymentSurface(s)).toBe('redirect');
    expect(usesRedirectCheckout(s)).toBe(true);
  });

  it('is NOT treated as a browser hand-off', () => {
    // Minting a /go link here is what resurrected the extra tap.
    expect(needsBrowserHandoff(sig({ ios: true, standalone: true }))).toBe(false);
  });

  it('never lands on the copy-the-link screen again', () => {
    // /go exists for the WKWebView wrapper, where an anchor genuinely escapes.
    // It must not be reachable from a standalone PWA.
    expect(paymentSurface(sig({ ios: true, standalone: true }))).not.toBe('ios_link_handoff');
  });
});

describe('the surfaces that already worked are untouched', () => {
  it.each([
    ['iOS App Store wrapper', sig({ iosStoreBuild: true }), 'redirect'],
    ['Android Play wrapper', sig({ androidStoreBuild: true }), 'redirect'],
    ['installed iOS PWA', sig({ ios: true, standalone: true }), 'redirect'],
    ['desktop / mobile browser', sig(), 'inline'],
    ['installed Android PWA', sig({ standalone: true }), 'inline'],
    ['iOS browser TAB (not installed)', sig({ ios: true }), 'inline'],
    ['a tab that already escaped', sig({ escapedTab: true, ios: true, standalone: true }), 'inline'],
  ])('%s resolves to %s', (_label, s, expected) => {
    expect(paymentSurface(s)).toBe(expected);
  });

  it('NO surface hands off any more — every one pays in place', () => {
    // The hand-off is gone entirely. /go's own measured result was 160 tokens
    // minted against 7 consumed: a 96% drop-off before Razorpay was reached.
    for (const s of [
      sig(), sig({ ios: true }), sig({ standalone: true }),
      sig({ ios: true, standalone: true }), sig({ iosStoreBuild: true }),
      sig({ androidStoreBuild: true }), sig({ escapedTab: true }),
    ]) {
      expect(needsBrowserHandoff(s)).toBe(false);
      expect(['inline', 'redirect']).toContain(paymentSurface(s));
    }
  });

  it('the Android installed PWA keeps the inline modal', () => {
    // It produced the only completed in-app payment on record; moving it would
    // break the one path that demonstrably works.
    expect(usesRedirectCheckout(sig({ standalone: true }))).toBe(false);
  });
});

describe('redirect mode keeps the money path identical', () => {
  const opts = redirectCheckoutOptions({
    keyId: 'rzp_test', orderId: 'order_ABC', amount: 29900, currency: 'INR',
    name: 'CareerRai', description: '45-min session',
    callbackUrl: 'https://careerrai.in/student/buddy?paid=1',
  });

  it('carries the SAME order id — reconciliation is unchanged', () => {
    // The webhook finds student_payments by razorpay_order_id. A payment-link
    // approach would have minted a different order and broken that lookup.
    expect(opts.order_id).toBe('order_ABC');
  });

  it('sets the two flags that make it a navigation, not a modal', () => {
    expect(opts.redirect).toBe(true);
    expect(opts.callback_url).toBe('https://careerrai.in/student/buddy?paid=1');
  });

  it('opens no modal config — there is no modal to dismiss', () => {
    // A `handler` or `modal.ondismiss` here would be dead code: the page is
    // gone before Razorpay could call either.
    expect(opts.handler).toBeUndefined();
    expect(opts.modal).toBeUndefined();
  });

  it('still passes prefill so a signed-in student is not re-asked', () => {
    const withPrefill = redirectCheckoutOptions({
      keyId: 'k', orderId: 'o', amount: 1, currency: 'INR', name: 'n', description: 'd',
      prefill: { contact: '919876543210' }, callbackUrl: 'https://x/y',
    });
    expect((withPrefill.prefill as Record<string, string>).contact).toBe('919876543210');
  });
});

describe('every checkout surface takes the same one-tap path', () => {
  const SURFACES = [
    'src/components/buddy/book-session-card.tsx',
    'src/components/membership-card.tsx',
    'src/components/unlock-buddy-sheet.tsx',
  ];

  it.each(SURFACES)('%s uses redirect mode on the PWA', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src, `${file} would still open a modal on an installed iOS PWA`)
      .toMatch(/usesRedirectCheckout\(/);
    expect(src).toMatch(/redirectCheckoutOptions\(/);
  });

  it.each(SURFACES)('%s decides BEFORE building the modal', (file) => {
    const src = readFileSync(file, 'utf8');
    const redirectAt = src.indexOf('usesRedirectCheckout(');
    const modalAt = src.indexOf('new window.Razorpay({');
    expect(redirectAt).toBeGreaterThan(-1);
    expect(redirectAt).toBeLessThan(modalAt);
  });
});

describe('the ₹2,999 upsell points at something a student can buy', () => {
  const SCREEN = readFileSync('src/components/buddy/buddy-conversion-screen.tsx', 'utf8');

  it('no longer links to the closed Independence Day campaign', () => {
    // /offer closes ITSELF after 15 Aug by design. Linking the main upsell at
    // it meant every tap landed on "This offer has closed" with nothing to buy.
    expect(SCREEN).not.toMatch(/href="\/offer"/);
  });

  it('opens the live paywall the other surfaces already use', () => {
    expect(SCREEN).toMatch(/<UnlockBuddyButton/);
  });

  it('shows the price from the plan authority, not a hardcoded campaign one', () => {
    // The card said ₹2,999 while the campaign page said ₹2,499. One authority.
    expect(SCREEN).toMatch(/PLANS\.tillcat\.display/);
    expect(SCREEN).not.toMatch(/₹2,999/);
  });
});
