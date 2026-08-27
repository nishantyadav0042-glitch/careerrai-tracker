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
  // Which provider actually authenticated this person. Google is allowed to
  // create an account here; the invite-only paths are not (see the allowlist
  // gate below), so the two must be told apart rather than assumed.
  let viaGoogle = false;

  if (code) {
    // PKCE flow. Shared by two different journeys: the emailed OTP link, and
    // "Continue with Google" — Supabase returns a `code` for both.
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      userId    = data.user.id;
      userEmail = data.user.email ?? null;
      viaGoogle = data.user.app_metadata?.provider === 'google'
        || (data.user.identities ?? []).some((i) => i.provider === 'google');
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

  // ── NEVER MINT A SECOND ACCOUNT FOR ONE PERSON ────────────────────────────
  //
  // Supabase gives a Google sign-in its own auth user id. If that person
  // already has a CareerRai profile under a different id — they signed up with
  // this same address by email earlier — inserting below would create a second
  // profile carrying the same email, and the two would diverge from that
  // moment: separate credits, separate buddy, separate history.
  //
  // Refusing is the honest answer. Merging two auth identities is an admin-API
  // operation with real failure modes, and doing it silently on a login is the
  // wrong place to attempt it.
  //
  // WHAT THIS CANNOT COVER, stated rather than glossed: production holds 924
  // PHONE identities, and a phone account has no email to match on. If one of
  // those students signs in with Google they get a genuinely new account,
  // because nothing shared exists to recognise them by. That is a property of
  // having sold phone-first auth for a year, not something this route can fix;
  // closing it needs a deliberate "link your Google account" step from INSIDE
  // a signed-in session, where we already know who they are.
  if (!existing && userEmail) {
    const { data: sameEmail } = await admin
      .from('profiles')
      .select('id')
      .eq('email', userEmail)
      .maybeSingle();
    if (sameEmail && sameEmail.id !== userId) {
      const res = NextResponse.redirect(`${origin}/login?error=account_exists`);
      pending.forEach(({ name, value, options }) =>
        res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
      );
      return res;
    }
  }

  // The allowlist gate. It exists because the emailed-link path is invite-only:
  // an address nobody invited must not become an account through it.
  //
  // GOOGLE IS DIFFERENT, and deliberately so (founder, 27 Aug). "Continue with
  // Google" is a public sign-up door for students — the mission is a free
  // platform used at scale, and an invite wall on the front door contradicts
  // it. A Google user with no invite becomes a student, which is what an
  // organic signup has always become. Buddies still arrive only through the
  // allowlist, so no one can self-promote into a mentor account.
  if (!existing && !entry && !viaGoogle) {
    const res = NextResponse.redirect(`${origin}/login?error=1`);
    pending.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
    );
    return res;
  }

  const role = (entry?.person_type === 'buddy' ? 'buddy' : 'student') as 'student' | 'buddy';
  const isNewUser = !existing;
  // Both new and returning students land on /student/tracker directly — the
  // Blueprint Builder gate lives in the student layout (fires for ANY page
  // under /student/* while onboarding_completed is false), not on a
  // specific landing page, so there's no reason to route new signups
  // through an extra redirect hop first.
  const normalDest = role === 'buddy' ? '/buddy/students' : '/student/tracker';

  if (isNewUser) {
    await admin.from('profiles').insert({
      id: userId,
      role,
      full_name: entry?.full_name ?? (role === 'buddy' ? 'Buddy' : 'Student'),
      email,
      buddy_id: role === 'student' ? (entry?.assigned_buddy_id ?? null) : null,
      subscription_status: role === 'student' ? 'free' : null,
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

  // Students skip the set-password wall (day-2 in-app reminder instead —
  // see SetPasswordReminder); buddies/admins still set one immediately.
  const hasPassword = existing?.password_set === true;
  const dest = (role === 'student' || hasPassword) ? normalDest : `/set-password?dest=${encodeURIComponent(normalDest)}`;

  const res = NextResponse.redirect(`${origin}${dest}`);
  pending.forEach(({ name, value, options }) =>
    res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
  );
  return res;
}
