import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';

export async function POST(request: NextRequest) {
  // Support both JSON (fetch) and form-encoded (native form POST)
  let credential = '';
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

  credential = credential.trim();
  const origin = request.nextUrl.origin;
  const admin = createAdminClient();

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

  function buildResponse(dest: string, role: string, isDemo: boolean) {
    const response = NextResponse.redirect(`${origin}${dest}`, { status: 302 });
    pending.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
    });
    response.cookies.set('user_role', role, {
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
    });
    if (isDemo) {
      response.cookies.set('cr_demo', '1', { path: '/', sameSite: 'lax', httpOnly: true, maxAge: 60 * 60 * 24 });
    } else {
      response.cookies.set('cr_demo', '', { path: '/', maxAge: 0 });
    }
    return response;
  }

  // Phone + password (primary login method)
  // Always authenticates via email even when credential is a phone number, because
  // users are created with email identities (not phone identities). Phone is only
  // used to look up which auth account to sign into.
  const e164 = normalizeIndianPhone(credential);
  if (e164) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, role, is_demo')
      .eq('phone', e164)
      .maybeSingle();

    if (!profile) {
      console.error('[LOGIN] No profile found for phone:', e164);
      return NextResponse.redirect(`${origin}/login?error=1`, { status: 302 });
    }

    // Prefer email auth (works for email-identity users like demo buddies).
    // Fall back to phone auth for phone-identity-only accounts (no email stored).
    const authResult = profile.email
      ? await supabase.auth.signInWithPassword({ email: profile.email, password })
      : await supabase.auth.signInWithPassword({ phone: e164, password });

    if (authResult.error) {
      console.error('[LOGIN] Phone auth error:', authResult.error.message);
      return NextResponse.redirect(`${origin}/login?error=1`, { status: 302 });
    }

    const role = profile.role ?? 'student';
    const dest = role === 'admin' ? '/admin' : role === 'buddy' ? '/buddy/home' : '/student/tracker';
    return buildResponse(dest, role, !!profile.is_demo);
  }

  // Email + password (admin fallback or non-phone users)
  const credLower = credential.toLowerCase();
  const isEmail = credLower.includes('@');
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, role, is_demo')
    .ilike(isEmail ? 'email' : 'username', credLower)
    .maybeSingle();

  if (profileError || !profile?.email) {
    console.error('[LOGIN] Profile lookup error:', profileError?.message);
    return NextResponse.redirect(`${origin}/login?error=1`, { status: 302 });
  }

  const { error } = await supabase.auth.signInWithPassword({ email: profile.email, password });
  if (error) {
    console.error('[LOGIN] Email auth error:', error.message);
    return NextResponse.redirect(`${origin}/login?error=1`, { status: 302 });
  }

  const role = profile.role ?? 'student';
  const dest = role === 'admin' ? '/admin' : role === 'buddy' ? '/buddy/home' : '/student/tracker';
  return buildResponse(dest, role, !!profile.is_demo);
}
