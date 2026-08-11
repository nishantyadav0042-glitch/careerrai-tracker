import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp } from '@/lib/request-ip';
import { registerAttemptAndCheck, clearAttempts } from '@/lib/attempt-throttle';
import { logSecurityEvent } from '@/lib/security-log';

export async function POST(request: NextRequest) {
  try {
    const { email: rawEmail, token } = (await request.json()) as { email?: string; token?: string };
    const email = rawEmail?.trim().toLowerCase();
    if (!email || !token || !/^\d{6}$/.test(token.trim())) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Brute-force cap on OTP verification — mirrors verify-phone-otp. A
    // 6-digit code is a 10^6 space; without this, an attacker who triggered
    // one login code to a victim's allowlisted email could spray guesses
    // here with no lockout. Record up front (race-free), cap at 5/email +
    // 50/IP per 15 min, clear on success.
    const admin = createAdminClient();
    const ip = clientIp(request);
    const otpKey = `otpv-email:${email}`;
    if (await registerAttemptAndCheck(admin, otpKey, ip, { maxPerKey: 5, maxPerIp: 50 })) {
      await logSecurityEvent(admin, { type: 'otp_verify_lockout', severity: 'warning', ip });
      return NextResponse.json(
        { error: 'Too many attempts. Request a new code and wait a few minutes.' },
        { status: 429 }
      );
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

    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error || !data.user) {
      return NextResponse.json({ error: 'That code is incorrect or expired.' }, { status: 401 });
    }
    await clearAttempts(admin, otpKey);

    // Look up allowlist entry to get name, buddy assignment, and person type
    const { data: entry } = await admin
      .from('student_allowlist')
      .select('full_name, assigned_buddy_id, person_type')
      .eq('email', email)
      .eq('status', 'active')
      .maybeSingle();

    const { data: existing } = await admin
      .from('profiles')
      .select('id, password_set, role')
      .eq('id', data.user.id)
      .maybeSingle();

    // Hard gate: brand-new email not on the allowlist cannot create a profile.
    if (!existing && !entry) {
      return NextResponse.json(
        { error: "This email isn't registered yet. Your admin will add you after onboarding." },
        { status: 403 }
      );
    }

    const role = (entry?.person_type === 'buddy' ? 'buddy' : 'student') as 'student' | 'buddy';
    const normalDest = role === 'buddy' ? '/buddy/students' : '/student/tracker';

    if (!existing) {
      await admin.from('profiles').insert({
        id: data.user.id,
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
        .eq('id', data.user.id);
    }

    // Students are never walled behind set-password at login — OTP login
    // works without one, and a password wall right after signup is pure
    // friction on day one. They get a dismissible "set a password for
    // faster login" card in the app from day 2 instead (SetPasswordReminder
    // on the tracker). Buddies still set one immediately — staff access
    // can't depend on OTP delivery.
    const hasPassword = existing?.password_set === true;
    const dest = (role === 'student' || hasPassword) ? normalDest : `/set-password?dest=${encodeURIComponent(normalDest)}`;

    const res = NextResponse.json({ ok: true, dest });
    pending.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
    );
    return res;
  } catch (e) {
    console.error('[verify-otp] error', e);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
