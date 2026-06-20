import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

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
  const { data: { user } } = await supabase.auth.getUser();

  const isProtected =
    pathname.startsWith('/student') ||
    pathname.startsWith('/buddy') ||
    pathname.startsWith('/admin');

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/login' && user) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/student/tracker';
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
