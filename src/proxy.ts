import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  if (pathname !== '/auth/callback' && (code || (token_hash && type))) {
    const callbackUrl = new URL('/auth/callback', request.url);
    if (code) callbackUrl.searchParams.set('code', code);
    if (token_hash) callbackUrl.searchParams.set('token_hash', token_hash);
    if (type) callbackUrl.searchParams.set('type', type);
    return NextResponse.redirect(callbackUrl);
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
  let user = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    user = null;
  }

  const isProtected =
    pathname.startsWith('/student') ||
    pathname.startsWith('/buddy') ||
    pathname.startsWith('/admin');

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  // Already logged in? Skip the login page and route to the right home.
  if (pathname === '/login' && user) {
    const homeUrl = request.nextUrl.clone();
    // Route to the right home based on role cookie; layout will correct if stale.
    const roleCookie = request.cookies.get('user_role')?.value;
    homeUrl.pathname =
      roleCookie === 'buddy' ? '/buddy/home' :
      roleCookie === 'admin' ? '/admin' :
      '/student/tracker';
    return NextResponse.redirect(homeUrl);
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
