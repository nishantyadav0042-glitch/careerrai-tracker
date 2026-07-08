import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Shared read-only demo sign-in. Used by both the one-tap demo button
// (POST /api/auth/demo-login) and the shareable demo link (GET /demo), so the
// auth flow and the cookies set stay identical no matter how a visitor enters.
const PREFERRED_DEMO_EMAIL = 'aarav@careerrai.com'; // Aarav: 79→94%ile recovery arc — the best story

export const DEMO_DEST = '/student/tracker';

/** Resolve which demo student to sign in: prefer Aarav, fall back to any demo student. */
async function resolveDemoEmail(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const { data: preferred } = await admin
    .from('profiles')
    .select('email')
    .eq('email', PREFERRED_DEMO_EMAIL)
    .eq('is_demo', true)
    .maybeSingle();

  if (preferred?.email) return preferred.email;

  const { data: anyDemo } = await admin
    .from('profiles')
    .select('email')
    .eq('is_demo', true)
    .eq('role', 'student')
    .limit(1)
    .maybeSingle();

  return anyDemo?.email ?? null;
}

/**
 * Sign the visitor into the read-only demo student account and apply the demo
 * cookies (Supabase session, user_role, cr_demo) onto `res`. Returns the same
 * response on success, or null if the demo is unavailable — callers decide how
 * to surface that (JSON error vs. redirect to login).
 */
export async function applyDemoSession(
  request: NextRequest,
  res: NextResponse
): Promise<NextResponse | null> {
  const admin = createAdminClient();

  const demoEmail = await resolveDemoEmail(admin);
  if (!demoEmail) return null;

  // Generate a one-time magic-link token for the demo account (admin-only, server-side).
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: demoEmail,
  });

  if (linkError || !linkData?.properties?.email_otp) {
    console.error('[demo-session] generateLink failed:', linkError?.message);
    return null;
  }

  // Exchange the OTP for a session via the SSR client so cookies are set correctly.
  const pending: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            pending.push({ name, value, options: options as Record<string, unknown> })
          ),
      },
    }
  );

  // Clear any existing real session first. Now that the demo link is also
  // reachable from inside the app (the paywalled Buddy tab), this runs for
  // already-logged-in students, not just anonymous visitors — without an
  // explicit sign-out, verifyOtp below only ever ADDS the demo session's
  // cookies via setAll, it never clears the visitor's real session cookies.
  // If the real session's auth-token cookie was chunked into more pieces
  // than the demo session needs, the leftover chunk stays in the browser
  // and corrupts the concatenated JWT on the very next request — auth then
  // fails a request or two later, bouncing back to /login with a stuck
  // cr_demo cookie still blocking writes. signOut() here uses the same
  // getAll/setAll pair, so it correctly clears however many chunks the
  // real session actually has before the new ones are written.
  await supabase.auth.signOut();

  const { error: verifyError } = await supabase.auth.verifyOtp({
    email: demoEmail,
    token: linkData.properties.email_otp,
    type: 'magiclink',
  });

  if (verifyError) {
    console.error('[demo-session] verifyOtp failed:', verifyError.message);
    return null;
  }

  pending.forEach(({ name, value, options }) =>
    res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
  );
  res.cookies.set('user_role', 'student', {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 60 * 60 * 24,
  });
  // Mark this session as read-only demo — the proxy blocks all write/mutation calls.
  res.cookies.set('cr_demo', '1', {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 60 * 60 * 24,
  });
  return res;
}
