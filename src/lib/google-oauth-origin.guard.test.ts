import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from './test-support/code-only';
import { SITE_URL, APP_ORIGINS, LEGACY_PWA_ORIGIN, resolveAppOrigin } from './site';
import { googleRedirectUri, googleConsentUrl, verifyOAuthState, encodeOAuthState, newStateNonce } from './google-oauth';

// ── AN OAUTH ROUND TRIP MUST START AND FINISH ON ONE ORIGIN ────────────────
//
// Production incident, 29 Aug 2026. CareerRai serves from careerrai.in AND
// careerrai-daily.vercel.app — the second is deliberately NOT redirected,
// because installed PWAs and their push subscriptions live on that origin.
// Cookies are host-scoped, so a session and an OAuth state nonce set on one
// origin do not exist on the other.
//
// googleRedirectUri() returned `${SITE_URL}/api/google/callback` regardless of
// where the flow began. A mentor signed in on careerrai-daily.vercel.app was
// therefore returned by Google to careerrai.in, which held neither their
// session nor their nonce. The callback's first line found no user and
// redirected to /login — indistinguishable from being logged out, and the ONLY
// branch in that route that wrote no audit row. The empty audit log read as
// "the callback never ran", and ten days went into Google Cloud, where nothing
// was ever wrong.
//
// These tests are the shape of that bug.

const ROOT = join(__dirname, '..');
const read = (rel: string) => codeOnly(readFileSync(join(ROOT, rel), 'utf8'));

const CANONICAL = 'https://careerrai.in';
const LEGACY = 'https://careerrai-daily.vercel.app';

describe('the two live origins are both first-class', () => {
  it('the allowlist is exactly the two production origins', () => {
    expect(SITE_URL).toBe(CANONICAL);
    expect(LEGACY_PWA_ORIGIN).toBe(LEGACY);
    expect([...APP_ORIGINS].sort()).toEqual([CANONICAL, LEGACY].sort());
  });

  // TEST 1 — flow started on careerrai.in resolves to careerrai.in
  it('TEST 1: a flow started on careerrai.in comes back to careerrai.in', () => {
    expect(googleRedirectUri(CANONICAL)).toBe(`${CANONICAL}/api/google/callback`);
    expect(googleConsentUrl('s', CANONICAL))
      .toContain(encodeURIComponent(`${CANONICAL}/api/google/callback`));
  });

  // TEST 2 — the bug: flow started on the legacy PWA origin
  it('TEST 2: a flow started on careerrai-daily.vercel.app comes back THERE', () => {
    // Before the fix this returned careerrai.in and stranded the mentor.
    expect(googleRedirectUri(LEGACY)).toBe(`${LEGACY}/api/google/callback`);
    expect(googleConsentUrl('s', LEGACY))
      .toContain(encodeURIComponent(`${LEGACY}/api/google/callback`));
  });

  // TEST 3 — an origin nobody approved
  it('TEST 3: an unapproved origin is refused, never echoed', () => {
    for (const evil of [
      'https://evil.example',
      'https://careerrai.in.evil.example',
      'http://careerrai.in',            // wrong scheme
      'https://careerrai-daily.vercel.app.evil.example',
      '//evil.example',
      'javascript:alert(1)',
    ]) {
      expect(resolveAppOrigin(evil), `${evil} must not be trusted`).toBe(SITE_URL);
      expect(googleRedirectUri(evil)).toBe(`${SITE_URL}/api/google/callback`);
    }
  });

  it('a missing or malformed origin falls back to canonical, never throws', () => {
    for (const v of [null, undefined, '', 123 as unknown as string, {} as unknown as string]) {
      expect(resolveAppOrigin(v as string | null | undefined)).toBe(SITE_URL);
    }
  });

  it('the token exchange presents the SAME redirect_uri as consent', () => {
    // Google rejects the exchange if the two differ by a single byte. Both are
    // built from googleRedirectUri(origin), so this is a structural assertion.
    const code = read('lib/google-oauth.ts');
    const exchangeAt = code.indexOf('grant_type: \'authorization_code\'');
    expect(exchangeAt).toBeGreaterThan(-1);
    expect(code.slice(exchangeAt - 400, exchangeAt)).toMatch(/redirect_uri:\s*googleRedirectUri\(origin\)/);
  });
});

