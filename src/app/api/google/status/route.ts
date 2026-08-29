import { NextResponse } from 'next/server';
import {
  googleConfigured, googleRedirectUri, googleConsentUrl, GOOGLE_SCOPES, googleSecretShape, googleClientId, googleClientSecret, OAUTH_TOKEN,
} from '@/lib/google-oauth';
import { APP_ORIGINS, SITE_URL } from '@/lib/site';
import { probeRedirectUri, withRedirectUri } from '@/lib/google-consent-probe';
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
  // The NUMERIC PREFIX identifies which client is deployed. It is the public
  // half of a public identifier (every page using Google sign-in ships its
  // full client id to every visitor) — while the old suffix fingerprint showed
  // the last 24 chars, which for EVERY Google client id is
  // "…ps.googleusercontent.com". A fingerprint identical for every possible
  // value fingerprints nothing.
  const clientIdPrefix = process.env.GOOGLE_CLIENT_ID
    ? `${process.env.GOOGLE_CLIENT_ID.split('-')[0]}-…`
    : null;
  const redirectUri = googleRedirectUri();
  // CareerRai serves from two origins and an OAuth round trip must finish on
  // the one it started on, so BOTH callback URIs must be registered on the
  // Google client. Listing them here answers "what exactly do I paste into
  // Authorized redirect URIs?" without a redeploy or a code read.
  const allRedirectUris = APP_ORIGINS.map((o) => `${o}/api/google/callback`);

  // ── WHICH CALLBACK URIs DOES GOOGLE ACTUALLY HOLD? (29 Aug) ─────────────
  //
  // The check that used to live here fetched the consent URL, followed every
  // redirect, and searched the resulting HTML for `invalid_client`. It could
  // therefore detect exactly one failure — a deleted OAuth client — and was
  // blind to the one production actually had: a client that exists and does
  // not list the URI we send. Google calls that `redirect_uri_mismatch`, which
  // contains no `invalid_client` anywhere, so the endpoint reported a cheerful
  // `googleRecognizesClient: true` while a mentor starting on the legacy PWA
  // origin got "Access blocked. Error 400" every single time.
  //
  // Each shipped origin is now asked about individually, using the REAL
  // consent-URL builder, so what is tested is exactly what a mentor's browser
  // would be sent — not a reconstruction of it that can drift.
  const redirectUriCheck = configured ? await probeRedirectUris() : null;
  // Kept, because it answers a different question and other things read it:
  // does this client EXIST at Google. A redirect_uri_mismatch proves it does
  // — Google had to look the client up to compare URIs against it.
  const googleRecognizesClient = redirectUriCheck?.clientRecognized ?? null;

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
    clientIdPrefix,
    googleRecognizesClient,
    redirectUriCheck,
    hasSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    // Shape only, never the value. A Google client secret is `GOCSPX-` + 28
    // characters; anything else is not the string the dashboard shows, and
    // Google reports that as "The provided client secret is invalid."
    secretShape: googleSecretShape(),
    secretCheck,
    message: !configured
      ? 'GOOGLE_CLIENT_ID and/or GOOGLE_CLIENT_SECRET are missing from this deployment.'
      : googleRecognizesClient === false
        ? 'Google does NOT recognize the deployed client id — the OAuth client was deleted. Create a new OAuth client in Google Cloud Console and update both env vars.'
        : redirectUriCheck?.methodValid === false
          ? 'The redirect-URI check could not validate itself against its own control, so its verdicts are withheld. Treat the URIs as UNKNOWN, not as correct.'
          : redirectUriCheck?.missing.length
            ? `Google does NOT hold ${redirectUriCheck.missing.length} of the callback URIs this app sends. Add each of these to Authorized redirect URIs on client ${clientIdPrefix ?? '(unknown)'}: ${redirectUriCheck.missing.join(', ')}`
            : redirectUriCheck?.allRegistered
              ? 'Every callback URI this app sends is registered on the deployed client.'
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

