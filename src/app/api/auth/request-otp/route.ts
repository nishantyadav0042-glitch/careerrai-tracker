import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

const NOT_REGISTERED = "This email isn't registered yet. Your founder will add you after onboarding.";

export async function POST(request: NextRequest) {
  try {
    const { email: rawEmail } = (await request.json()) as { email?: string };
    const email = rawEmail?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ sent: false, message: 'Enter a valid email address.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Gate: only active allowlist emails can request a code.
    const { data: entry } = await admin
      .from('student_allowlist')
      .select('status')
      .eq('email', email)
      .maybeSingle();
    if (!entry || entry.status !== 'active') {
      return NextResponse.json({ sent: false, message: NOT_REGISTERED }, { status: 200 });
    }

    // Rate limit: max 3 sends / 30 min, 30s cooldown.
    const now = Date.now();
    const since = new Date(now - 30 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from('otp_send_events')
      .select('sent_at')
      .eq('email', email)
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

    // Supabase sends the OTP via its built-in email provider — no external config needed.
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } }
    );
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      console.error('[request-otp] signInWithOtp error:', error.message);
      return NextResponse.json({ sent: false, message: "Couldn't send the code. Try again." }, { status: 502 });
    }

    await admin.from('otp_send_events').insert({ email });
    return NextResponse.json({ sent: true });
  } catch (e) {
    console.error('[request-otp] error', e);
    return NextResponse.json({ sent: false, message: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
