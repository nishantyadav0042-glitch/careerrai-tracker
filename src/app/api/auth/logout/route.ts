import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';

export async function POST(request: NextRequest) {
  const pending: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            pending.push({ name, value, options: options as Record<string, unknown> })
          );
        },
      },
    }
  );

  // scope:'local' — THIS device only.
  //
  // auth-js defaults to `signOut({ scope: 'global' })` (verified in
  // node_modules/@supabase/auth-js: `async signOut(options = { scope:
  // 'global' })`), which revokes EVERY refresh token the user holds, on every
  // device. A student tapping "Log out" on a laptop was therefore silently
  // killing the session in their installed phone app; the phone did not
  // notice until its next refresh, then died and bounced them to /login with
  // no explanation. That is the forced-relogin complaint, and it is a default
  // nobody chose.
  //
  // Logging out means "end my session here". Ending every session everywhere
  // is a security action, and it belongs where security demands it — account
  // deletion (api/account/delete) deliberately keeps the global scope.
  await supabase.auth.signOut({ scope: 'local' });

  const response = NextResponse.redirect(`${request.nextUrl.origin}/login`, { status: 302 });
  pending.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });

  return response;
}
