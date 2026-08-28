import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { codeOnly } from './test-support/code-only';
import {
  safeReturnPath, newStateNonce, encodeOAuthState, verifyOAuthState,
  OAUTH_STATE_COOKIE, GOOGLE_SCOPES,
} from './google-oauth';

/**
 * ── THE OAUTH `state` PARAMETER ─────────────────────────────────────────────
 *
 * 27 Aug audit, item 11: "does the callback validate state correctly?" It did
 * not. `state` carried only a return path, taken from the attacker-controlled
 * `from` on /api/google/connect, and the callback fed it straight into every
 * redirect. Two defects in the one route the whole Google integration depends
 * on: an open redirect off our own domain, and no CSRF binding at all.
 */


describe('safeReturnPath — a round trip cannot leave this origin', () => {
  it.each([
    ['an absolute http url', 'https://evil.com'],
    ['an absolute url with a path', 'https://evil.com/steal'],
    ['a protocol-relative url', '//evil.com'],
    ['a protocol-relative url with a path', '//evil.com/steal'],
    ['a scheme with no slashes', 'javascript:alert(1)'],
    ['a bare word', 'evil.com'],
    ['an encoded absolute url', encodeURIComponent('https://evil.com')],
    ['a header-splitting attempt', '/buddy/home\r\nSet-Cookie: x=1'],
    ['empty', ''],
    ['missing', null],
  ])('refuses %s', (_label, input) => {
    expect(safeReturnPath(input)).toBe('/buddy/home');
  });

  it.each([
    ['/buddy/home'],
    ['/buddy/schedule'],
    ['/buddy/schedule?tab=hours'],
    ['/student/buddy'],
  ])('allows the same-origin path %s', (input) => {
    expect(safeReturnPath(input)).toBe(input);
  });

  it('decodes a single layer of encoding, as the connect route applies', () => {
    expect(safeReturnPath(encodeURIComponent('/buddy/schedule'))).toBe('/buddy/schedule');
  });
});

describe('verifyOAuthState — the callback must come from a flow we started', () => {
  it('accepts a state carrying the nonce this browser was issued', () => {
    const nonce = newStateNonce();
    const v = verifyOAuthState(encodeOAuthState(nonce, '/buddy/schedule'), nonce);
    expect(v.ok).toBe(true);
    expect(v.returnPath).toBe('/buddy/schedule');
  });

  it('REFUSES a state whose nonce is not ours — the CSRF case', () => {
    const v = verifyOAuthState(encodeOAuthState(newStateNonce(), '/buddy/home'), newStateNonce());
    expect(v.ok).toBe(false);
  });

  it('refuses when the browser carries no nonce at all', () => {
    const nonce = newStateNonce();
    expect(verifyOAuthState(encodeOAuthState(nonce, '/buddy/home'), null).ok).toBe(false);
    expect(verifyOAuthState(encodeOAuthState(nonce, '/buddy/home'), '').ok).toBe(false);
  });

  it.each([[null], [''], ['nocolon'], [':/buddy/home']])(
    'refuses a malformed state (%s)', (state) => {
      expect(verifyOAuthState(state as string | null, newStateNonce()).ok).toBe(false);
    },
  );

  it('an off-site path is neutralised even when the nonce is genuine', () => {
    // The nonce proves WHO started the flow. It says nothing about whether the
    // path is safe, so the path is validated independently.
    const nonce = newStateNonce();
    const v = verifyOAuthState(`${nonce}:https://evil.com`, nonce);
    expect(v.returnPath).toBe('/buddy/home');
  });

  it('nonces are unguessable and unique', () => {
    const seen = new Set(Array.from({ length: 200 }, () => newStateNonce()));
    expect(seen.size).toBe(200);
    expect([...seen].every((n) => /^[0-9a-f]{32}$/.test(n))).toBe(true);
  });
});

describe('the routes actually use the guarded helpers', () => {
  const connect = codeOnly(readFileSync('src/app/api/google/connect/route.ts', 'utf8'));
  const callback = codeOnly(readFileSync('src/app/api/google/callback/route.ts', 'utf8'));

  it('connect validates `from` rather than trusting it', () => {
    expect(connect).toMatch(/safeReturnPath\(\s*new URL\(request\.url\)\.searchParams\.get\('from'\)/);
  });

  it('connect issues a nonce and stores it in an httpOnly cookie', () => {
    expect(connect).toMatch(/newStateNonce\(\)/);
    expect(connect).toMatch(new RegExp(`cookies\\.set\\(\\s*${OAUTH_STATE_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|cookies\\.set\\(\\s*OAUTH_STATE_COOKIE`));
    expect(connect).toMatch(/httpOnly:\s*true/);
    expect(connect).toMatch(/sameSite:\s*'lax'/);
  });

  it('the callback never redirects to a raw state value again', () => {
    // The exact defect: decodeURIComponent(state) used as a redirect target.
    expect(callback).not.toMatch(/decodeURIComponent\(\s*params\.get\('state'\)/);
  });

  it('state is verified BEFORE the code is exchanged for a token', () => {
    const verified = callback.indexOf('verifyOAuthState');
    const exchanged = callback.indexOf('exchangeCodeAndStore(');
    expect(verified).toBeGreaterThan(-1);
    expect(exchanged).toBeGreaterThan(-1);
    expect(
      verified,
      'a callback that exchanges first has already done the work an unverified state should never trigger',
    ).toBeLessThan(exchanged);
  });

  it('a rejected state is audited, not silently swallowed', () => {
    expect(callback).toMatch(/stage:\s*'state'/);
  });
});

describe('scopes stay minimal — verification burden is a product cost', () => {
  it('requests exactly calendar.events and the email identity', () => {
    // calendar.events is a SENSITIVE scope: it is why Google shows the
    // "hasn't verified this app" interstitial, and why verification is
    // required before the 100-user cap lifts. Widening to `calendar` (full
    // read/write of every calendar) would push this into RESTRICTED, which
    // needs an annual third-party security assessment.
    expect(GOOGLE_SCOPES.split(' ').sort()).toEqual([
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
    ]);
  });

  it('never requests the full-calendar or restricted scopes', () => {
    expect(GOOGLE_SCOPES).not.toMatch(/auth\/calendar(\s|$)/);
    expect(GOOGLE_SCOPES).not.toMatch(/gmail|drive|contacts/);
  });
});

describe('Google never touches the payment path', () => {
  // Founder rule: a student buys the ₹299 session with no Google step at all.
  it.each([
    'src/app/api/sessions/book/route.ts',
    'src/app/api/payments/webhook/route.ts',
    'src/lib/activate-payment.ts',
  ])('%s contains no Google dependency', (file) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(/google/i);
  });
});
