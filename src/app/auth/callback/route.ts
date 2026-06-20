import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code       = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type       = searchParams.get('type');

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

  let userId: string | null = null;
  let userEmail: string | null = null;

  if (code) {
    // PKCE flow — code_verifier cookie must be present from the request-otp response
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      userId    = data.user.id;
      userEmail = data.user.email ?? null;
    } else {
      console.error('[auth/callback] exchangeCodeForSession error:', error?.message);
    }
  } else if (token_hash && type) {
    // Token-hash flow — Supabase hashes the raw token before redirecting here
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'email' | 'signup' | 'magiclink',
    });
    if (!error && data.user) {
      userId    = data.user.id;
      userEmail = data.user.email ?? null;
    } else {
      console.error('[auth/callback] verifyOtp error:', error?.message);
    }
  }

  if (!userId || !userEmail) {
    return NextResponse.redirect(`${origin}/login?error=1`);
  }

  const admin = createAdminClient();
  const email = userEmail;

  const { data: entry } = await admin
    .from('student_allowlist')
    .select('full_name, assigned_buddy_id, person_type')
    .eq('email', email)
    .eq('status', 'active')
    .maybeSingle();

  const { data: existing } = await admin
    .from('profiles')
    .select('id, password_set, role')
    .eq('id', userId)
    .maybeSingle();

  if (!existing && !entry) {
    const res = NextResponse.redirect(`${origin}/login?error=1`);
    pending.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
    );
    return res;
  }

  const role = (entry?.person_type === 'buddy' ? 'buddy' : 'student') as 'student' | 'buddy';
  const isNewUser = !existing;
  // New students go to /student/home where the onboarding modal auto-launches.
  // Returning students skip straight to the tracker.
  const normalDest = role === 'buddy' ? '/buddy/students' : (isNewUser ? '/student/home' : '/student/tracker');

  if (isNewUser) {
    await admin.from('profiles').insert({
      id: userId,
      role,
      full_name: entry?.full_name ?? (role === 'buddy' ? 'Buddy' : 'Student'),
      email,
      buddy_id: role === 'student' ? (entry?.assigned_buddy_id ?? null) : null,
      subscription_status: role === 'student' ? 'free_beta' : null,
      password_set: false,
    });
  } else {
    await admin
      .from('profiles')
      .update({
        email,
        ...(role === 'student' && entry?.assigned_buddy_id ? { buddy_id: entry.assigned_buddy_id } : {}),
      })
      .eq('id', userId);
  }

  const hasPassword = existing?.password_set === true;
  const dest = hasPassword ? normalDest : `/set-password?dest=${encodeURIComponent(normalDest)}`;

  const res = NextResponse.redirect(`${origin}${dest}`);
  pending.forEach(({ name, value, options }) =>
    res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
  );
  return res;
}
