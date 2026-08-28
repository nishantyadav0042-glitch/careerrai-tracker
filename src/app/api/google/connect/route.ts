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
// flow would fail for everyone. Short-lived: a consent screen left open for ten
// minutes is a flow that has been abandoned.
const STATE_TTL_SECONDS = 600;

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

  const nonce = newStateNonce();
  const res = NextResponse.redirect(
    googleConsentUrl(encodeURIComponent(encodeOAuthState(nonce, from))),
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
