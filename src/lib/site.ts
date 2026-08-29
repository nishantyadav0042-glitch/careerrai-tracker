// Single source of truth for the app's public web address.
//
// Domain cutover (careerrai-daily.vercel.app → careerrai.in): every link we
// ever print — emails, WhatsApp templates, share texts, call-team guidance —
// comes from here, so the domain lives in exactly one place. Client-side code
// should keep using window.location.origin (domain-agnostic); this constant is
// for links generated OUTSIDE the page (emails, server templates) and display
// strings.
//
// NEXT_PUBLIC_SITE_URL (Vercel env) overrides the default, which lets a
// preview deployment or a future domain change flip this without a code edit.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://careerrai.in';

// The bare host for display in human-facing copy ("open careerrai.in in Chrome").
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');

// ── CAREERRAI SERVES FROM TWO ORIGINS, AND OAUTH HAS TO KNOW ────────────────
//
// The domain cutover moved the canonical address to careerrai.in, but
// careerrai-daily.vercel.app was DELIBERATELY left serving directly rather
// than redirected (see the note in proxy.ts): installed PWAs and their push
// subscriptions live on that origin and would be broken by a canonical
// redirect. So both origins are real, live, and carry signed-in users.
//
// Cookies are host-scoped. A session — and the OAuth state nonce — set on one
// origin does not exist on the other. That is the bug this list exists to fix:
// a mentor signed in on careerrai-daily.vercel.app was sent to Google with a
// redirect_uri on careerrai.in, came back to an origin holding neither their
// session nor their state cookie, and was bounced to /login looking exactly
// like an unexplained logout. Ten days of Google Cloud investigation followed,
// none of which could have helped, because nothing in Google was wrong.
//
// An OAuth round trip must therefore START and FINISH on the same origin.
// This is the closed set it may use. It is not a guess and not a wildcard:
// both entries are live production aliases of this deployment. A third origin
// (a preview URL, a future domain) is added HERE and registered in the Google
// Cloud client's Authorized redirect URIs in the same change — Google refuses
// any redirect_uri it has not been given, which is the second lock.
export const LEGACY_PWA_ORIGIN = 'https://careerrai-daily.vercel.app';

export const APP_ORIGINS: readonly string[] = Object.freeze([SITE_URL, LEGACY_PWA_ORIGIN]);

/**
 * The app origin to build an absolute URL for, given the origin a request
 * arrived on.
 *
 * ALLOWLIST, NOT ECHO. `raw` ultimately derives from the Host header, which a
 * client controls. An unrecognised origin silently becomes the canonical one
 * rather than being trusted — so the worst a spoofed Host can achieve is a
 * redirect to our own canonical domain, never to somewhere else.
 */
export function resolveAppOrigin(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return SITE_URL;
  // Normalise a trailing slash; compare exactly otherwise.
  const candidate = raw.replace(/\/+$/, '');
  return APP_ORIGINS.includes(candidate) ? candidate : SITE_URL;
}
