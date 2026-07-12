import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';
import { clientIp } from '@/lib/request-ip';

// Brute-force / credential-stuffing guard. This same route authenticates
// student, buddy AND admin accounts, so an unthrottled password endpoint is an
// account-takeover surface. We count FAILED attempts in a short rolling window,
// per credential and per IP, and lock further tries with a "wait a few minutes"
// message (/login?error=locked). A successful login clears that credential's
// counter. All bookkeeping uses the service-role admin client; the window is
// short so any incidental lockout self-heals quickly.
const WINDOW_MS = 15 * 60 * 1000;
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
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();

  async function isLockedOut(): Promise<boolean> {
    const [{ count: byCred }, byIp] = await Promise.all([
      admin.from('login_attempts').select('*', { count: 'exact', head: true })
        .eq('credential', attemptKey).gte('created_at', windowStart),
      ip
        ? admin.from('login_attempts').select('*', { count: 'exact', head: true })
            .eq('ip', ip).gte('created_at', windowStart)
        : Promise.resolve({ count: 0 as number | null }),
    ]);
    return (byCred ?? 0) >= MAX_FAILS_PER_CREDENTIAL || (byIp.count ?? 0) >= MAX_FAILS_PER_IP;
  }
  // Only failures are ever inserted, so a row = one failed attempt.
  const recordFailure = () =>
    admin.from('login_attempts').insert({ credential: attemptKey, ip });
  const clearFailures = () =>
    admin.from('login_attempts').delete().eq('credential', attemptKey);

  if (await isLockedOut()) {
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

  function buildResponse(dest: string, role: string) {
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
      await recordFailure();
      return NextResponse.redirect(`${origin}/login?error=1`, { status: 302 });
    }

    // Prefer email auth (works for email-identity users).
    // Fall back to phone auth for phone-identity-only accounts (no email stored).
    const authResult = profile.email
      ? await supabase.auth.signInWithPassword({ email: profile.email, password })
      : await supabase.auth.signInWithPassword({ phone: e164, password });

    if (authResult.error) {
      console.error('[LOGIN] Phone auth error:', authResult.error.message);
      await recordFailure();
      return NextResponse.redirect(`${origin}/login?error=1`, { status: 302 });
    }

    await clearFailures();
    const role = profile.role ?? 'student';
    const dest = role === 'admin' ? '/admin' : role === 'buddy' ? '/buddy/home' : '/student/tracker';
    return buildResponse(dest, role);
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
    await recordFailure();
    return NextResponse.redirect(`${origin}/login?error=1`, { status: 302 });
  }

  const { error } = await supabase.auth.signInWithPassword({ email: profile.email, password });
  if (error) {
    console.error('[LOGIN] Email auth error:', error.message);
    await recordFailure();
    return NextResponse.redirect(`${origin}/login?error=1`, { status: 302 });
  }

  await clearFailures();
  const role = profile.role ?? 'student';
  const dest = role === 'admin' ? '/admin' : role === 'buddy' ? '/buddy/home' : '/student/tracker';
  return buildResponse(dest, role);
}
