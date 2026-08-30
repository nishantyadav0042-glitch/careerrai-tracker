import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { homeForRole } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { applyOnboarding, type OnboardingPayload } from '@/lib/onboarding-apply';
import { COOKIE as ONBOARDING_DRAFT_COOKIE } from '@/app/api/auth/stash-onboarding/route';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';
import { decideGoogleArrival, LINK_PHONE_PATH } from '@/lib/identity';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code       = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type       = searchParams.get('type');
  // Where to land afterwards, when the caller asked for somewhere specific —
  // "Continue with Google" from a post-payment prompt should come back to the
  // page that sent them, not to the generic tracker.
  //
  // Same-origin paths ONLY. `next` arrives on the URL, so echoing it into a
  // redirect unchecked is an open redirect: //evil.com is a protocol-relative
  // URL that leaves this site entirely. This is the check /api/google/connect
  // already applies to its own return path.
  const rawNext = searchParams.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
    && !/[\r\n]/.test(rawNext) ? rawNext : null;

  const pending: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const supabase = createServerClient(
    supabaseUrl(),
    supabaseAnonKey(),
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
    .select('id, password_set, role, onboarding_completed, phone_verified_at, is_test_account, is_demo')
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
  // ── THE `!existing` HERE WAS DEAD, EXACTLY AS `isNewUser` WAS (Incident #62)
  //
  // Same root cause the comment further down already documents for the draft
  // claim: `handle_new_user` inserts the profile INSIDE the GoTrue transaction
  // that creates the auth user, so by the time this route runs `existing` is
  // ALWAYS non-null. `!existing && userEmail` could therefore never be true,
  // and this duplicate-account refusal — the one guard standing between a
  // Google sign-in and a second account — has never executed once in
  // production. Location in the code is not behaviour; that lesson was written
  // twenty lines below and the same mistake was live twenty lines above it.
  //
  // Now it runs on every arrival, and asks the question that actually matters:
  // does a DIFFERENT profile already carry this email? `.neq('id', userId)`
  // does the excluding in SQL, so the row for this very account can never be
  // mistaken for a rival claim on it.
  const { data: sameEmail } = userEmail
    ? await admin.from('profiles').select('id').eq('email', userEmail).neq('id', userId).maybeSingle()
    : { data: null };

  // ── THE ANCHOR GATE (Incident #62) ────────────────────────────────────────
  //
  // A CareerRai student is a VERIFIED PHONE NUMBER. Google proves an email,
  // which for 963 of 969 students matches nothing we hold, so Google can only
  // ever mint a stranger — and did, five times in its first two days, every one
  // of them unreachable by SMS or WhatsApp forever.
  //
  // Supabase has already created the auth user and the trigger has already
  // created the profile by the time we get here; that cannot be prevented from
  // this route. What CAN be prevented is that account being usable. So an
  // unanchored student is not admitted and is not deleted either — they are
  // sent to attach a phone to THIS id, which is the one outcome that produces
  // one account rather than two.
  const arrival = decideGoogleArrival({
    emailOwnedByAnotherAccount: !!sameEmail,
    profile: {
      // The allowlist-derived role is not used here: it says what this person
      // is ENTITLED to be, and the gate is about what their account IS. A
      // student whose allowlist row makes them a buddy is still an unanchored
      // student until the row is applied a few lines below.
      role: (existing?.role as string | null | undefined) ?? 'student',
      isTestAccount: existing?.is_test_account as boolean | null | undefined,
      isDemo: existing?.is_demo as boolean | null | undefined,
      anchor: { phoneVerifiedAt: existing?.phone_verified_at as string | null | undefined },
    },
  });

  if (arrival.kind === 'refuse_account_exists') {
    const res = NextResponse.redirect(`${origin}/login?error=account_exists`);
    pending.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
    );
    return res;
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
  const normalDest = next ?? (role === 'buddy' ? '/buddy/students' : '/student/tracker');

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

  // ── THE /start ANSWERS THEY GAVE BEFORE CHOOSING THIS DOOR ────────────────
  //
  // A student completes the whole onboarding questionnaire and only then picks
  // Google or OTP. The OTP door posts the draft with the request that creates
  // the account; Google cannot, because the browser has been to
  // accounts.google.com and back and localStorage never reached this server. So
  // the draft was parked before the redirect and is claimed here by the opaque
  // id in an HttpOnly cookie.
  //
  // Without this a Google student arrived with an empty profile and the student
  // layout sent them straight back through the questions they had just
  // answered — the single worst moment to ask someone to start again.
  //
  // ── WHY THIS IS NOT `isNewUser` (29 Aug, and it never could have been) ────
  //
  // It was, and the claim therefore never ran once. `on_auth_user_created` on
  // auth.users inserts the profile INSIDE the same transaction that creates the
  // auth user, which happens in GoTrue before this route is reached: production
  // shows profiles.created_at 21ms EARLIER than auth.users.created_at for both
  // Google signups on 29 Aug. So `existing` is always non-null here, `isNewUser`
  // is always false for Google, and a condition that reads as "brand new" was
  // structurally unreachable. Location in the code is not behaviour.
  //
  // The real condition was never newness — it is that this profile has not
  // finished onboarding. A trigger-created stub has not. A student who
  // abandoned a signup halfway has not, and gating on newness left them
  // permanently unable to recover: their profile existed, so the draft could
  // never apply, so onboarding_completed stayed false, so the student layout
  // sent them back to /start, where finishing it produced the same dead end.
  // That is the loop the founder hit, and it had no exit.
  //
  // The guard that actually matters is unchanged in strength: a student who HAS
  // completed onboarding is never touched, so a replayed cookie still cannot
  // overwrite a real profile with a stale funnel answer. `onboarding_completed`
  // is also the exact flag the student layout gates on, so the condition to
  // apply a draft and the condition to be sent back through onboarding are now
  // the same fact rather than two proxies for it.
  //
  // SAME AUTHORITY AS OTP, deliberately: lib/onboarding-apply, never a second
  // copy of the mapping.
  //
  // Best effort, and that is the point: the account and session already exist.
  // A student must never be bounced out of a signup that succeeded because a
  // draft lookup failed — they land in-app and answer in the Blueprint Builder
  // instead, which is exactly the pre-existing behaviour.
  //
  // The stored role wins over the allowlist-derived one for this check: a
  // buddy whose allowlist entry was later deactivated must not be treated as a
  // student and handed a funnel draft.
  const effectiveRole = role === 'buddy' ? 'buddy' : (existing?.role ?? 'student');
  if (effectiveRole === 'student' && existing?.onboarding_completed !== true) {
    await claimOnboardingDraft(admin, request, userId);
  }

  // ── LAND THEM WHERE THEY ACTUALLY WORK (30 Aug 2026) ────────────────────
  //
  // `normalDest` above is computed from `role`, which is derived from the
  // ALLOWLIST ENTRY (`entry?.person_type`) and can only ever be 'student' or
  // 'buddy'. It never consults the profile, so a signed-in SALES counsellor
  // coming through this callback was typed as a student and dropped on
  // /student/tracker — the study tracker — with no path to their queue and no
  // indication one existed.
  //
  // The password login route has always got this right (`role === 'sales' ?
  // '/sales'`), so it only bit the Google button, which is the one on the
  // login screen. Anshul had never signed in at all; that is the door he would
  // have used on his first morning.
  //
  // `effectiveRole` is the profile's own role and is already computed above
  // for the onboarding gate. Use it, and use the one canonical mapping rather
  // than a fourth hand-written ternary — three copies of this decision are how
  // the sales case went missing from one of them.
  const roleDest = next ?? (effectiveRole === 'buddy' ? '/buddy/students' : homeForRole(effectiveRole));

  // Students skip the set-password wall (day-2 in-app reminder instead —
  // see SetPasswordReminder); buddies/admins still set one immediately.
  const hasPassword = existing?.password_set === true;
  const normalRoleDest = (effectiveRole === 'student' || hasPassword) ? roleDest : `/set-password?dest=${encodeURIComponent(roleDest)}`;

  // The gate outranks every other destination, including `next`. An unanchored
  // account may not be handed a landing page it asked for — that is precisely
  // how it would end up inside the product with no phone attached. Where they
  // WERE going is preserved so the link step can finish the journey rather than
  // dumping them on a generic home.
  const dest = arrival.kind === 'gate_link_phone'
    ? `${LINK_PHONE_PATH}?dest=${encodeURIComponent(normalRoleDest)}`
    : normalRoleDest;

  const res = NextResponse.redirect(`${origin}${dest}`);
  pending.forEach(({ name, value, options }) =>
    res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
  );
  // Hygiene only — the draft row is single-use, so a surviving cookie cannot
  // re-apply anything. Clearing it keeps a stale id from riding along on every
  // later request for half an hour.
  if (request.cookies.get(ONBOARDING_DRAFT_COOKIE)) res.cookies.delete(ONBOARDING_DRAFT_COOKIE);
  return res;
}

