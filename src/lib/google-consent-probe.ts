// ── IS THIS REDIRECT URI ACTUALLY REGISTERED? ───────────────────────────────
//
// 29 Aug 2026. After four fixed bugs on one flow, the founder's Google Cloud
// client was believed to hold all three callback URIs. Asking Google directly
// showed one of them was not there — and no check we had could have said so.
//
// The old check fetched the consent URL, followed every redirect, and searched
// ~800 KB of HTML for the string `invalid_client`. That detects exactly one
// failure (a deleted client) and is blind to the far more common one: a client
// that exists and simply does not list the URI we are sending. Google answers
// that with `redirect_uri_mismatch`, which never contains `invalid_client`, so
// the check reported a cheerful `googleRecognizesClient: true` while every
// mentor starting on that origin hit "Access blocked. Error 400".
//
// Google decides this before it renders anything, and says so in ONE header:
//
//   registered      → 302 to /v3/signin/identifier?...  (the sign-in page)
//   not registered  → 302 to /signin/oauth/error?authError=<base64 protobuf>
//                     whose bytes contain the ASCII `redirect_uri_mismatch`
//
// So the probe follows no redirects and reads the Location. One small request
// per URI instead of a megabyte, no consent screen is ever reached, no auth
// state is created, and nothing secret is sent: a client id is public and the
// redirect URI is the thing being asked about.

/** Where Google sends an authorization request it has refused. */
const CONSENT_ERROR_PATH = '/signin/oauth/error';

export type ConsentVerdict =
  /** Google accepted the client and this URI, and moved on to sign-in. */
  | { registered: true }
  /** Google refused the request. `googleError` is its own name for why. */
  | { registered: false; googleError: string }
  /**
   * UNKNOWN — and said so. A network blip, or a reply in a shape this code has
   * never seen. Never guessed in either direction: a false "registered" sends
   * a mentor into a dead end, and a false "missing" sends the founder editing
   * a Google Cloud console that was correct.
   */
  | { registered: null; reason: string };

/**
 * Read Google's verdict out of the Location header of an unfollowed redirect.
 *
 * Pure, so the shapes below are testable against real captured headers rather
 * than against an idea of what Google sends.
 */
export function classifyConsentRedirect(location: string | null, status: number): ConsentVerdict {
  if (!location) {
    return { registered: null, reason: `Google did not redirect (HTTP ${status})` };
  }

  let url: URL;
  try { url = new URL(location); } catch {
    return { registered: null, reason: 'Google sent a Location this code cannot parse' };
  }

  if (!url.pathname.includes(CONSENT_ERROR_PATH)) {
    // Anything that is not the OAuth error page means Google got as far as
    // asking who the user is, which it does only once the client and the
    // redirect URI have both been accepted.
    return { registered: true };
  }

  return { registered: false, googleError: googleErrorFrom(location) };
}

/**
 * Google packs its reason into `authError` as base64 of a protobuf. The error
 * name is plain ASCII inside those bytes, so decoding as latin1 and looking
 * for the name is enough — and if the decode fails, the raw parameter is
 * searched instead rather than reporting nothing.
 *
 * Read with a regex, not URLSearchParams: the value is standard base64, and
 * `+` is a legal character in it that a form decoder turns into a space.
 */
function googleErrorFrom(location: string): string {
  const raw = /[?&]authError=([^&]+)/.exec(location)?.[1] ?? '';
  let decoded = '';
  try {
    decoded = Buffer.from(
      decodeURIComponent(raw).replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('latin1');
  } catch { /* fall through to the raw parameter */ }

  const haystack = `${decoded} ${raw}`;
  for (const name of ['redirect_uri_mismatch', 'deleted_client', 'invalid_client', 'access_denied']) {
    if (haystack.includes(name)) return name;
  }
  return 'unrecognized_oauth_error';
}

/** Swap the redirect_uri on a consent URL built by the real builder. */
export function withRedirectUri(consentUrl: string, uri: string): string {
  const url = new URL(consentUrl);
  url.searchParams.set('redirect_uri', uri);
  return url.toString();
}

/**
 * Ask Google about one redirect URI. Side-effect free: `redirect: 'manual'`
 * means the sign-in page is never fetched and no session is begun.
 */
export async function probeRedirectUri(consentUrl: string): Promise<ConsentVerdict> {
  try {
    const res = await fetch(consentUrl, { redirect: 'manual', cache: 'no-store' });
    return classifyConsentRedirect(res.headers.get('location'), res.status);
  } catch (e) {
    return { registered: null, reason: String(e) };
  }
}
