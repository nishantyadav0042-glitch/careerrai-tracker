import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';
import { clientIp } from '@/lib/request-ip';
import { registerAttemptAndCheck, clearAttempts } from '@/lib/attempt-throttle';
import { logSecurityEvent } from '@/lib/security-log';

// Brute-force / credential-stuffing guard. This same route authenticates
// student, buddy AND admin accounts, so an unthrottled password endpoint is an
// account-takeover surface. Every attempt is recorded UP FRONT (race-free) and
// counted per credential (5) + per IP (30) over a 15-min window; over the limit
// redirects to /login?error=locked. A successful login clears the counter.
const MAX_FAILS_PER_CREDENTIAL = 5; // wrong tries against one account
const MAX_FAILS_PER_IP = 30; // spraying many accounts from one source

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
  const ip = clientIp(request);

  // Throttle key: normalise the same way we later authenticate (phone→E.164,
  // else lowercased credential) so all tries against one real account collapse
  // to a single key.
  const e164 = normalizeIndianPhone(credential);
  const attemptKey = e164 ?? credential.toLowerCase();

  // Record this attempt and check the limit BEFORE authenticating. Recording up
  // front is what makes parallel requests count each other — closing the
  // check-then-act race. The row is cleared on a successful login below.
  if (await registerAttemptAndCheck(admin, attemptKey, ip, {
    maxPerKey: MAX_FAILS_PER_CREDENTIAL,
    maxPerIp: MAX_FAILS_PER_IP,
  })) {
    await logSecurityEvent(admin, {
      type: 'login_lockout', severity: 'warning', ip,
      metadata: { credentialType: e164 ? 'phone' : 'email' },
    });
    return NextResponse.redirect(`${origin}/login?error=locked`, { status: 302 });
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

  function buildResponse(dest: string, role: string, email?: string | null) {
    const response = NextResponse.redirect(`${origin}${dest}`, { status: 302 });
    pending.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
    });
    response.cookies.set('user_role', role, {
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
    });
    // The buddy demo account is a guided TOUR of the student side — viewing
    // only. The cookie is what the proxy uses to refuse writes, and it is
    // NOT httpOnly so the tour overlay can key off it client-side. Its VALUE
    // is unique per login: the tour replays whenever it sees a value it
    // hasn't shown for, which makes every login a fresh from-zero tour
    // (founder: "each time I login it should be considered fresh"). Any
    // other login on the same browser clears it.
    if (email?.toLowerCase() === 'buddydemo@careerrai.in') {
      response.cookies.set('cr_demo', String(Date.now()), {
        path: '/', sameSite: 'lax', httpOnly: false,
        secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24,
      });
    } else {
      response.cookies.delete({ name: 'cr_demo', path: '/' });
    }
    return response;
  }

  // Phone + password (primary login method)
  // Always authenticates via email even when credential is a phone number, because
  // users are created with email identities (not phone identities). Phone is only
  // used to look up which auth account to sign into.
  if (e164) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, role')
      .eq('phone', e164)
      .maybeSingle();

    if (!profile) {
      console.error('[LOGIN] No profile found for phone:', e164);
      return NextResponse.redirect(`${origin}/login?error=1`, { status: 302 });
    }

    // Prefer email auth (works for email-identity users).
    // Fall back to phone auth for phone-identity-only accounts (no email stored).
    const authResult = profile.email
      ? await supabase.auth.signInWithPassword({ email: profile.email, password })
      : await supabase.auth.signInWithPassword({ phone: e164, password });

    if (authResult.error) {
      console.error('[LOGIN] Phone auth error:', authResult.error.message);
      return NextResponse.redirect(`${origin}/login?error=1`, { status: 302 });
    }

    await clearAttempts(admin, attemptKey);
    const role = profile.role ?? 'student';
    const dest = role === 'admin' ? '/admin' : role === 'buddy' ? '/buddy/home' : role === 'sales' ? '/sales' : '/student/tracker';
    return buildResponse(dest, role, profile.email);
  }

  // Email + password (admin fallback or non-phone users)
  const credLower = credential.toLowerCase();
  const isEmail = credLower.includes('@');
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, role')
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

  await clearAttempts(admin, attemptKey);
  const role = profile.role ?? 'student';
  const dest = role === 'admin' ? '/admin' : role === 'buddy' ? '/buddy/home' : role === 'sales' ? '/sales' : '/student/tracker';
  return buildResponse(dest, role, profile.email);
}
