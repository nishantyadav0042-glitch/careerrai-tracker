import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  newStateNonce, encodeOAuthState, verifyOAuthState, googleConsentUrl,
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
