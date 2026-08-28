import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp } from '@/lib/request-ip';
import { registerAttemptAndCheck } from '@/lib/attempt-throttle';

// ── THE HAND-OFF, NOT THE APPLICATION ───────────────────────────────────────
//
// Called immediately before "Continue with Google" sends the browser away.
// It stores the /start draft server-side and returns a cookie holding only an
// opaque id, because localStorage does not survive into /auth/callback — that
// is a server redirect, and the answers would otherwise be lost the moment a
// student chose Google over OTP.
//
// THIS ENDPOINT WRITES NOTHING TO A PROFILE. It cannot: at this point in the
// journey no account exists. All it does is park a payload that /auth/callback
// may later hand to lib/onboarding-apply — and only after that route has
// established the account it just created is genuinely new. Keeping the
// parking and the applying apart is what stops an unauthenticated POST from
// ever reaching a real student's profile.

export const COOKIE = 'cr_onb_draft';
const MAX_BYTES = 64 * 1024;
const TTL_SECONDS = 30 * 60;

export async function POST(request: NextRequest) {
  try {
    // Unauthenticated by necessity — there is no account yet — so it is rate
    // limited by IP instead. Without this it is a free anonymous write into
    // our database, and 30 minutes of TTL is no defence against a loop.
    const ip = clientIp(request);
    const admin = createAdminClient();
    const ok = await registerAttemptAndCheck(
      admin, `stash-onboarding:${ip ?? 'unknown'}`, ip,
      { maxPerKey: 20, maxPerIp: 40 },
    );
    if (!ok) {
      return NextResponse.json({ error: 'Too many attempts.' }, { status: 429 });
    }

    const raw = await request.text();
    // A draft is bounded input. 53 topics plus the questionnaire is a few KB;
    // anything near 64 KB is not a student answering questions.
    if (raw.length > MAX_BYTES) {
      return NextResponse.json({ error: 'Draft too large.' }, { status: 413 });
    }

    let payload: unknown;
    try { payload = JSON.parse(raw); } catch {
      return NextResponse.json({ error: 'Bad draft.' }, { status: 400 });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json({ error: 'Bad draft.' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('onboarding_drafts')
      .insert({ payload })
      .select('id')
      .single();

    if (error || !data) {
      // Never fatal. A student who cannot stash simply signs in with Google and
      // completes onboarding in-app, which is the pre-existing behaviour — far
      // better than blocking the signup itself.
      console.error('[stash-onboarding] insert failed:', error?.message);
      return NextResponse.json({ stashed: false }, { status: 200 });
    }

    const res = NextResponse.json({ stashed: true });
    res.cookies.set(COOKIE, data.id as string, {
      httpOnly: true,          // the id is a capability; script must not read it
      sameSite: 'lax',         // must survive the top-level redirect back from Google
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: TTL_SECONDS,
    });
    return res;
  } catch (e) {
    console.error('[stash-onboarding] error:', e);
    return NextResponse.json({ stashed: false }, { status: 200 });
  }
}
