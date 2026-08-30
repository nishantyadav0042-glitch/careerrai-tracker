import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';
import { clientIp } from '@/lib/request-ip';
import { registerAttemptAndCheck, clearAttempts } from '@/lib/attempt-throttle';
import { logSecurityEvent } from '@/lib/security-log';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';

// Completes the attach started by ../request. On success this account gains its
// anchor and the gate opens — so this is the one place, besides the signup OTP
// door, permitted to stamp profiles.phone_verified_at.

export async function POST(request: NextRequest) {
  try {
    const { phone: rawPhone, token } = (await request.json()) as { phone?: string; token?: string };
    const e164 = normalizeIndianPhone(rawPhone ?? '');
    if (!e164 || !token || !/^\d{6}$/.test(token.trim())) {
      return NextResponse.json({ error: 'Invalid phone or OTP.' }, { status: 400 });
    }

    const pending: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
    const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            pending.push({ name, value, options: options as Record<string, unknown> })
          ),
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

    const admin = createAdminClient();
    const ip = clientIp(request);

    // Same brute-force cap as the signup verifier, and for the same reason: a
    // 6-digit code is a 10^6 space and nothing else here stops a sprayer who
    // triggered one code to a number they do not hold. Keyed on the phone so an
    // attacker cannot get a fresh budget by re-requesting.
    const otpKey = `otplink:${e164}`;
    if (await registerAttemptAndCheck(admin, otpKey, ip, { maxPerKey: 5, maxPerIp: 50 })) {
      await logSecurityEvent(admin, { type: 'otp_verify_lockout', severity: 'warning', ip });
      return NextResponse.json(
        { error: 'Too many attempts. Request a new code and wait a few minutes.' },
        { status: 429 }
      );
    }

    // 'phone_change', NOT 'sms'. The 'sms' type is the sign-in verifier and
    // would authenticate a NEW session for whoever holds the number — which on
    // this route is precisely the second account we exist to prevent.
    // 'phone_change' attaches the number to the session already in hand.
    const { error } = await supabase.auth.verifyOtp({
      phone: e164,
      token: token.trim(),
      type: 'phone_change',
    });

    if (error) {
      console.error('[link-phone/verify] verifyOtp error:', error.message);
      return NextResponse.json({ error: 'That OTP is incorrect or expired.' }, { status: 401 });
    }
    await clearAttempts(admin, otpKey);

    // The anchor. `phone` is written in canonical E.164 from the normalizer, not
    // from whatever the form posted — Incident #62 put 92 bare 10-digit numbers
    // in this column by trusting a client string.
    const { error: profileErr } = await admin
      .from('profiles')
      .update({ phone: e164, phone_verified_at: new Date().toISOString() })
      .eq('id', user.id);

    if (profileErr) {
      // The identity IS attached at this point (GoTrue committed it), so the
      // student is not sent back to do it again. But the gate reads the profile
      // column, so failing to write it would loop them forever — say so loudly.
      console.error('[link-phone/verify] anchor write failed:', profileErr.message);
      return NextResponse.json(
        { error: 'Your number was verified but we could not finish. Please refresh.' },
        { status: 500 }
      );
    }

    const res = NextResponse.json({ ok: true });
    pending.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
    );
    return res;
  } catch (e) {
    console.error('[link-phone/verify] error', e);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
