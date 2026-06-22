import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// One-tap, read-only student demo login. Uses Supabase admin to generate a
// short-lived magic-link token, then exchanges it for a real session via
// verifyOtp — no password env var required.
const PREFERRED_DEMO_EMAIL = 'aarav@careerrai.com'; // Aarav: 79→94%ile recovery arc — the best story

export async function POST(request: NextRequest) {
  const admin = createAdminClient();

  // Prefer Aarav; fall back to any demo student so the button never dead-ends.
  let demoEmail: string | null = null;
  const { data: preferred } = await admin
    .from('profiles')
    .select('email')
    .eq('email', PREFERRED_DEMO_EMAIL)
    .eq('is_demo', true)
    .maybeSingle();

  if (preferred?.email) {
    demoEmail = preferred.email;
  } else {
    const { data: anyDemo } = await admin
      .from('profiles')
      .select('email')
      .eq('is_demo', true)
      .eq('role', 'student')
      .limit(1)
      .maybeSingle();
    demoEmail = anyDemo?.email ?? null;
  }

  if (!demoEmail) {
    return NextResponse.json({ error: 'Demo is temporarily unavailable.' }, { status: 503 });
  }

  // Generate a one-time magic-link token for the demo account (admin-only, server-side).
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: demoEmail,
  });

  if (linkError || !linkData?.properties?.email_otp) {
    console.error('[demo-login] generateLink failed:', linkError?.message);
    return NextResponse.json({ error: 'Demo is temporarily unavailable.' }, { status: 503 });
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

  const { error: verifyError } = await supabase.auth.verifyOtp({
    email: demoEmail,
    token: linkData.properties.email_otp,
    type: 'magiclink',
  });

  if (verifyError) {
    console.error('[demo-login] verifyOtp failed:', verifyError.message);
    return NextResponse.json({ error: 'Demo is temporarily unavailable.' }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true, dest: '/student/tracker' });
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
