import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  // Support both JSON (fetch) and form-encoded (native form POST)
  let credential = ''; // email or username
  let password = '';
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = await request.json();
    credential = body.credential ?? body.username ?? '';
    password = body.password;
  } else {
    const form = await request.formData();
    credential = (form.get('credential') ?? form.get('username') ?? '') as string;
    password = form.get('password') as string;
  }

  credential = credential.trim().toLowerCase();
  const origin = request.nextUrl.origin;
  const admin = createAdminClient();

  // Look up profile by email (if credential contains @) or by username
  const isEmail = credential.includes('@');
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, role, is_demo')
    .ilike(isEmail ? 'email' : 'username', credential)
    .maybeSingle();

  if (profileError || !profile) {
    console.error('[LOGIN] Profile lookup error:', profileError?.message);
    return NextResponse.redirect(`${origin}/login?error=1`, { status: 302 });
  }

  const email = profile.email;
  if (!email) {
    return NextResponse.redirect(`${origin}/login?error=1`, { status: 302 });
  }

  const pending: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error('[LOGIN] Auth error:', error.message);
    return NextResponse.redirect(`${origin}/login?error=1`, { status: 302 });
  }

  const role = profile.role ?? 'student';
  const dest = role === 'buddy' ? '/buddy/home' : role === 'admin' ? '/admin' : '/student/tracker';

  const response = NextResponse.redirect(`${origin}${dest}`, { status: 302 });
  pending.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });
  // Cache the role so layouts can skip the DB role-check on every page load.
  response.cookies.set('user_role', role, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  });
  // Read-only demo flag: set for demo accounts, clear otherwise (so a real
  // login on a browser that previously ran the demo isn't left view-only).
  if (profile.is_demo) {
    response.cookies.set('cr_demo', '1', { path: '/', sameSite: 'lax', httpOnly: true, maxAge: 60 * 60 * 24 });
  } else {
    response.cookies.set('cr_demo', '', { path: '/', maxAge: 0 });
  }

  return response;
}
