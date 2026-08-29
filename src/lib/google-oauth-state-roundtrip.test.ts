import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  newStateNonce, encodeOAuthState, verifyOAuthState, googleConsentUrl,
  newCodeVerifier, codeChallengeFor,
} from './google-oauth';
import { codeOnly } from './test-support/code-only';

// ── THE STATE MUST SURVIVE THE ROUND TRIP TO GOOGLE AND BACK ────────────────
//
// Incident #45, 29 Aug. /api/google/connect built the consent URL as
//
//     googleConsentUrl(encodeURIComponent(encodeOAuthState(nonce, from)))
//
// while googleConsentUrl assembles its query with URLSearchParams, which
// percent-encodes every value itself. The state went to Google encoded TWICE.
//
// Coming back, the one decode a query parser performs left
// `<nonce>%3A%2Fbuddy%2Fhome` — no literal colon. verifyOAuthState splits on
// the first ':', found none, took the nonce as the empty string, and refused
// the callback as `state_mismatch`.
//
// Every mentor connection that has ever been attempted failed this way:
// google_oauth_tokens held 0 rows, and the audit log read
// `{stage: "state", reason: "state_mismatch"}` on a flow nobody had tampered
// with. The message named CSRF and said nothing about encoding, which is why
// it survived four separate investigations.
//
// Unit-testing encode and verify against each other could never have caught
// it: they agree perfectly, and the corruption happens between them, in the
// URL. So this drives the whole trip — build the real consent URL, parse it
// the way a browser and Google do, and verify what comes back.

process.env.GOOGLE_CLIENT_ID ??= 'test-client.apps.googleusercontent.com';

/** What a browser + Google + a query parser do to `state` in transit. */
function roundTrip(state: string): string | null {
  const consent = googleConsentUrl(state, 'https://careerrai.in');
  // Google echoes the value it received back on the callback URL.
  const received = new URL(consent).searchParams.get('state')!;
  const callback = new URL(`https://careerrai.in/api/google/callback?code=x`);
  callback.searchParams.set('state', received);
  return new URL(callback.toString()).searchParams.get('state');
}

describe('the OAuth state survives Google', () => {
  it('a nonce sent to Google comes back matching the cookie', () => {
    const nonce = newStateNonce();
    const returned = roundTrip(encodeOAuthState(nonce, '/buddy/home'));

    const { ok, returnPath } = verifyOAuthState(returned, nonce);
    expect(ok, 'the state did not survive the round trip — the mentor sees '
      + '?google=failed and the audit log says state_mismatch').toBe(true);
    expect(returnPath).toBe('/buddy/home');
  });

  it('double-encoding the state is exactly what broke it', () => {
    // The bug, reproduced. Kept so the failure mode stays recognisable rather
    // than becoming folklore about "a state bug once".
    const nonce = newStateNonce();
    const doubled = roundTrip(encodeURIComponent(encodeOAuthState(nonce, '/buddy/home')));

    expect(doubled, 'the colon should still be escaped after one decode')
      .not.toContain(':');
    expect(verifyOAuthState(doubled, nonce).ok,
      'double-encoded state must fail — if this passes the reproduction is stale')
      .toBe(false);
  });

  it('the connect route does not encode what URLSearchParams will encode', () => {
    // The round-trip test above proves the property; this pins the specific
    // line, because the two encoders live in different files and a future
    // edit could reintroduce the pairing without touching either one.
    const src = codeOnly(readFileSync(
      join(__dirname, '..', 'app/api/google/connect/route.ts'), 'utf8'));
    expect(src, 'connect re-encodes a value googleConsentUrl already encodes')
      .not.toMatch(/googleConsentUrl\(\s*encodeURIComponent/);
    expect(src).toMatch(/googleConsentUrl\(\s*encodeOAuthState\(/);
  });

  it('still rejects a genuinely tampered state', () => {
    // The check that was doing its job all along, kept honest.
    const nonce = newStateNonce();
    const returned = roundTrip(encodeOAuthState(nonce, '/buddy/home'))!;
    const flipped = nonce.slice(0, -1) + (nonce.endsWith('0') ? '1' : '0');

    expect(verifyOAuthState(returned.replace(nonce, flipped), nonce).ok).toBe(false);
    expect(verifyOAuthState(returned, null).ok, 'no cookie must not pass').toBe(false);
  });
});

// ── PKCE ON THE MENTOR FLOW ─────────────────────────────────────────────────
//
// Google Cloud's Project Checkup flagged this app: "not configured to use
// secure OAuth flows and may be vulnerable to impersonation." It was right —
// the mentor flow, which carries the sensitive calendar.events scope, sent no
// code_challenge at all, while the student flow has had PKCE all along because
// Supabase does it.
//
// An authorization code travels as a query parameter on a redirect: browser
// history, a leaked Referer, a proxy log. Without PKCE, whoever obtains one can
// redeem it. These tests exist because removing the challenge is a silent
// change — the flow keeps working perfectly, and only the security property
// disappears.

describe('the mentor flow uses PKCE', () => {
  it('sends a real S256 challenge, never the verifier itself', async () => {
    const verifier = newCodeVerifier();
    const challenge = await codeChallengeFor(verifier);

    expect(verifier.length).toBeGreaterThanOrEqual(43);   // RFC 7636 floor
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(challenge).not.toBe(verifier);
    expect(challenge, 'base64url only — no +, / or = may reach the URL')
      .toMatch(/^[A-Za-z0-9_-]+$/);

    const url = new URL(googleConsentUrl('s', 'https://careerrai.in', challenge));
    expect(url.searchParams.get('code_challenge')).toBe(challenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.toString(), 'the verifier must never leave the server')
      .not.toContain(verifier);
  });

  it('is deterministic, so the verifier proves the challenge', async () => {
    const v = newCodeVerifier();
    expect(await codeChallengeFor(v)).toBe(await codeChallengeFor(v));
    expect(await codeChallengeFor(v)).not.toBe(await codeChallengeFor(newCodeVerifier()));
  });

  it('connect sends the challenge and callback presents the verifier', () => {
    // The structural half. Dropping either side leaves a flow that still works
    // and is no longer protected — exactly the mutation that passed silently
    // before this test existed.
    const connect = codeOnly(readFileSync(
      join(__dirname, '..', 'app/api/google/connect/route.ts'), 'utf8'));
    expect(connect, 'connect no longer mints a PKCE verifier').toMatch(/newCodeVerifier\(/);
    expect(connect, 'connect no longer sends a challenge').toMatch(/codeChallengeFor\(/);
    expect(connect, 'the challenge is not passed to the consent URL')
      .toMatch(/googleConsentUrl\([\s\S]{0,200}?challenge/);

    const callback = codeOnly(readFileSync(
      join(__dirname, '..', 'app/api/google/callback/route.ts'), 'utf8'));
    expect(callback, 'the callback does not present the verifier at exchange')
      .toMatch(/exchangeCodeAndStore\([\s\S]{0,160}?OAUTH_PKCE_COOKIE/);
    expect(callback, 'the verifier cookie is not cleared on every exit')
      .toMatch(/OAUTH_PKCE_COOKIE,\s*''/);
  });
});
