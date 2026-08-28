import { NextRequest, NextResponse, after } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { parseSignupDevice } from '@/lib/device-detect';
import { attributionFromCookie } from '@/lib/attribution';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';
import { isAdminPhoneE164 } from '@/lib/admin-config';
import { clientIp } from '@/lib/request-ip';
import { registerAttemptAndCheck, clearAttempts } from '@/lib/attempt-throttle';
import { logSecurityEvent } from '@/lib/security-log';
import { dispatch } from '@/lib/notification-os';
import { sendMetaCapiEvent } from '@/lib/meta-capi';
import { recordSacredFailure } from '@/lib/os/sacred-failure';
import { applyOnboarding, type OnboardingPayload } from '@/lib/onboarding-apply';


export async function POST(request: NextRequest) {
  try {
    const { phone: rawPhone, token, name: rawName, userType, onboarding } = (await request.json()) as {
      phone?: string; token?: string; name?: string; userType?: string; onboarding?: OnboardingPayload;
    };
    // Which role the person chose on the login screen ('student' | 'buddy').
    // Honored ONLY for brand-new signups (below) — it must never downgrade an
    // existing buddy/admin or silently convert an existing real student.
    const wantsBuddy = userType === 'buddy';
    // Name comes from the /start self-signup form (allowlist users get their name
    // from the allowlist entry instead). Trim + cap to a sane length.
    const selfName = (rawName ?? '').trim().slice(0, 80) || null;
    const e164 = normalizeIndianPhone(rawPhone ?? '');
    if (!e164 || !token || !/^\d{6}$/.test(token.trim())) {
      return NextResponse.json({ error: 'Invalid phone or OTP.' }, { status: 400 });
    }

    // Brute-force cap on OTP verification. A 6-digit code is a 10^6 space; the
    // send-side limits don't stop an attacker who triggered one code to a victim
    // from spraying guesses at this endpoint. Record up front (race-free), cap at
    // 5/phone + 50/IP per 15 min, clear on success.
    const admin = createAdminClient();
    const ip = clientIp(request);
    const otpKey = `otpv:${e164}`;
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

    const { data, error } = await supabase.auth.verifyOtp({
      phone: e164,
      token: token.trim(),
      type: 'sms',
    });

    if (error || !data.user) {
      return NextResponse.json({ error: 'That OTP is incorrect or expired.' }, { status: 401 });
    }
    await clearAttempts(admin, otpKey);

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

    // Freemium: no allowlist entry = self-signup → create a brand-new FREE
    // student (was previously rejected with 403). The allowlist now only assigns
    // a buddy/admin role or a pre-paid student, never gates access.
    const signupSource = entry ? 'allowlist' : 'self_serve';

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
    const isAdminPhone = await isAdminPhoneE164(e164);
    const role = (
      isAdminPhone
        ? 'admin'
        : existing?.role === 'buddy' || existing?.role === 'admin'
          ? existing.role
          : entry?.person_type === 'buddy'
            ? 'buddy'
            // Honor the "Buddy" choice from the login picker for a brand-new signup
            // (no profile yet, or just the trigger stub) so a buddy lands in the
            // buddy flow + buddy setup instead of the student onboarding. Existing
            // real students are never auto-converted.
            : (wantsBuddy && (isStub || !existing))
              ? 'buddy'
              : 'student'
    ) as 'student' | 'buddy' | 'admin';
    const normalDest =
      role === 'admin' ? '/admin' :
      role === 'buddy' ? '/buddy/students' :
      '/student/tracker';

    // Which phone/browser they signed up from — stored for the leads team and
    // sent to Expedify so the AI agent gives device-specific guidance.
    const signupDevice = parseSignupDevice(request.headers.get('user-agent'));

    // Which ad paid for this student. The cr_attr cookie has been capturing
    // utm/gclid/fbclid on landing for a while; this is the first place it is
    // read server-side, which is what turns it into an answerable question
    // (GROWTH-OS §5 listed the missing join under Planned).
    //
    // Written on BOTH paths below, not just the insert. The stub-update branch
    // exists because a DB trigger can win the race and create the row first —
    // and that branch is the one that already cost 32 students their name and
    // number by writing fewer fields than the insert did. Attribution must not
    // become the next field that only lands when the timing is lucky.
    const attr = attributionFromCookie(request.cookies.get('cr_attr')?.value ?? null);
    const attrColumns = {
      attr_channel: attr.channel,
      attr_source: attr.source,
      attr_medium: attr.medium,
      attr_campaign: attr.campaign,
      attr_click_id: attr.clickId,
      attr_stamped_at: new Date().toISOString(),
    };

    if (!existing) {
      // ── The race that lost 32 students their name and number ──────────────
      //
      // verifyOtp() above creates the auth user, which fires the
      // handle_new_user trigger, which inserts a stub profile ('New User', no
      // phone). Whether that stub is VISIBLE to the SELECT a few lines up is a
      // matter of milliseconds. Lose the race and we land in this "no profile
      // yet" branch and INSERT — onto the primary key the trigger just took.
      //
      // The failure was silent, because this insert's result was never read.
      // The trigger's stub survived untouched and the student was saved with
      // full_name 'New User', phone null, signup_source null. All three empty
      // TOGETHER — the fingerprint of one write that never landed, not three
      // fields nobody thought to collect.
      //
      // Same code, decided by timing alone: of six signups on 11 Aug, five lost
      // their name and number and the sixth came through clean.
      //
      // upsert makes the branch irrelevant — whichever of us writes second wins
      // with the real data — and the error is read rather than swallowed.
      const { error: upsertErr } = await admin.from('profiles').upsert({
        id: data.user.id,
        role,
        full_name: entry?.full_name ?? selfName ?? (role === 'buddy' ? 'Buddy' : 'Student'),
        email: entry?.email ?? null,
        phone: e164,
        buddy_id: role === 'student' ? (entry?.assigned_buddy_id ?? null) : null,
        subscription_status: role === 'student' ? 'free' : null,
        is_premium: false,
        signup_source: role === 'student' ? signupSource : null,
        signup_device: signupDevice.device,
        signup_browser: signupDevice.browser,
        password_set: false,
        ...(role === 'student' ? attrColumns : {}),
      }, { onConflict: 'id' });
      if (upsertErr) {
        // A profile row is not optional: without it the student has no plan, no
        // buddy, and nobody can reach them. Fail loudly rather than hand back a
        // session that looks fine while the student is quietly lost.
        console.error('[verify-phone-otp] profile upsert failed:', upsertErr.message);
        return NextResponse.json(
          { error: 'Could not finish creating your account. Please try once more.' },
          { status: 500 }
        );
      }
    } else if (isStub) {
      // Trigger-created stub: apply the real registration from the allowlist —
      // name, email, role, and (for students) the assigned buddy. This is what
      // keeps the admin Students tab consistent with People & Data.
      //
      // The error is CHECKED, same as the upsert branch above. This exact
      // update failed silently for every signup between 10 Aug 21:00 and 11
      // Aug 20:00 IST — the DB's subscription_status constraint had dropped
      // 'free_beta' while this code still wrote it, so the whole row (name,
      // phone, source) bounced, and nothing said so. The student sailed on
      // with a working session and a nameless profile.
      const { error: stubErr } = await admin
        .from('profiles')
        .update({
          role,
          full_name: entry?.full_name ?? selfName ?? existing.full_name ?? (role === 'buddy' ? 'Buddy' : 'Student'),
          email: entry?.email ?? existing.email ?? null,
          phone: e164,
          buddy_id: role === 'student' ? (entry?.assigned_buddy_id ?? null) : null,
          signup_device: signupDevice.device,
          signup_browser: signupDevice.browser,
          ...(role === 'student' ? { subscription_status: 'free', signup_source: signupSource, ...attrColumns } : {}),
        })
        .eq('id', data.user.id);
      if (stubErr) {
        console.error('[verify-phone-otp] stub registration update failed:', stubErr.message);
        return NextResponse.json(
          { error: 'Could not finish creating your account. Please try once more.' },
          { status: 500 }
        );
      }
    } else {
      // Returning user with a real profile — only refresh phone and (if the
      // admin reassigned them) their buddy. Never clobber their real name.
      // Checked for the same reason as the branches above: a phone that fails
      // to refresh is a student sales can no longer call.
      const { error: refreshErr } = await admin
        .from('profiles')
        .update({
          phone: e164,
          ...(role === 'student' && entry?.assigned_buddy_id ? { buddy_id: entry.assigned_buddy_id } : {}),
        })
        .eq('id', data.user.id);
      if (refreshErr) {
        // Returning user: their profile already has its real data — log loudly
        // but do not block a working login over a failed phone refresh.
        console.error('[verify-phone-otp] returning-user phone refresh failed:', refreshErr.message);
      }
    }

    // ── The signup conversion, fired from the SERVER (12 Aug) ───────────────
    //
    // Meta's Ads Manager counted 7 of 11 Aug's 20 signups. Two stacked losses:
    // the browser pixel's CompleteRegistration fires only when the post-signup
    // screen mounts (7 students never reached it), and ad-blockers, iOS and
    // in-app browsers ate roughly half of what did fire. THIS request is the
    // moment a lead actually exists, and nothing client-side can block it — so
    // the Conversions API event fires here with the verified phone as the
    // match key, plus IP, user-agent and the _fbp/_fbc cookies when the pixel
    // managed to set them. The browser still fires CompleteRegistration with
    // the SAME event id (the user id, passed via student/layout), so Meta
    // dedups the pair instead of counting twice — the exact mistake the
    // localStorage guard in post-signup-sequence exists to prevent.
    //
    // Inert without META_CAPI_TOKEN (meta-capi.ts no-ops), best-effort via
    // after(): a Meta outage can never slow a student's signup.
    if (role === 'student' && (isStub || !existing)) {
      const newUserId = data.user.id;
      const capiBase = {
        phone: e164,
        clientIp: ip,
        userAgent: request.headers.get('user-agent'),
        fbp: request.cookies.get('_fbp')?.value ?? null,
        fbc: request.cookies.get('_fbc')?.value ?? null,
      };
      after(async () => {
        // Lead is what the campaigns optimize for; CompleteRegistration keeps
        // parity with the browser event so the two dedup into one.
        await sendMetaCapiEvent({ eventName: 'Lead', eventId: `lead-${newUserId}`, ...capiBase });
        await sendMetaCapiEvent({ eventName: 'CompleteRegistration', eventId: newUserId, ...capiBase });
      });
    }

    // Pre-auth funnel (/start): a brand-new student answered a full set of
    // questions before any account existed. Applying them is lib/onboarding-apply's
    // job, not this route's — "Continue with Google" on the same final screen
    // has to produce an identical student, and the only way to guarantee that
    // is for both doors to run the same code rather than two copies of it.
    //
    // The isStub/!existing guard stays HERE because only this route knows
    // whether the account it just touched already existed. Incident #42 is the
    // reason that is stated rather than assumed: a guard in the caller is not a
    // guard in the callee, so onboarding-authority.guard.test.ts asserts every
    // caller carries it instead of trusting this comment.
    if ((isStub || !existing) && role === 'student' && onboarding) {
      await applyOnboarding(admin, data.user.id, onboarding);
    }

    // Expedify hand-off (founder, 24 Jul): do NOT call at signup. A brand-new
    // student hasn't had a chance to install the app or switch on notifications
    // yet, so an immediate call is premature — and a call to someone who DOES
    // activate is wasted spend. Queue every new student instead; the
    // expedify-flush cron later sends ONLY the leads that are still un-activated
    // (no install / notifications off) and skips anyone who self-activated. (A
    // separate sales-focused call flow will be planned later.)
    if ((isStub || !existing) && role === 'student') {
      const newUserId = data.user.id;
      after(async () => {
        await admin.from('profiles').update({ expedify_status: 'queued' }).eq('id', newUserId);
      });
    }

    // Admin phone: guarantee the DB role is 'admin' so /admin (which re-checks
    // the DB role, not just the session) lets them straight in — even if this
    // number's profile pre-existed as a student.
    if (isAdminPhone) {
      await admin.from('profiles').update({ role: 'admin' }).eq('id', data.user.id);
    }

    // Seed the engagement row for students (idempotent) — drives the sales-ready
    // trigger (§D). Safe to call on every login; only inserts once.
    if (role === 'student') {
      await admin
        .from('student_engagement')
        .upsert({ student_id: data.user.id }, { onConflict: 'student_id', ignoreDuplicates: true });
    }

    // Alert the admin(s) the moment a brand-new student self-signs up, so the team
    // can reach out fast (the admin Students tab now lists them newest-first with a
    // one-tap WhatsApp button). Fires only on a genuinely new self-serve signup —
    // not on returning logins. Best-effort: wrapped so it never blocks/breaks auth.
    if ((isStub || !existing) && role === 'student' && signupSource === 'self_serve') {
      try {
        const newName = entry?.full_name ?? selfName ?? 'A new student';
        const { data: admins } = await admin.from('profiles').select('id, notif_prefs').eq('role', 'admin');
        await Promise.all(
          (admins ?? []).map((a) =>
            dispatch({
              userId: a.id as string,
              type: 'new_signup',
              title: '🎉 New student joined CareerRai',
              body: `${newName} (${e164}) just signed up — tap to add them on WhatsApp.`,
              url: '/admin', data: { phone: e164 },
              reason: 'New self-serve student signup', expectedAction: 'acknowledge',
              prefs: (a.notif_prefs as Record<string, unknown>) ?? {},
            })
          )
        );
      } catch (notifyErr) {
        console.error('[verify-phone-otp] admin signup notify failed', notifyErr);
      }
    }

    // Students skip the set-password wall (day-2 in-app reminder instead —
    // see SetPasswordReminder); buddies/admins still set one immediately.
    const hasPassword = existing?.password_set === true;
    const dest = (role === 'student' || hasPassword) ? normalDest : `/set-password?dest=${encodeURIComponent(normalDest)}`;

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
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 30, // 30 days — matches password login in auth/login/route.ts
      });
    }
    return res;
  } catch (e) {
    console.error('[verify-phone-otp] error', e);
    // A signup that 500s is a student lost at the door, and nobody ever hears
    // about it — the same silence that hid Incident #30 for a whole evening.
    void recordSacredFailure(createAdminClient(), 'signup', null, e);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
