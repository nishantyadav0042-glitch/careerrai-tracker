import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// One-tap, read-only student demo login. Signs the visitor into a demo student
// account server-side (no credentials exposed on the public page) and sets the
// `cr_demo` cookie, which the proxy uses to block all write/mutation API calls.
//
// The demo password is kept server-side only (it is NOT printed anywhere public).
// Set DEMO_ACCOUNT_PASSWORD in Vercel env — no hardcoded fallback.
const DEMO_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD;
const PREFERRED_DEMO_EMAIL = 'aarav@careerrai.com'; // Aarav: 79→94%ile recovery arc — the best story

export async function POST(request: NextRequest) {
  const admin = createAdminClient();

  // Prefer Aarav; fall back to any demo student so the button never dead-ends.
  let demo: { email: string | null } | null = null;
  const { data: preferred } = await admin
    .from('profiles')
    .select('email')
    .eq('email', PREFERRED_DEMO_EMAIL)
    .eq('is_demo', true)
    .maybeSingle();
  demo = preferred;
  if (!demo?.email) {
    const { data: anyDemo } = await admin
      .from('profiles')
      .select('email')
      .eq('is_demo', true)
      .eq('role', 'student')
      .limit(1)
      .maybeSingle();
    demo = anyDemo;
  }

  if (!demo?.email) {
    return NextResponse.json({ error: 'Demo is temporarily unavailable.' }, { status: 503 });
  }

  if (!DEMO_PASSWORD) {
    console.error('[demo-login] DEMO_ACCOUNT_PASSWORD env var is not set');
    return NextResponse.json({ error: 'Demo is temporarily unavailable.' }, { status: 503 });
  }

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

  const { error } = await supabase.auth.signInWithPassword({ email: demo.email, password: DEMO_PASSWORD! });
  if (error) {
    console.error('[demo-login] sign-in failed:', error.message);
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
  // Mark this session as the read-only demo. The proxy blocks mutations on it.
  res.cookies.set('cr_demo', '1', {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 60 * 60 * 24,
  });
  return res;
}
