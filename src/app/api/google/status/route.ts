import { NextResponse } from 'next/server';
import {
  googleConfigured, googleRedirectUri, googleConsentUrl, GOOGLE_SCOPES, googleSecretShape, probeClientSecret,
} from '@/lib/google-oauth';
import { APP_ORIGINS, SITE_URL } from '@/lib/site';
import { supabaseUrl } from '@/lib/supabase/env';

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
  // CareerRai serves from two origins and an OAuth round trip must finish on
  // the one it started on, so BOTH callback URIs must be registered on the
  // Google client. Listing them here answers "what exactly do I paste into
  // Authorized redirect URIs?" without a redeploy or a code read.
  const allRedirectUris = APP_ORIGINS.map((o) => `${o}/api/google/callback`);

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
  // ── THE STUDENT FLOW, PROVEN RATHER THAN ASSUMED (29 Aug) ────────────────
  //
  // Everything above describes the MENTOR calendar client, which this app
  // configures itself. Student sign-in does not use it: it goes through
  // Supabase's own Google provider, whose client id and secret live in the
  // Supabase dashboard and appear nowhere in this codebase or its env.
  //
  // That gap cost a day. Google rejected a student sign-in with
  // redirect_uri_mismatch naming client 179880181894…, the founder read the
  // client id this endpoint reports (307670815298…, the mentor one), saw a
  // different number, and reasonably concluded the failing request was not
  // ours. It was — the two flows simply use two different Google clients, and
  // nothing anywhere made that visible.
  //
  // So ask the only component that actually knows. Supabase's /authorize
  // answers with a 302 whose Location IS the Google consent URL it built, with
  // the real client_id and the real redirect_uri in the query string. We follow
  // nothing and read the header: no browser, no login, no secrets, and the
  // answer is Supabase's own rather than our inference about it.
  const studentFlow = await probeStudentFlow();
  // Asks Google whether the deployed secret belongs to the deployed client.
  // Nothing earlier in the flow can answer that — see probeClientSecret.
  const secretCheck = await probeClientSecret();

  return NextResponse.json({
    configured,
    redirectUri,
    allRedirectUris,
    studentFlow,
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
    // Shape only, never the value. A Google client secret is `GOCSPX-` + 28
    // characters; anything else is not the string the dashboard shows, and
    // Google reports that as "The provided client secret is invalid."
    secretShape: googleSecretShape(),
    secretCheck,
    message: !configured
      ? 'GOOGLE_CLIENT_ID and/or GOOGLE_CLIENT_SECRET are missing from this deployment.'
      : googleRecognizesClient === false
        ? 'Google does NOT recognize the deployed client id (invalid_client) — the OAuth client was deleted. Create a new OAuth client in Google Cloud Console and update both env vars.'
        : `Google recognizes this client. Whitelist exactly this redirect URI: ${redirectUri}`,
  }, { status: configured ? 200 : 503 });
}

/**
 * What Supabase actually sends Google for a STUDENT sign-in.
 *
 * Read-only and side-effect free: `redirect: 'manual'` means we never follow
 * the redirect, so no consent screen is reached and no auth state is created.
 * Every value returned here is public — a client id ships to every visitor of
 * every page using Google sign-in, and the redirect URI is visible in the
 * consent URL. Nothing secret is read, because nothing secret is needed: the
 * question is only "which client, and which callback".
 */
async function probeStudentFlow() {
  const base = supabaseUrl();  // already cleaned and de-slashed by the env authority
  if (!base) return { probed: false, reason: 'NEXT_PUBLIC_SUPABASE_URL is not set' };

  // What Supabase's Google client MUST have registered. This string is fixed by
  // Supabase's architecture — it is not ours to choose, and it is the value to
  // paste into the Google client that Supabase is configured with.
  const requiredRedirectUri = `${base}/auth/v1/callback`;

  try {
    const res = await fetch(
      `${base}/auth/v1/authorize?provider=google`
        + `&redirect_to=${encodeURIComponent(`${SITE_URL}/auth/callback`)}`,
      { redirect: 'manual', cache: 'no-store' },
    );
    const location = res.headers.get('location');
    if (!location) {
      return {
        probed: true, ok: false, supabaseStatus: res.status, requiredRedirectUri,
        message: res.status === 400 || res.status === 404
          ? 'Supabase did not redirect — the Google provider is probably disabled in Authentication → Providers.'
          : 'Supabase did not return a redirect; the Google provider may be misconfigured.',
      };
    }

    const url = new URL(location);
    const clientId = url.searchParams.get('client_id');
    const sentRedirectUri = url.searchParams.get('redirect_uri');
    const matches = sentRedirectUri === requiredRedirectUri;

    return {
      probed: true,
      ok: matches,
      googleHost: url.host,
      // Numeric prefix only — enough to tell two clients apart, which is the
      // entire question, without printing a full identifier into a log.
      clientIdPrefix: clientId ? `${clientId.split('-')[0]}-…` : null,
      redirectUriSupabaseSends: sentRedirectUri,
      requiredRedirectUri,
      scope: url.searchParams.get('scope'),
      message: matches
        ? `Supabase sends client ${clientId?.split('-')[0]} with the correct callback. `
          + `If Google still answers redirect_uri_mismatch, that exact URI is missing from THAT client.`
        : `Supabase sends redirect_uri=${sentRedirectUri}, which is not ${requiredRedirectUri}.`,
    };
  } catch (e) {
    return { probed: false, requiredRedirectUri, reason: String(e) };
  }
}
