import { NextResponse } from 'next/server';
import { googleConfigured, googleRedirectUri, googleConsentUrl, GOOGLE_SCOPES } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';

// Unauthenticated setup probe. Deliberately public and deliberately boring:
// it reports whether the SERVER has Google credentials and which redirect URI
// it will send to Google — nothing about any user, and no secret.
//
// It exists because the connect route checks auth first, so an unauthenticated
// probe always bounces to /login and tells you nothing. When a mentor hits
// redirect_uri_mismatch at 9pm, the first question is "what URI is the server
// actually using?" — this answers it in one request instead of a redeploy.
export async function GET() {
  const configured = googleConfigured();
  const redirectUri = googleRedirectUri();

  // THE decisive check, run by the server against Google itself: fetch our own
  // consent URL and read Google's verdict. 'invalid_client' in the reply means
  // the client id this deployment carries no longer exists at Google — which
  // is exactly what a deleted-and-recreated OAuth client looks like, and what
  // three days of "it's not connecting" turned out to be. No login required;
  // Google renders its error (or its sign-in page) to anyone.
  let googleRecognizesClient: boolean | null = null;
  if (configured) {
    try {
      const probe = await fetch(googleConsentUrl('probe'), { redirect: 'follow' });
      const body = await probe.text();
      googleRecognizesClient = !body.includes('invalid_client');
    } catch { /* network blip — unknown, not false */ }
  }
  return NextResponse.json({
    configured,
    redirectUri,
    scopes: GOOGLE_SCOPES.split(' '),
    // The NUMERIC PREFIX identifies which client is deployed. It is the
    // public half of a public identifier (every web page using Google
    // sign-in ships its full client id to every visitor) — while the old
    // suffix fingerprint showed the last 24 chars, which for EVERY Google
    // client id is "…ps.googleusercontent.com". A fingerprint that is
    // identical for every possible value fingerprints nothing.
    clientIdPrefix: process.env.GOOGLE_CLIENT_ID
      ? `${process.env.GOOGLE_CLIENT_ID.split('-')[0]}-…`
      : null,
    googleRecognizesClient,
    hasSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    message: !configured
      ? 'GOOGLE_CLIENT_ID and/or GOOGLE_CLIENT_SECRET are missing from this deployment.'
      : googleRecognizesClient === false
        ? 'Google does NOT recognize the deployed client id (invalid_client) — the OAuth client was deleted. Create a new OAuth client in Google Cloud Console and update both env vars.'
        : `Google recognizes this client. Whitelist exactly this redirect URI: ${redirectUri}`,
  }, { status: configured ? 200 : 503 });
}
