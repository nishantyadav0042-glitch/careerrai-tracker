import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';

export async function POST(request: NextRequest) {
  try {
    const { phone: rawPhone, token } = (await request.json()) as { phone?: string; token?: string };
    const e164 = normalizeIndianPhone(rawPhone ?? '');
    if (!e164 || !token || !/^\d{6}$/.test(token.trim())) {
      return NextResponse.json({ error: 'Invalid phone or OTP.' }, { status: 400 });
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

    const { data, error } = await supabase.auth.verifyOtp({
      phone: e164,
      token: token.trim(),
      type: 'sms',
    });

    if (error || !data.user) {
      return NextResponse.json({ error: 'That code is incorrect or expired.' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Look up allowlist by phone
    const { data: entry } = await admin
      .from('student_allowlist')
      .select('full_name, assigned_buddy_id, person_type, email')
      .eq('phone', e164)
      .eq('status', 'active')
      .maybeSingle();

    const { data: existing } = await admin
      .from('profiles')
      .select('id, password_set, role, full_name, email')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!existing && !entry) {
      return NextResponse.json(
        { error: "This number isn't registered. Your admin will add you after onboarding." },
        { status: 403 }
      );
    }

    // The handle_new_user DB trigger auto-creates a bare profile (full_name
    // 'New User', role 'student') the instant verifyOtp creates the auth user.
    // So a first-time OTP signup arrives here with `existing` already set to
    // that stub. Detect it so we still apply the real allowlist registration
    // (name, email, role, buddy) instead of treating them as a returning user.
    const isStub = !!existing && (!existing.full_name || existing.full_name === 'New User');

    // For returning users, trust the role already stored in their profile.
    // entry?.person_type is only reliable for first-time registrations — an
    // existing buddy whose phone isn't in the allowlist would otherwise be
    // downgraded to 'student' for the session.
    // Belt-and-suspenders: the registered admin phone always gets admin role.
    // Phone stored in ADMIN_PHONE_E164 env var (never hardcoded in source).
    const adminPhone = process.env.ADMIN_PHONE_E164;
    const isAdminPhone = !!adminPhone && e164 === adminPhone;
    const role = (
      isAdminPhone
        ? 'admin'
        : existing?.role === 'buddy' || existing?.role === 'admin'
          ? existing.role
          : entry?.person_type === 'buddy'
            ? 'buddy'
            : 'student'
    ) as 'student' | 'buddy' | 'admin';
    const normalDest =
      role === 'admin' ? '/admin' :
      role === 'buddy' ? '/buddy/students' :
      '/student/tracker';

    if (!existing) {
      // No profile at all (trigger disabled / edge case) — create from allowlist.
      await admin.from('profiles').insert({
        id: data.user.id,
        role,
        full_name: entry?.full_name ?? (role === 'buddy' ? 'Buddy' : 'Student'),
        email: entry?.email ?? null,
        phone: e164,
        buddy_id: role === 'student' ? (entry?.assigned_buddy_id ?? null) : null,
        subscription_status: role === 'student' ? 'free_beta' : null,
        password_set: false,
      });
    } else if (isStub) {
      // Trigger-created stub: apply the real registration from the allowlist —
      // name, email, role, and (for students) the assigned buddy. This is what
      // keeps the admin Students tab consistent with People & Data.
      await admin
        .from('profiles')
        .update({
          role,
          full_name: entry?.full_name ?? existing.full_name ?? (role === 'buddy' ? 'Buddy' : 'Student'),
          email: entry?.email ?? existing.email ?? null,
          phone: e164,
          buddy_id: role === 'student' ? (entry?.assigned_buddy_id ?? null) : null,
          ...(role === 'student' ? { subscription_status: 'free_beta' } : {}),
        })
        .eq('id', data.user.id);
    } else {
      // Returning user with a real profile — only refresh phone and (if the
      // admin reassigned them) their buddy. Never clobber their real name.
      await admin
        .from('profiles')
        .update({
          phone: e164,
          ...(role === 'student' && entry?.assigned_buddy_id ? { buddy_id: entry.assigned_buddy_id } : {}),
        })
        .eq('id', data.user.id);
    }

    const hasPassword = existing?.password_set === true;
    const dest = hasPassword ? normalDest : `/set-password?dest=${encodeURIComponent(normalDest)}`;

    const res = NextResponse.json({ ok: true, dest });
    pending.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
    );
    // Set role cookie so the student/buddy layouts can use the fast-path (no
    // extra DB round-trip on every page). Mirror what auth/callback sets.
    if (role === 'student' || role === 'buddy' || role === 'admin') {
      res.cookies.set('user_role', role, {
        path: '/',
        sameSite: 'lax',
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 30, // 30 days — matches password login in auth/login/route.ts
      });
    }
    // Real login — ensure no stale read-only demo flag remains.
    res.cookies.set('cr_demo', '', { path: '/', maxAge: 0 });
    return res;
  } catch (e) {
    console.error('[verify-phone-otp] error', e);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
