import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { paymentSurface, usesRedirectCheckout } from '@/lib/payment-surface';
import { PAYMENT_RETURNS, paymentReturnPath } from '@/lib/payment-return';
import { verifyCheckoutSignature } from '@/lib/razorpay';
import crypto from 'node:crypto';

// ── ONE TAP MEANS ONE TAP ───────────────────────────────────────────────────
//
// Founder mandate, 25 Aug 2026. A student taps a price and the next thing they
// see is Razorpay. No copy link, no /go, no "Continue to secure payment", no
// second button, no dead-end modal.
//
// These guards are BEHAVIOURAL where behaviour is testable and DISCOVERY-BASED
// where they must police the whole repo — they grep for their own scope at run
// time, with a vacuity assertion, because a guard with a hardcoded file list
// has silently missed a new writer four times in this repo's history.

function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function grepFiles(pattern: string): string[] {
  try {
    return execSync(`grep -rl --include=*.ts --include=*.tsx -e ${JSON.stringify(pattern)} src/`, { encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
}

/** Every surface that opens Razorpay, discovered rather than listed. */
function checkoutSurfaces(): string[] {
  return grepFiles('new window.Razorpay(').filter((f) => !f.includes('.test.'));
}

const SIGNALS = {
  desktop:     { escapedTab: false, iosStoreBuild: false, androidStoreBuild: false, ios: false, standalone: false },
  iosSafari:   { escapedTab: false, iosStoreBuild: false, androidStoreBuild: false, ios: true,  standalone: false },
  iosPwa:      { escapedTab: false, iosStoreBuild: false, androidStoreBuild: false, ios: true,  standalone: true  },
  iosStore:    { escapedTab: false, iosStoreBuild: true,  androidStoreBuild: false, ios: true,  standalone: false },
  androidStore:{ escapedTab: false, iosStoreBuild: false, androidStoreBuild: true,  ios: false, standalone: false },
  androidPwa:  { escapedTab: false, iosStoreBuild: false, androidStoreBuild: false, ios: false, standalone: true  },
};

describe('every iOS surface goes STRAIGHT to Razorpay', () => {
  it('iPhone Safari redirects — the tab is no longer left on the modal', () => {
    // THE REGRESSION THIS EXISTS FOR. An installed PWA was switched to
    // redirect while a plain Safari tab was left inline on the strength of a
    // single completed payment.
    expect(paymentSurface(SIGNALS.iosSafari)).toBe('redirect');
    expect(usesRedirectCheckout(SIGNALS.iosSafari)).toBe(true);
  });

  it('iOS PWA and the iOS store wrapper redirect too', () => {
    expect(paymentSurface(SIGNALS.iosPwa)).toBe('redirect');
    expect(paymentSurface(SIGNALS.iosStore)).toBe('redirect');
  });

  it('the Android store wrapper redirects', () => {
    expect(paymentSurface(SIGNALS.androidStore)).toBe('redirect');
  });

  it('desktop keeps the modal, which demonstrably works there', () => {
    expect(paymentSurface(SIGNALS.desktop)).toBe('inline');
  });

  it('the installed Android PWA is deliberately unchanged', () => {
    // It produced the only completed in-app payment ever recorded. Moving the
    // one path with positive evidence, on no evidence, would be trading a fact
    // for a hunch.
    expect(paymentSurface(SIGNALS.androidPwa)).toBe('inline');
  });

  it('NO surface can resolve to anything but paying in place', () => {
    // needsBrowserHandoff() used to be the guard here. It was deleted rather
    // than kept as a named `false`, because a predicate nobody calls proves
    // nothing — this asserts the surface VOCABULARY itself has no hand-off in
    // it, so reintroducing one means adding a type member, in the open.
    for (const [name, s] of Object.entries(SIGNALS)) {
      expect(['inline', 'redirect'], `${name} resolved outside the vocabulary`)
        .toContain(paymentSurface(s));
    }
  });
});

describe('the legacy copy-paste UX cannot come back', () => {
  it('finds the checkout surfaces at all — a guard that greps nothing proves nothing', () => {
    expect(checkoutSurfaces().length).toBeGreaterThanOrEqual(3);
  });

  it('no checkout surface renders a manual payment link or a copy action', () => {
    const offenders = checkoutSurfaces().filter((f) => {
      const src = code(f);
      return /Copy my payment link|navigator\.clipboard|paste it in|buildGoUrl\s*\(|useIosPayUrl\s*\(/.test(src);
    });
    expect(offenders, `these reintroduce a manual/copy payment path: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no checkout surface mints a /go hand-off', () => {
    const offenders = checkoutSurfaces().filter((f) => /escapeToBrowserForPayment\s*\(/.test(code(f)));
    expect(offenders, `these escape to a browser instead of paying in place: ${offenders.join(', ')}`).toEqual([]);
  });

  it('the /go page is gone', () => {
    // Its own measured result was 160 tokens minted, 7 consumed — a 96%
    // drop-off before Razorpay was ever reached. Nothing routes to it now, and
    // an orphaned payment path is a trap for whoever reads this next.
    expect(existsSync('src/app/go/page.tsx'), '/go must not exist').toBe(false);
  });
});

describe('the return leg is a POST handler, not a page', () => {
  it('the callback route exists and handles POST', () => {
    // THE ROOT CAUSE. callback_url pointed at /student/profile and
    // /student/buddy — App Router PAGES, which answer GET only and return 405
    // to Razorpay's POST. Every student who completed a redirect payment
    // landed on a Method Not Allowed error the instant their money left.
    const route = 'src/app/api/payments/callback/route.ts';
    expect(existsSync(route)).toBe(true);
    expect(code(route)).toMatch(/export async function POST/);
  });

  it('no surface points callback_url at a page route', () => {
    const offenders = checkoutSurfaces().filter((f) =>
      /callbackUrl:\s*checkoutCallbackUrl\(\s*['"]\//.test(code(f)));
    expect(offenders, `these point Razorpay's POST at a page, which returns 405: ${offenders.join(', ')}`).toEqual([]);
  });

  it('every callback destination is an allow-listed key, never a raw path', () => {
    for (const [key, path] of Object.entries(PAYMENT_RETURNS)) {
      expect(paymentReturnPath(key, 'paid')).toBe(`${path}?pay=paid`);
    }
  });

  it('an attacker-supplied destination cannot become an open redirect', () => {
    // `dest` arrives in the query string of a URL anyone can craft, and the
    // redirect would carry the payment flow's credibility to wherever it
    // pointed. Anything unrecognised falls back to our own buddy screen.
    for (const evil of ['//evil.com', 'https://evil.com', '/\\evil.com', '../../etc', 'javascript:alert(1)', null, 42]) {
      const out = paymentReturnPath(evil, 'paid');
      expect(out.startsWith('/student/'), `${String(evil)} escaped the allow-list as ${out}`).toBe(true);
      expect(out).not.toContain('evil.com');
    }
  });
});

describe('the payment is still proven, not trusted', () => {
  const SECRET = 'test_secret_do_not_use';
  const sign = (order: string, payment: string, secret = SECRET) =>
    crypto.createHmac('sha256', secret).update(`${order}|${payment}`).digest('hex');

  it('accepts a genuine Razorpay signature', () => {
    expect(verifyCheckoutSignature('order_1', 'pay_1', sign('order_1', 'pay_1'), SECRET)).toBe(true);
  });

  it('refuses a forged one, a swapped order, and a wrong secret', () => {
    expect(verifyCheckoutSignature('order_1', 'pay_1', 'deadbeef', SECRET)).toBe(false);
    expect(verifyCheckoutSignature('order_2', 'pay_1', sign('order_1', 'pay_1'), SECRET)).toBe(false);
    expect(verifyCheckoutSignature('order_1', 'pay_2', sign('order_1', 'pay_1'), SECRET)).toBe(false);
    expect(verifyCheckoutSignature('order_1', 'pay_1', sign('order_1', 'pay_1', 'other'), SECRET)).toBe(false);
  });

  it('refuses anything missing, including an absent secret', () => {
    expect(verifyCheckoutSignature(null, 'pay_1', 'sig', SECRET)).toBe(false);
    expect(verifyCheckoutSignature('order_1', null, 'sig', SECRET)).toBe(false);
    expect(verifyCheckoutSignature('order_1', 'pay_1', null, SECRET)).toBe(false);
    expect(verifyCheckoutSignature('order_1', 'pay_1', sign('order_1', 'pay_1'), '')).toBe(false);
  });

  it('the callback never activates on an unverified return', () => {
    const src = code('src/app/api/payments/callback/route.ts');
    const verifyAt = src.indexOf('verifyCheckoutSignature(');
    const activateAt = src.indexOf('activatePaidOrder(');
    expect(verifyAt).toBeGreaterThan(-1);
    expect(activateAt).toBeGreaterThan(-1);
    expect(verifyAt, 'the signature must be checked BEFORE anything is activated')
      .toBeLessThan(activateAt);
  });

  it('the callback reuses the ONE activator rather than forking a second', () => {
    const src = code('src/app/api/payments/callback/route.ts');
    expect(src).toMatch(/activatePaidOrder\(/);
    // No direct entitlement writes: no is_premium flip, no credit insert here.
    expect(src).not.toMatch(/is_premium/);
    expect(src).not.toMatch(/from\('session_credits'\)/);
    expect(src).not.toMatch(/from\('profiles'\)[\s\S]{0,80}\.update\(/);
  });
});