/**
 * Does the deployed secret actually belong to the deployed client?
 *
 * Nothing before the token exchange can tell you. Google validates client_id
 * and redirect_uri at the consent screen and never looks at the secret until
 * the code is redeemed — the last step of the flow. A mismatched pair
 * therefore produces a perfectly normal consent screen, a green
 * `googleRecognizesClient`, and a failure only at the very end. That is why
 * "The provided client secret is invalid." was the fourth distinct error on
 * this flow in one day, and only surfaced once everything else was fixed.
 *
 * So ask the token endpoint directly, with a code that is deliberately not a
 * real one. Google answers the CLIENT question before the CODE question:
 *
 *   invalid_client → the client_id/secret pair is wrong. This is the bug.
 *   invalid_grant  → the pair authenticated; only the fake code failed. PASS.
 *
 * It lives here, with the other diagnostics, and not in lib/google-oauth:
 * that module is the OAuth flow's authority, and its guards rightly assert
 * that the redirect_uri in it is always built from the request origin. A
 * config probe has no request origin, and does not belong among them.
 *
 * Side-effect free: an invalid code cannot mint a token, consume a grant, or
 * touch a mentor's account.
 */
async function probeClientSecret() {
  if (!googleConfigured()) return { probed: false, reason: 'Google credentials are not configured.' };
  try {
    const res = await fetch(OAUTH_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: 'careerrai-config-probe-not-a-real-authorization-code',
        client_id: googleClientId(),
        client_secret: googleClientSecret(),
        redirect_uri: googleRedirectUri(),
        grant_type: 'authorization_code',
      }).toString(),
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    const err = typeof body?.error === 'string' ? body.error : undefined;
    return {
      probed: true,
      secretMatchesClient: err === 'invalid_grant',
      googleError: err,
      googleErrorDescription: typeof body?.error_description === 'string'
        ? body.error_description : undefined,
      message: err === 'invalid_grant'
        ? 'The secret belongs to this client. Only the deliberately fake code was rejected.'
        : err === 'invalid_client'
          ? 'GOOGLE_CLIENT_SECRET does not belong to GOOGLE_CLIENT_ID. Copy the secret from THIS client in Google Cloud Console.'
          : `Unexpected reply from Google: ${err ?? 'none'}.`,
    };
  } catch (e) {
    return { probed: false, reason: String(e) };
  }
}

/**
 * Ask Google, one URI at a time, which of our callbacks it will accept.
 *
 * ── THE CONTROL IS NOT DECORATION ──────────────────────────────────────────
 *
 * This probe classifies by the shape of a redirect Google chose to send. That
 * shape is Google's to change, and the day it changes, a check with no control
 * quietly starts calling everything registered — the most dangerous possible
 * failure, because it looks exactly like success. So every run also asks about
 * a URI that CANNOT be registered. If Google calls that one registered, the
 * method is not discriminating, and every verdict in the same run is withdrawn
 * rather than reported. A trustworthy UNKNOWN beats a precise lie.
 */
async function probeRedirectUris() {
  // Built by the REAL consent-URL builder, once per shipped origin, so the
  // thing under test is the exact URL a mentor's browser would be sent.
  const uris = await Promise.all(
    APP_ORIGINS.map(async (origin) => ({
      uri: googleRedirectUri(origin),
      ...(await probeRedirectUri(googleConsentUrl('probe', origin))),
    })),
  );

  // Same client, same request, one URI nobody would ever register.
  const controlUri = `${SITE_URL}/api/google/callback/__careerrai_control_never_registered__`;
  const control = {
    uri: controlUri,
    ...(await probeRedirectUri(withRedirectUri(googleConsentUrl('probe'), controlUri))),
  };
  const methodValid = control.registered === false;

  // A mismatch proves the client EXISTS — Google looked it up to compare URIs
  // against it. Only invalid_client/deleted_client says otherwise, and an
  // unreachable Google says neither.
  const errors = uris.map((u) => (u.registered === false ? u.googleError : null));
  const clientRecognized =
    uris.some((u) => u.registered === true) ? true
      : errors.some((e) => e === 'deleted_client' || e === 'invalid_client') ? false
        : errors.some((e) => e === 'redirect_uri_mismatch') ? true
          : null;

  return {
    probed: true,
    methodValid,
    control,
    uris,
    // Withheld unless the control proved the method still tells the two apart.
    missing: methodValid ? uris.filter((u) => u.registered === false).map((u) => u.uri) : [],
    allRegistered: methodValid && uris.every((u) => u.registered === true),
    clientRecognized,
  };
}
