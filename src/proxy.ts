import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  normalizeStoreSource,
  shouldStampStoreCookie,
  storeCookieContradictsDevice,
} from '@/lib/store-build';
import { storeFunnelEnabled } from '@/lib/feature-flags';
import { describeSbCookies, sbRemovalNames } from '@/lib/auth-observation';
import { resolveAuthWithRetry, type AuthErrorLike } from '@/lib/auth-failure';

// Alternate hosts that must land on the canonical domain. The old
// careerrai-daily.vercel.app is DELIBERATELY absent — existing installed PWAs
// and their push subscriptions live on that origin and must keep working.
const CANONICAL_HOST = 'careerrai.in';
const REDIRECT_HOSTS = new Set(['www.careerrai.in', 'careerrai.com', 'www.careerrai.com']);

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Canonical-domain enforcement (domain cutover): any alternate host 308s to
  // careerrai.in with path + query preserved, regardless of how the hosting
  // dashboard's per-domain redirects are configured. PRECONDITION (loop
  // safety): careerrai.in itself must serve directly (no edge redirect off it)
  // before this ships — verified as part of the cutover checklist.
  const host = request.headers.get('host')?.toLowerCase() ?? '';
  if (REDIRECT_HOSTS.has(host)) {
    const canonical = request.nextUrl.clone();
    canonical.host = CANONICAL_HOST;
    canonical.protocol = 'https:';
    canonical.port = '';
    return NextResponse.redirect(canonical, 308);
  }

  // Supabase sends magic-link emails to its configured Site URL, which may be
  // the domain root rather than /auth/callback. Intercept the auth params here
  // and forward them so the callback route can complete the session exchange.
  //
  // ── PAGES ONLY — NEVER AN API ROUTE (Incident: 28 Aug, found live) ────────
  //
  // This block predates /api/google/callback and used to match ANY url with a
  // `?code=`. Google's OAuth redirect for the mentor calendar flow is
  // /api/google/callback?code=…, so the middleware hijacked it mid-flight and
  // handed the RAW GOOGLE CODE to /auth/callback, which fed it to Supabase as
  // a PKCE code — flow_state_not_found, bounced to /login?error=1. The mentor
  // callback never executed: no audit row, no token stored, and the founder's
  // first real connection attempt died with a password error on a screen he
  // never asked for. Diagnosed from three logs agreeing: Vercel showed both
  // routes 307ing in the same second, GoTrue showed the pkce exchange 404ing,
  // and integration_audit_log showed the callback's audited branches never
  // ran — the only unaudited exit is upstream of them all: this middleware.
  //
  // An /api/* route that receives a ?code= IS the handler for that code; the
  // magic-link problem this block solves only ever lands on HTML pages.
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  if (pathname !== '/auth/callback' && !pathname.startsWith('/api/') && (code || (token_hash && type))) {
    const callbackUrl = new URL('/auth/callback', request.url);
    if (code) callbackUrl.searchParams.set('code', code);
    if (token_hash) callbackUrl.searchParams.set('token_hash', token_hash);
    if (type) callbackUrl.searchParams.set('type', type);
    return NextResponse.redirect(callbackUrl);
  }

  // Buddy demo account = a guided tour of the student side, VIEWING ONLY.
  // The cookie is stamped at login for buddydemo@careerrai.in and cleared on
  // any other login, so it can only ever be set for that one account.
  // Blocking here — the one chokepoint every API call passes through — means
  // no individual route has to remember the rule. Auth stays open so the demo
  // can log in/out; everything else that would write gets a friendly refusal.
  // Inert for every other user, including the store review account.
  if (
    request.method !== 'GET' &&
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/auth/') &&
    request.cookies.get('cr_demo') != null
  ) {
    return NextResponse.json(
      { ok: false, error: 'This is the buddy demo tour — viewing only. Nothing can be changed from this account.' },
      { status: 403 }
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Keep the session fresh so Server Components can read auth state. getUser()
  // both validates the JWT and refreshes the token — a separate getSession()
  // call would be a second, redundant round-trip on every request.
  // A stale/invalid refresh token (e.g. the account was deleted server-side
  // while this browser still held a session cookie) throws AuthApiError here
  // instead of resolving — without this catch that's an unhandled 500 for the
  // visitor. Treat it exactly like "not logged in": the existing redirect-to-
  // login below already handles that correctly.
  //
  // ONE RETRY before giving up (16 Aug, real-student incident: a genuinely
  // logged-in student was silently bounced to /login with no recovery path
  // — root-caused to a refresh-token race between independent browser
  // Supabase clients, since fixed at the source in lib/supabase/client.ts).
  // That fix removes the main source of the race, but this catch has no way
  // to tell "the session is truly dead" apart from "that one attempt hit a
  // transient hiccup" — a network blip, a GoTrue reuse-interval edge, or a
  // cause we haven't found yet. A single retry turns a one-off failure into
  // a successful request instead of an unexplained logout, at the cost of
  // one extra round-trip PAID ONLY WHEN THE FIRST ATTEMPT FAILS — every
  // normal request still makes exactly one call, same as before. If the
  // session really is dead, the retry fails identically and the existing
  // redirect-to-login below is unchanged.
  //
  // 22 Aug — the retry above was necessary but not sufficient, and this is why:
  // getUser() does NOT throw for auth failures. It resolves as
  // `{ data: { user: null }, error }`. So the catch only ever fired on a raw
  // network throw, while a GoTrue 500, a timeout or a rate-limit arrived as a
  // plain `user = null` — indistinguishable from a visitor who is not logged
  // in, and redirected to /login exactly the same way. A student whose session
  // was completely valid could be logged out by one bad second at the auth
  // service. Classify the failure instead of assuming it (lib/auth-failure).
  const { user, outcome } = await resolveAuthWithRetry(async () => {
    const res = await supabase.auth.getUser();
    return { user: res.data.user, error: res.error as AuthErrorLike | null };
  });

  // ── Track B instrumentation (founder GO, 21 Aug) — observation only ──────
  // Correlates a forced login with the auth-cookie state that produced it.
  // Names and byte-lengths ONLY — never cookie values, tokens, the Cookie
  // header, or user identifiers (see lib/auth-observation). getUser() above
  // is the only auth writer on this request, so checking the response here
  // catches every sb-* deletion it may have emitted (_removeSession →
  // maxAge=0), on whichever return path the request takes.
  const obsId = crypto.randomUUID().slice(0, 8);
  const sbRemovals = sbRemovalNames(
    response.cookies.getAll().map((c) => ({ name: c.name, value: c.value, maxAge: c.maxAge })),
  );
  if (sbRemovals.length > 0) {
    console.error('[auth-cookie-removal]', JSON.stringify({ obsId, path: pathname, removing: sbRemovals }));
  }

  // Store-wrapper marker, set server-side so it CANNOT be lost.
  //
  // The Play/iOS wrappers launch on `?source=twa|ios`, but a fresh install is
  // logged out, so that first request 302s to /login and the param dies with
  // it — the client-side detector never even mounts. That left the very first
  // session (exactly the one a store reviewer runs) falling through to an
  // in-app card sheet. A cookie set here survives the redirect.
  //
  // Deliberately NOT httpOnly: the checkout components read it in the browser.
  // It marks which build you launched, not who you are — nothing to protect.
  // normalizeStoreSource is the ONE accepted-values list (lib/store-build) —
  // this used to be a literal twa|ios check here while the client grew its own
  // different list, and the two never matched. Aliases ('ios-app',
  // 'android-app') normalise to the canonical value so every cookie consumer's
  // regex keeps working.
  const userAgent = request.headers.get('user-agent');
  const source = normalizeStoreSource(searchParams.get('source'));
  if (source && shouldStampStoreCookie(source, userAgent)) {
    response.cookies.set('cr_store', source, {
      // DELIBERATELY LONG-LIVED. On iOS this cookie is the ONLY evidence that
      // we are inside the store wrapper: isStoreBuild() returns true there via
      // `storeCookieValue() === 'ios'` alone, because a WKWebView never
      // reports display-mode: standalone, so the localStorage-flag fallback
      // below it cannot fire. If this cookie lapses while the wrapper is open,
      // the app silently becomes "web", Razorpay opens INLINE in the WKWebView
      // — the Apple 3.1.1 posture this file exists to hold — and payment is
      // 100% broken there (window.open is ignored; see the 31 Jul fix).
      //
      // A shortened life was tried and reverted: the wrapper only re-stamps on
      // a cold start, so any restored-webview session past the expiry lands in
      // exactly that state. Nothing in the app would report it.
      //
      // The stray-link problem a short life was meant to solve is handled at
      // the door instead, by shouldStampStoreCookie above: a `?source=` value
      // is only believed when the device could plausibly be that platform. A
      // long life is safe once the wrong devices are never marked at all.
      maxAge: 60 * 60 * 24 * 3650,
      path: '/',
      sameSite: 'lax',
      secure: true,
    });
  } else if (storeCookieContradictsDevice(
    normalizeStoreSource(request.cookies.get('cr_store')?.value),
    userAgent,
  )) {
    // CLEANUP for cookies already in the wild. Gating new stamps does nothing
    // about the ten-year cookies handed out before that gate existed, and those
    // are the live harm: an Android phone or a Windows desktop still carrying
    // `cr_store=ios` has inline Razorpay disabled on every visit.
    //
    // Only a definite contradiction clears — 'apple' and an unreadable UA never
    // do — so this cannot unmark a real wrapper. Deleted rather than rewritten
    // because the honest state for a device that is not a store build is no
    // cookie at all; if it ever really is one, the next `?source=` launch
    // re-stamps it.
    //
    // `path` is spelled out because the cookie was set with Path=/ and a
    // deletion only matches when its path matches. This Next version happens
    // to default the field to '/', so the bare call works today — but that is
    // an undocumented default, and if it ever changed the deletion would
    // become a silent no-op rather than an error.
    response.cookies.delete({ name: 'cr_store', path: '/' });
  }

  // Any redirect issued AFTER getUser() must carry the cookies Supabase may
  // have refreshed onto `response` during the call — a bare NextResponse.
  // redirect() drops them, so the browser keeps a stale (soon-invalid) token
  // and the next request re-refreshes, which can strand a session in a
  // redirect loop or silently log the user out. Copy them onto every redirect.
  const redirectWithSession = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  const isProtected =
    pathname.startsWith('/student') ||
    pathname.startsWith('/buddy') ||
    pathname.startsWith('/admin');

  // UNKNOWN is not FALSE. After a retry the auth service still could not tell
  // us who this is, so we decline the request instead of asserting that the
  // student is signed out. Access is still denied — nothing here weakens
  // authorization — but they keep their session and their cookies, and they
  // are told to try again rather than being sent to a login screen that
  // silently discards a session which was never actually broken.
  if (isProtected && outcome === 'infrastructure') {
    console.error('[auth-infrastructure-unavailable]', JSON.stringify({ obsId, path: pathname }));
    const body = pathname.startsWith('/api/')
      ? JSON.stringify({ error: 'Sign-in service is unavailable right now. Please try again.', code: 'AUTH_UNAVAILABLE', retryable: true })
      : '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Try again</title><body style="font-family:system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#fafaf9;color:#1c1917"><div style="max-width:22rem;padding:1.5rem;text-align:center"><p style="font-weight:700;font-size:1rem;margin:0 0 .5rem">We could not reach the sign-in service.</p><p style="font-size:.875rem;color:#57534e;margin:0 0 1.25rem">You are still signed in. This is on our side, not yours.</p><a href="" onclick="location.reload();return false" style="display:inline-block;background:#1c1917;color:#fff;text-decoration:none;padding:.625rem 1.25rem;border-radius:.75rem;font-weight:700;font-size:.875rem">Try again</a></div></body>';
    return new NextResponse(body, {
      status: 503,
      headers: {
        'Content-Type': pathname.startsWith('/api/') ? 'application/json' : 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': '5',
      },
    });
  }

  if (isProtected && !user) {
    // Track B: the moment the investigation exists for — a protected request
    // with no user. Did it arrive carrying sb-* cookies (present-but-invalid)
    // or none (evicted)? Empty sbNames IS the eviction finding. hasRoleCookie
    // pins the selective-loss signature (user_role survived, auth cookies
    // gone); ua (truncated) is the only environment hint — no identifiers.
    const sb = describeSbCookies(request.cookies.getAll());
    console.error('[auth-loss-observation]', JSON.stringify({
      obsId,
      path: pathname,
      sbNames: sb.names,
      sbBytes: sb.bytes,
      hasRoleCookie: request.cookies.get('user_role') != null,
      ua: (userAgent ?? '').slice(0, 80),
    }));

    // A logged-out arrival splits two ways, and the split is the whole point.
    //
    // The store wrappers launch on `/student/tracker?source=twa|ios` — a
    // PROTECTED path — so a fresh install always landed here and was sent to
    // /login. Every store student therefore met a phone field before they met
    // the product, while the web funnel (/start) asks its nine questions first
    // and signs you up last, deliberately: "you decide the date, you own the
    // plan." Store installs got the exact inverse of the funnel we designed.
    // A NEW arrival now gets /start, so both doors lead to the same journey.
    //
    // `user_role` is the returning-student signal, and it is reused rather
    // than invented: every login path sets it for 30 days (verify-phone-otp,
    // auth/login, install/exchange) and nothing clears it. So a student whose
    // session merely lapsed still goes straight to /login instead of being
    // dropped into a nine-screen funnel they finished weeks ago.
    //
    // REVIEW SAFETY, since this is the first screen App Review sees. /start
    // carries a plainly visible "Log in" on every screen (see start/page.tsx)
    // — added in the same commit as this redirect, and load-bearing for it.
    // An unreachable login is the Guideline 2.1 rejection we already took
    // (Incident #10). Neither destination is protected, so there is no loop,
    // and clone() preserves `?source=`, so the store flag survives the hop
    // exactly as it did before.
    // STORE LAUNCHES ARE HELD BACK, and this is the load-bearing line.
    // /start ends at an SMS-OTP-to-an-Indian-mobile screen with no password
    // option, which a store reviewer cannot pass — the Guideline 2.1 rejection
    // from Incident #10, precisely. Until Play approves, anything launched from
    // a wrapper keeps landing on /login exactly as the approved build does.
    // `source` covers the very first request (the cookie is only being set on
    // this same response, so it is not yet readable from request.cookies).
    const storeLaunch = source != null || request.cookies.get('cr_store') != null;
    const holdBack = storeLaunch && !storeFunnelEnabled();

    // /start is the STUDENT signup funnel, so only a student path may fall
    // into it. A logged-out buddy or admin is never a new student — sending
    // them down nine "when do you want to finish your syllabus?" screens is
    // nonsense, and it is how a mentor stayed locked out for 30 days: she
    // opened /buddy/home on a new phone, had no user_role cookie, and landed
    // in the student funnel with no route to /login. Store launches always
    // arrive on /student/tracker, so the holdback path is untouched.
    const isStudentPath = pathname.startsWith('/student');

    const returning = request.cookies.get('user_role') != null;
    const dest = request.nextUrl.clone();
    dest.pathname = (returning || holdBack || !isStudentPath) ? '/login' : '/start';
    return redirectWithSession(dest);
  }

  // Already logged in? Skip the login page and route to the right home. EVERY
  // role must have a terminal destination here: a role this map doesn't know
  // (e.g. 'sales') used to fall through to /student/tracker, whose layout then
  // bounced it back to /login → an infinite ERR_TOO_MANY_REDIRECTS loop (this
  // is exactly how the sales login broke). Unknown/absent cookie → '/', which
  // does an authoritative DB role lookup and routes correctly, never back here.
  if (pathname === '/login' && user) {
    const homeUrl = request.nextUrl.clone();
    const roleCookie = request.cookies.get('user_role')?.value;
    homeUrl.pathname =
      roleCookie === 'buddy' ? '/buddy/home' :
      roleCookie === 'admin' ? '/admin' :
      roleCookie === 'sales' ? '/sales' :
      roleCookie === 'student' ? '/student/tracker' :
      '/';
    return redirectWithSession(homeUrl);
  }

  // Real student incident, 16 Aug: a student logged in successfully (server
  // logs: clean 200s on every request, a brand-new never-touched session) and
  // was looking at the login form again 13 seconds later with NO matching
  // GET /login in the server logs at all — meaning no request reached us.
  // The browser was showing a CACHED /login page from before he logged in
  // (back-forward cache / router cache on a back-navigation), and this app
  // sent no header telling it not to. He wasn't logged out; he was looking
  // at a stale screenshot of the moment before he logged in, re-entered an
  // already-used OTP (the 401 in the logs 16s later), and had to log in a
  // second time for a session that was never actually broken.
  // Never let the browser cache this specific response: a back-navigation
  // must always be a real round-trip through this exact check, not a replay
  // of whatever /login looked like before the student authenticated.
  if (pathname === '/login') {
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
  }

  return response;
}

export const config = {
  // Skip the auth handshake on everything static: Next internals, PWA assets,
  // fonts, audio (voice notes), and images. Otherwise every asset request would
  // trigger a Supabase auth round-trip at first paint.
  matcher: [
    '/((?!_next/static|_next/image|_next/data|favicon.ico|manifest.json|sw.js|robots.txt|apple-touch-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|mp3|wav|m4a|webm|json|txt)$).*)',
  ],
};
