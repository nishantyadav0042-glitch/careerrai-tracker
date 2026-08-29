import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';

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

    // Capture cookies set during signInWithOtp (code_verifier for PKCE) so the browser
    // can complete the /auth/callback exchange after clicking the email link.
    const pendingCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
    const supabase = createServerClient(
      supabaseUrl(),
      supabaseAnonKey(),
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) =>
            cookiesToSet.forEach(({ name, value, options }) =>
              pendingCookies.push({ name, value, options: options as Record<string, unknown> })
            ),
        },
      }
    );

    // emailRedirectTo: any path under the project's Site URL is allowed without dashboard changes.
    const siteOrigin = request.headers.get('origin') ?? new URL(request.url).origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${siteOrigin}/auth/callback` },
    });
    if (error) {
      console.error('[request-otp] signInWithOtp error:', error.message);
      // Supabase's shared email service caps sends per hour. Surface a clear
      // message so users know to wait (and check their inbox) instead of
      // hammering the button — which only deepens the rate limit.
      const isRateLimited =
        error.status === 429 ||
        /rate limit|over_email_send_rate_limit/i.test(`${error.code ?? ''} ${error.message}`);
      if (isRateLimited) {
        return NextResponse.json(
          {
            sent: false,
            message:
              'Too many emails just now. A login link may already be in your inbox — check there, or wait ~15 min and try again.',
          },
          { status: 429 }
        );
      }
      return NextResponse.json({ sent: false, message: "Couldn't send the link. Try again." }, { status: 502 });
    }

    await admin.from('otp_send_events').insert({ email });

    const res = NextResponse.json({ sent: true });
    pendingCookies.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
    );
    return res;
  } catch (e) {
    console.error('[request-otp] error', e);
    return NextResponse.json({ sent: false, message: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
