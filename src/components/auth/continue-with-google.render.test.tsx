import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContinueWithGoogle } from './continue-with-google';

/**
 * ── TWO GOOGLE PURPOSES, KEPT APART ─────────────────────────────────────────
 *
 * Student sign-in and mentor calendar access are different OAuth purposes with
 * different scopes, different clients and different callbacks. The failure this
 * file guards against is them converging: a student asked for calendar
 * permission at signup, or a mentor's sensitive scope smuggled into the
 * identity flow. Either would drag every student into the sensitive-scope
 * verification story for access we have no use for.
 *
 * It also pins the founder's absolute rule: Google must NEVER appear in the
 * payment path.
 *
 * Comments are stripped before every source scan — the prose above names the
 * exact strings being banned.
 */

const SRC = join(__dirname, '..', '..');
const SELF = join(__dirname, 'continue-with-google.tsx');

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('student sign-in asks for identity, never calendar', () => {
  const code = codeOnly(readFileSync(SELF, 'utf8'));

  it('goes through Supabase Auth, not our mentor OAuth route', () => {
    expect(code).toMatch(/signInWithOAuth/);
    expect(code).toMatch(/provider:\s*'google'/);
    expect(
      code,
      'a student must never be sent through the mentor Calendar OAuth route',
    ).not.toMatch(/api\/google\/connect/);
  });

  it('requests ONLY openid, email and profile', () => {
    expect(code).toMatch(/openid email profile/);
  });

  it('never requests any Calendar scope', () => {
    for (const banned of [
      'auth/calendar', 'calendar.events', 'calendar.app.created', 'calendar.readonly',
    ]) {
      expect(code, `student sign-in must not request ${banned}`).not.toContain(banned);
    }
  });

  it('never asks Google for offline access', () => {
    // access_type=offline is what makes Google mint a refresh token. Identity
    // sign-in has no use for one, and holding a credential we do not need is
    // how a low-risk flow acquires a high-risk footprint.
    expect(code).not.toMatch(/access_type/);
    expect(code).not.toMatch(/offline/);
  });

  it('returns through the shared auth callback', () => {
    expect(code).toMatch(/\/auth\/callback/);
  });
});

describe('the button itself', () => {
  it('renders a real, enabled Continue with Google control', () => {
    const html = renderToStaticMarkup(<ContinueWithGoogle />);
    expect(html).toMatch(/Continue with Google/);
    expect(html).toMatch(/<button/);
    expect(html).not.toMatch(/disabled=""/);
  });

  it('accepts a custom label without breaking', () => {
    const html = renderToStaticMarkup(<ContinueWithGoogle label="Connect Google" />);
    expect(html).toMatch(/Connect Google/);
    expect(html).not.toContain('undefined');
  });
});

describe('GOOGLE NEVER TOUCHES PAYMENT', () => {
  // The founder's absolute rule. A Google consent screen appearing mid-checkout
  // would cost the sale outright, and a payment that can fail because an
  // unrelated OAuth provider is misconfigured is a payment that will.
  const PAYMENT_PATH = [
    'app/api/sessions/book/route.ts',
    'app/api/payments/webhook/route.ts',
    'app/api/payments/create-order/route.ts',
    'lib/activate-payment.ts',
  ];

  it.each(PAYMENT_PATH)('%s contains no Google anything', (rel) => {
    const code = codeOnly(readFileSync(join(SRC, rel), 'utf8'));
    expect(
      /google|oauth|calendar|signInWithOAuth/i.test(code),
      `${rel} is on the payment path. Google must never gate, interrupt or `
      + 'appear inside checkout — connecting Google is a POST-payment step.',
    ).toBe(false);
  });

  it('found the payment files at all — a bad path would pass vacuously', () => {
    for (const rel of PAYMENT_PATH) {
      expect(readFileSync(join(SRC, rel), 'utf8').length).toBeGreaterThan(200);
    }
  });
});

describe('the auth callback cannot be turned into an open redirect', () => {
  // RAW source, deliberately not comment-stripped. codeOnly() treats the `//`
  // inside the string literal startsWith('//') as the start of a line comment
  // and deletes the rest of the line — so stripping here would hide the very
  // check being asserted. The patterns below are specific enough that no
  // comment in this file could satisfy them by accident.
  const code = readFileSync(join(SRC, 'app', 'auth', 'callback', 'route.ts'), 'utf8');

  it('validates `next` as a same-origin path', () => {
    // `next` arrives on the URL. Echoing it unchecked sends a signed-in
    // student to any site an attacker names — with //evil.com, a
    // protocol-relative URL, being the cheap way to do it.
    expect(code).toMatch(/startsWith\('\/'\)/);
    expect(code).toMatch(/startsWith\('\/\/'\)/);
  });

  it('still routes to the tracker when no next is given', () => {
    expect(code).toMatch(/\/student\/tracker/);
  });
});
