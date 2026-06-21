import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';

export async function POST(request: NextRequest) {
  try {
    const { phone: rawPhone } = (await request.json()) as { phone?: string };
    const e164 = normalizeIndianPhone(rawPhone ?? '');
    if (!e164) {
      return NextResponse.json({ sent: false, message: 'Enter a valid 10-digit Indian mobile number.' }, { status: 400 });
    }

    // The registered admin phone always bypasses the allowlist gate.
    const isAdminPhone = e164 === '+917015269714';

    // Gate: phone must be registered in the allowlist (admin exempt)
    const admin = createAdminClient();
    if (!isAdminPhone) {
      const { data: entry } = await admin
        .from('student_allowlist')
        .select('status')
        .eq('phone', e164)
        .maybeSingle();

      if (!entry || entry.status !== 'active') {
        return NextResponse.json(
          { sent: false, message: "This number isn't registered yet. Your admin will add you after onboarding." },
          { status: 200 }
        );
      }
    }

    // Rate limit: max 3 sends / 30 min, 30s cooldown
    const now = Date.now();
    const since = new Date(now - 30 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from('otp_send_events')
      .select('sent_at')
      .eq('email', e164) // reuse the otp_send_events table with phone as the key
      .gte('sent_at', since)
      .order('sent_at', { ascending: false });

    const sends = recent ?? [];
    if (sends.length >= 3) {
      return NextResponse.json({ sent: false, message: 'Too many attempts. Try again in 30 minutes.' }, { status: 429 });
    }
    if (sends[0]) {
      const secsSince = (now - new Date(sends[0].sent_at).getTime()) / 1000;
      if (secsSince < 30) {
        return NextResponse.json(
          { sent: false, message: `Please wait ${Math.ceil(30 - secsSince)}s before requesting another code.` },
          { status: 429 }
        );
      }
    }

    // Trigger Supabase phone OTP — Supabase generates the code and calls our SMS hook
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

    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    if (error) {
      console.error('[request-phone-otp] signInWithOtp error:', error.message);
      const isRateLimited = error.status === 429 || /rate.limit/i.test(error.message);
      if (isRateLimited) {
        return NextResponse.json(
          { sent: false, message: 'Too many OTP requests. Wait a few minutes and try again.' },
          { status: 429 }
        );
      }
      return NextResponse.json({ sent: false, message: "Couldn't send the OTP. Try again." }, { status: 502 });
    }

    await admin.from('otp_send_events').insert({ email: e164 });

    const res = NextResponse.json({ sent: true });
    pending.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
    );
    return res;
  } catch (e) {
    console.error('[request-phone-otp] error', e);
    return NextResponse.json({ sent: false, message: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
