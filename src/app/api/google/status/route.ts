import { NextResponse } from 'next/server';
import { googleConfigured, googleRedirectUri, GOOGLE_SCOPES } from '@/lib/google-oauth';

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
  return NextResponse.json({
    configured,
    redirectUri,
    scopes: GOOGLE_SCOPES.split(' '),
    // Fingerprint only — enough to confirm WHICH client is deployed without
    // ever exposing the id or the secret.
    clientIdSuffix: process.env.GOOGLE_CLIENT_ID
      ? `…${process.env.GOOGLE_CLIENT_ID.slice(-24)}`
      : null,
    hasSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    message: configured
      ? `Google is configured. Whitelist exactly this redirect URI: ${redirectUri}`
      : 'GOOGLE_CLIENT_ID and/or GOOGLE_CLIENT_SECRET are missing from this deployment.',
  }, { status: configured ? 200 : 503 });
}
