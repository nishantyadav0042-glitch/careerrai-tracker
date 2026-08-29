import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthUser } from '@/lib/auth';
import {
  exchangeCodeAndStore, verifyOAuthState, OAUTH_STATE_COOKIE, OAUTH_PKCE_COOKIE,
} from '@/lib/google-oauth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureBuddyRoom } from '@/lib/buddy-room';
import { audit } from '@/lib/integration-audit';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

// Step 2: Google sends the code here. Store tokens, return the mentor to
// wherever they started, with a flag the page can turn into a message.
//
// EVERY outcome is audited, including the failures. The first version only
// logged success, which meant a mentor saying "it won't connect" left no trace
// at all — the token table was empty and so was the audit log, and there was
// no way to tell "Google refused us" from "the user pressed cancel" from
// "they never got here". A failure nobody can read is a failure you debug
// twice.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const user = await getAuthUser();

  // ── THE BRANCH THAT COST TEN DAYS ────────────────────────────────────────
  //
  // This used to redirect to /login and write NOTHING. It is the only exit in
  // this route that left no trace, and it was the one production actually
  // took: a mentor signed in on careerrai-daily.vercel.app was returned by
  // Google to careerrai.in, whose cookie jar held no session, so `user` was
  // null and they landed on a login screen looking logged out. Every other
  // failure here is audited, so the empty audit log read as "the callback
  // never ran" — and the investigation went to Google Cloud, where nothing
  // was wrong, instead of to these two lines.
  //
  // The origin mismatch itself is fixed (googleRedirectUri now returns to the
  // originating origin). This stays because a session can still be absent for
  // ordinary reasons — an expired cookie, a sign-out in another tab — and
  // when it is, the trail must say so. No token, code or secret is recorded:
  // only which origin the callback landed on and that no session was found.
  if (!user) {
    await audit({
      subjectId: null,
      action: 'google.connect_failed',
      ok: false,
      detail: {
        stage: 'no_session_at_callback',
        callbackOrigin: origin,
        canonicalOrigin: SITE_URL,
        originMismatch: origin !== SITE_URL,
      },
    });
    return NextResponse.redirect(new URL('/login?error=session_lost', request.url));
  }

  const params = new URL(request.url).searchParams;

  // ── STATE IS CHECKED BEFORE ANYTHING ELSE (27 Aug audit, item 11) ─────────
  //
  // `back` used to be `decodeURIComponent(params.get('state'))` used verbatim
  // in every redirect below — an open redirect, since `state` echoes the
  // attacker-controlled `from` on /api/google/connect, and reachable without
  // consent because the denied branch redirects too. And nothing tied the
  // callback to the browser that began the flow, so a replayed callback could
  // link an attacker's Google account to a victim's CareerRai account.
  //
  // verifyOAuthState checks the nonce against the httpOnly cookie set at
  // connect time and re-validates the path to something on this origin. A
  // mismatch is refused outright rather than followed.
  const jar = await cookies();
  const expectedNonce = jar.get(OAUTH_STATE_COOKIE)?.value ?? null;
  const { ok: stateOk, returnPath: back } = verifyOAuthState(params.get('state'), expectedNonce);

  /** Every exit clears the one-shot nonce, so a state can never be replayed. */
  const leave = (url: URL) => {
    const res = NextResponse.redirect(url);
    // BOTH one-shot cookies, on every exit. Leaving the PKCE verifier behind
    // would let a later flow redeem a code it did not begin.
    res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });
    res.cookies.set(OAUTH_PKCE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  };

  if (!stateOk) {
    await audit({
      subjectId: user.id, action: 'google.connect_failed', ok: false,
      detail: { stage: 'state', reason: expectedNonce ? 'state_mismatch' : 'no_state_cookie' },
    });
    return leave(new URL('/buddy/home?google=failed', request.url));
  }

  const denied = params.get('error');
  const deniedDescription = params.get('error_description');
  const code = params.get('code');

  if (denied || !code) {
    // Google's own error code is the useful part. `access_denied` is someone
    // pressing Cancel; `admin_policy_enforced` or `org_internal` means their
    // Workspace blocked it; anything else usually means the OAuth app is not
    // configured for this account. Recording it is the difference between a
    // guess and an answer.
    await audit({
      subjectId: user.id, action: 'google.connect_failed', ok: false,
      detail: {
        stage: 'consent',
        googleError: denied ?? 'no_code_returned',
        googleErrorDescription: deniedDescription,
      },
    });
    return leave(new URL(`${back}?google=denied`, request.url));
  }

  const result = await exchangeCodeAndStore(
    code, user.id, origin, jar.get(OAUTH_PKCE_COOKIE)?.value ?? null,
  );
  if (!result.ok) {
    console.error('[google] connect failed:', result.error);
    await audit({
      subjectId: user.id, action: 'google.connect_failed', ok: false,
      detail: { stage: 'token_exchange', reason: result.error },
    });
    return leave(new URL(`${back}?google=failed`, request.url));
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  await audit({ subjectId: user.id, action: 'google.connected', detail: { email: result.email, role: profile?.role ?? null } });

  // A buddy gets their ONE permanent Meet room here, at connect time — the
  // only moment it is ever created. Every session they run for the rest of
  // their time on CareerRai uses this link.
  //
  // ── A HALF-SUCCESS IS NOT A SUCCESS (27 Aug) ──────────────────────────────
  //
  // This used to console.error the failure and redirect ?google=connected
  // anyway, on the reasoning that the connection itself had worked. That was
  // true and still misleading: with Google now the ONLY mentor setup path, a
  // mentor whose room was never minted has no room, is not bookable, and was
  // being shown "Google connected" with nothing left to do. The paste-a-link
  // card that used to be their way out has been removed.
  //
  // So the two outcomes are now told apart. `room_failed` is not a failed
  // connection — the token is stored and reconnecting re-runs ensureBuddyRoom,
  // which is the actual recovery — it is a connection that has not yet
  // produced the thing the mentor needs. The UI states it honestly and offers
  // that retry.
  //
  // Audited, not just logged: a failure nobody can read is a failure you debug
  // twice, and this is the exact step that has never once succeeded in
  // production (google_oauth_tokens has been empty for the product's life).
  if (profile?.role === 'buddy') {
    const room = await ensureBuddyRoom(user.id);
    if (!room.ok) {
      console.error('[google] permanent room not created:', room.reason, room.error);
      await audit({
        subjectId: user.id, action: 'room.created', ok: false,
        detail: { stage: 'post_connect', failure: room.reason, error: room.error },
      });
      return leave(new URL(`${back}?google=room_failed`, request.url));
    }
  }

  return leave(new URL(`${back}?google=connected`, request.url));
}