describe('state still binds the callback to the browser that started it', () => {
  // TEST 4 — tampering
  it('TEST 4: a tampered state is rejected', () => {
    const nonce = newStateNonce();
    const state = encodeOAuthState(nonce, '/buddy/home');
    expect(verifyOAuthState(state, nonce).ok).toBe(true);

    // A TAMPER THAT ALWAYS TAMPERS. This read `nonce.replace(/.$/, '0')` and
    // went red in CI on 29 Aug: the nonce is 32 hex characters, so one run in
    // sixteen already ended in '0', the "tampered" state was byte-identical to
    // the original, and verifyOAuthState correctly accepted it. The test was
    // right and the fixture was wrong — a 6% flake that looks exactly like a
    // security regression on the morning it fires.
    const flipLast = (n: string) => n.slice(0, -1) + (n.endsWith('0') ? '1' : '0');
    expect(flipLast(nonce), 'the fixture did not actually change the nonce').not.toBe(nonce);
    expect(verifyOAuthState(state.replace(nonce, flipLast(nonce)), nonce).ok).toBe(false);
    expect(verifyOAuthState(`${nonce}x:/buddy/home`, nonce).ok).toBe(false);
  });

  // TEST 5 — expiry is the cookie's job; absence must fail closed
  it('TEST 5: an expired state (cookie gone) is rejected', () => {
    const nonce = newStateNonce();
    const state = encodeOAuthState(nonce, '/buddy/home');
    // A 30-minute cookie that has lapsed presents as no nonce at all.
    expect(verifyOAuthState(state, null).ok).toBe(false);
    expect(verifyOAuthState(state, '').ok).toBe(false);
    expect(verifyOAuthState(state, undefined).ok).toBe(false);
  });

  it('the return path can never leave the origin, even with a valid nonce', () => {
    const nonce = newStateNonce();
    expect(verifyOAuthState(`${nonce}://evil.example`, nonce).returnPath).toBe('/buddy/home');
    expect(verifyOAuthState(`${nonce}:https://evil.example`, nonce).returnPath).toBe('/buddy/home');
  });
});

describe('the callback is observable, and the surfaces stay separate', () => {
  const callback = read('app/api/google/callback/route.ts');

  // TEST 6 — the branch that cost ten days
  it('TEST 6: no session at the callback is AUDITED, not a silent redirect', () => {
    const noUserAt = callback.search(/if\s*\(\s*!user\s*\)/);
    expect(noUserAt, 'the unauthenticated branch vanished — update this guard').toBeGreaterThan(-1);
    const branch = callback.slice(noUserAt, noUserAt + 700);
    expect(branch, 'the silent redirect is back — this is the exact regression').toMatch(/await audit\(/);
    expect(branch).toMatch(/no_session_at_callback/);
    expect(branch).toMatch(/originMismatch/);
  });

  it('that audit records no credential of any kind', () => {
    const noUserAt = callback.search(/if\s*\(\s*!user\s*\)/);
    const branch = callback.slice(noUserAt, noUserAt + 700);
    expect(branch).not.toMatch(/\b(code|access_token|refresh_token|client_secret)\b\s*[,:]/);
  });

  // TEST 7 — the working flow is unchanged in shape
  it('TEST 7: the successful path still verifies state before exchanging', () => {
    const stateAt = callback.indexOf('verifyOAuthState(');
    const exchangeAt = callback.indexOf('exchangeCodeAndStore(');
    expect(stateAt).toBeGreaterThan(-1);
    expect(exchangeAt).toBeGreaterThan(stateAt);
    expect(callback).toMatch(/exchangeCodeAndStore\(code,\s*user\.id,\s*origin\)/);
  });

  it('the connect route starts the flow on the request origin', () => {
    const connect = read('app/api/google/connect/route.ts');
    expect(connect).toMatch(/const origin = new URL\(request\.url\)\.origin/);
    // The real call nests encodeURIComponent(...), so match across it.
    expect(connect).toMatch(/googleConsentUrl\([\s\S]{0,200}?,\s*origin\s*\)/);
  });

  // TEST 8 — student login must not have been touched
  it('TEST 8: student Google login is untouched by this change', () => {
    const login = read('components/auth/continue-with-google.tsx');
    // Still Supabase-brokered, still identity-only, and it never references
    // our own calendar callback or the origin allowlist.
    expect(login).toMatch(/signInWithOAuth/);
    expect(login).toMatch(/const SCOPES = 'openid email profile'/);
    expect(login).not.toMatch(/api\/google\/callback/);
    expect(login).not.toMatch(/googleRedirectUri|APP_ORIGINS/);
  });
});
