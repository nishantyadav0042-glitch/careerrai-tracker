import { describe, it, expect } from 'vitest';
import { classifyConsentRedirect, withRedirectUri } from './google-consent-probe';

// ── THE FIXTURES ARE REAL ───────────────────────────────────────────────────
//
// Both Location headers below were captured from accounts.google.com on
// 29 Aug 2026, probing the deployed CareerRai client 307670815298 with two
// redirect URIs: the canonical callback, which Google holds, and the legacy
// PWA callback, which it did not. Invented fixtures would only prove that this
// code agrees with my idea of Google, which is the thing that was wrong.

const REGISTERED = 'https://accounts.google.com/v3/signin/identifier'
  + '?opparams=%253F&dsh=S1815531130%3A1788008354699203&access_type=offline'
  + '&client_id=307670815298-a3edbgbng4j4f5f0evs3jvlt82lvh8c6.apps.googleusercontent.com'
  + '&o2v=2&redirect_uri=https%3A%2F%2Fcareerrai.in%2Fapi%2Fgoogle%2Fcallback'
  + '&response_type=code&service=lso&state=probe&flowName=GeneralOAuthLite';

// Trimmed to the leading field of Google's protobuf, which still decodes: the
// first bytes are 0x0a 0x15 followed by the 21-character error name.
const MISMATCH = 'https://accounts.google.com/signin/oauth/error'
  + '?authError=ChVyZWRpcmVjdF91cmlfbWlzbWF0Y2g%3D'
  + '&flowName=GeneralOAuthFlow'
  + '&client_id=307670815298-a3edbgbng4j4f5f0evs3jvlt82lvh8c6.apps.googleusercontent.com';

describe('Google names a missing redirect URI in the Location header', () => {
  it('a registered URI sends the browser to sign-in', () => {
    expect(classifyConsentRedirect(REGISTERED, 302)).toEqual({ registered: true });
  });

  it('an unregistered URI is redirect_uri_mismatch, not silence', () => {
    // THE BUG THIS REPLACES: the old check searched the followed HTML for
    // `invalid_client`. This response contains no such string anywhere, so it
    // was scored as a healthy client — while every mentor on that origin got
    // "Access blocked. Error 400".
    expect(MISMATCH).not.toContain('invalid_client');
    expect(classifyConsentRedirect(MISMATCH, 302))
      .toEqual({ registered: false, googleError: 'redirect_uri_mismatch' });
  });

  it('a deleted client is told apart from a missing URI', () => {
    const deleted = 'https://accounts.google.com/signin/oauth/error?authError='
      + encodeURIComponent(Buffer.from('\n\x0edeleted_client').toString('base64'));
    expect(classifyConsentRedirect(deleted, 302))
      .toEqual({ registered: false, googleError: 'deleted_client' });
  });

  it('an error shape nobody has seen is named, never guessed as registered', () => {
    const odd = 'https://accounts.google.com/signin/oauth/error?authError=Zm9vYmFy';
    expect(classifyConsentRedirect(odd, 302))
      .toEqual({ registered: false, googleError: 'unrecognized_oauth_error' });
  });
});

describe('UNKNOWN is a verdict, not a fallback to true', () => {
  it('no Location at all is unknown', () => {
    const v = classifyConsentRedirect(null, 500);
    expect(v.registered).toBeNull();
    expect(v).toHaveProperty('reason');
  });

  it('an unparseable Location is unknown', () => {
    expect(classifyConsentRedirect('not a url', 302).registered).toBeNull();
  });

  it('unknown is never reported as registered', () => {
    for (const l of [null, '', 'not a url', '///']) {
      expect(classifyConsentRedirect(l, 302).registered).not.toBe(true);
    }
  });
});

describe('the control URI is what keeps the verdicts honest', () => {
  it('swapping the redirect_uri changes only that parameter', () => {
    const consent = 'https://accounts.google.com/o/oauth2/v2/auth'
      + '?client_id=abc&redirect_uri=https%3A%2F%2Fcareerrai.in%2Fapi%2Fgoogle%2Fcallback'
      + '&response_type=code&scope=x&state=probe';
    const swapped = new URL(withRedirectUri(consent, 'https://careerrai.in/nope'));
    expect(swapped.searchParams.get('redirect_uri')).toBe('https://careerrai.in/nope');
    for (const k of ['client_id', 'response_type', 'scope', 'state']) {
      expect(swapped.searchParams.get(k)).toBe(new URL(consent).searchParams.get(k));
    }
    // Exactly one parameter differs — the one under test.
    expect([...swapped.searchParams.keys()].sort())
      .toEqual([...new URL(consent).searchParams.keys()].sort());
  });

  it('a control that came back REGISTERED means the method has stopped working', () => {
    // The status route withholds every verdict in that case. This asserts the
    // premise it rests on: a sign-in redirect for a URI we know is not
    // registered would be indistinguishable from a genuine pass.
    expect(classifyConsentRedirect(REGISTERED, 302)).toEqual({ registered: true });
  });
});
