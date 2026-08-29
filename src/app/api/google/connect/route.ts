import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import {
  googleConfigured, googleConsentUrl, safeReturnPath, newStateNonce, encodeOAuthState,
  OAUTH_STATE_COOKIE,
} from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';

// The state cookie is httpOnly so script cannot read it, and sameSite 'lax'
// because Google's callback is a top-level GET navigation from another site —
// 'strict' would drop the cookie on exactly the request that needs it and the
// flow would fail for everyone.
//
// ── TEN MINUTES WAS A GUESS ABOUT A JOURNEY NOBODY HAD WALKED ─────────────
//
// 29 Aug 2026. The old value assumed "a consent screen left open for ten
// minutes is abandoned". That is true of the SHORT flow this was written for
// — pick account, press Allow — and false of the one a real mentor gets while
// the app is unverified:
//
//   account chooser → "Google hasn't verified this app" → Advanced →
//   "Go to careerrai.in (unsafe)" → consent → tick the calendar checkbox →
//   scroll → Continue
//
// Six screens, two of which are scary enough that a careful person stops and
// reads them, and one of which (the checkbox) is easy to miss and worth
// re-reading. Ten minutes is a plausible time for a cautious first-time
// mentor, and blowing the budget does not look like a timeout: the cookie is
// simply gone, verifyOAuthState sees no nonce, and the callback refuses with
// `no_state_cookie` and redirects to ?google=failed. The mentor did everything
// right, waited, and got told it failed.
//
// Thirty minutes covers a slow, interrupted read of Google's own screens. It
// does not weaken the CSRF protection the nonce provides: the value is random,
// httpOnly, single-use, and cleared on EVERY exit from the callback (see the
// `leave` helper there), so a longer window is a longer time in which exactly
// one legitimate redemption remains possible.
const STATE_TTL_SECONDS = 1800;

// Step 1 of connecting a mentor's Google account: bounce them to consent.
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  // VALIDATED, not trusted. `from` is attacker-controlled and used to be echoed
  // straight into state and then into a redirect — an open redirect off our own
  // domain. safeReturnPath keeps it a path on this origin or discards it.
  const from = safeReturnPath(new URL(request.url).searchParams.get('from'));

  // While the server has no Google credentials — during a credential rotation,
  // or on a preview deploy — send the mentor BACK with a flag, not a page of
  // raw JSON.
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL(`${from}?google=unavailable`, request.url));
  }

  // ── START AND FINISH ON THE SAME ORIGIN (29 Aug, production incident) ────
  //
  // CareerRai serves from careerrai.in AND careerrai-daily.vercel.app, and
  // cookies are host-scoped. Sending a mentor signed in on one origin back to
  // the other stranded them: no session, no state nonce, straight to /login
  // wearing the face of an unexplained logout. The redirect_uri is now built
  // from the origin this request actually arrived on, so the session and the
  // nonce set below are both present when Google returns.
  const origin = new URL(request.url).origin;

  const nonce = newStateNonce();
  const res = NextResponse.redirect(
    googleConsentUrl(encodeURIComponent(encodeOAuthState(nonce, from)), origin),
  );
  res.cookies.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_TTL_SECONDS,
  });
  return res;
}