/**
 * Claim the /start draft parked before the Google redirect, and apply it.
 *
 * Single-use by construction: the row is stamped consumed_at in the same
 * statement that reads it, conditional on it being unconsumed, so two
 * concurrent callbacks cannot both apply the same draft. Whatever happens, the
 * cookie is not the record — the row is.
 */
async function claimOnboardingDraft(
  admin: ReturnType<typeof createAdminClient>,
  request: NextRequest,
  userId: string,
): Promise<void> {
  const draftId = request.cookies.get(ONBOARDING_DRAFT_COOKIE)?.value;
  if (!draftId || !/^[0-9a-f-]{36}$/i.test(draftId)) return;

  try {
    // Claim and read in ONE statement. A plain select-then-update would let a
    // duplicated callback (a refresh, a double-tapped redirect) apply the same
    // answers twice; `.is('consumed_at', null)` makes the second one return no
    // row. Check-then-act is a race, not a guard — Incident #42.
    const { data, error } = await admin
      .from('onboarding_drafts')
      .update({ consumed_at: new Date().toISOString(), consumed_by: userId })
      .eq('id', draftId)
      .is('consumed_at', null)
      .select('payload')
      .maybeSingle();

    if (error) {
      console.error('[auth/callback] draft claim failed:', error.message);
      return;
    }
    if (!data?.payload) return; // already consumed, expired, or never existed

    await applyOnboarding(admin, userId, data.payload as OnboardingPayload);
  } catch (e) {
    console.error('[auth/callback] applying onboarding draft failed:', e);
  }
}
