import { NextRequest, NextResponse, after } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { parseSignupDevice } from '@/lib/device-detect';
import { setBadDayFloor, setDailyHours } from '@/lib/daily-hours';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIndianPhone } from '@/lib/phone';
import { isAdminPhoneE164 } from '@/lib/admin-config';
import { clientIp } from '@/lib/request-ip';
import { registerAttemptAndCheck, clearAttempts } from '@/lib/attempt-throttle';
import { logSecurityEvent } from '@/lib/security-log';
import { sendNotification } from '@/lib/notifications';
import { validateCoverageMatrix, type MatrixEntry } from '@/lib/coverage-validate';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { isValidPushEndpoint } from '@/lib/push-validate';

// Whitelisted answers from the pre-auth /start funnel — collected before
// an account existed, handed over here in one shot on first signup only.
interface OnboardingPayload {
  ambition_date?: unknown;
  attempt_year?: unknown;
  dream_colleges?: unknown;
  target_percentile?: unknown;
  hours_available?: unknown;
  self_study_hours?: unknown;
  bad_day_floor?: unknown;
  coaching_enrolled?: unknown;
  is_repeater?: unknown;
  last_year_percentile?: unknown;
  had_buddy_last_year?: unknown;
  is_working_professional?: unknown;
  pain_points?: unknown;
  wants_mentor?: unknown;
  push_subscription?: unknown;
  push_prompted?: unknown;
  topic_matrix?: unknown;
}

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

    if (!existing) {
      // No profile at all (trigger disabled / edge case) — create from allowlist.
      await admin.from('profiles').insert({
        id: data.user.id,
        role,
        full_name: entry?.full_name ?? selfName ?? (role === 'buddy' ? 'Buddy' : 'Student'),
        email: entry?.email ?? null,
        phone: e164,
        buddy_id: role === 'student' ? (entry?.assigned_buddy_id ?? null) : null,
        subscription_status: role === 'student' ? 'free_beta' : null,
        is_premium: false,
        signup_source: role === 'student' ? signupSource : null,
        signup_device: signupDevice.device,
        signup_browser: signupDevice.browser,
        password_set: false,
      });
    } else if (isStub) {
      // Trigger-created stub: apply the real registration from the allowlist —
      // name, email, role, and (for students) the assigned buddy. This is what
      // keeps the admin Students tab consistent with People & Data.
      await admin
        .from('profiles')
        .update({
          role,
          full_name: entry?.full_name ?? selfName ?? existing.full_name ?? (role === 'buddy' ? 'Buddy' : 'Student'),
          email: entry?.email ?? existing.email ?? null,
          phone: e164,
          buddy_id: role === 'student' ? (entry?.assigned_buddy_id ?? null) : null,
          signup_device: signupDevice.device,
          signup_browser: signupDevice.browser,
          ...(role === 'student' ? { subscription_status: 'free_beta', signup_source: signupSource } : {}),
        })
        .eq('id', data.user.id);
    } else {
      // Returning user with a real profile — only refresh phone and (if the
      // admin reassigned them) their buddy. Never clobber their real name.
      await admin
        .from('profiles')
        .update({
          phone: e164,
          ...(role === 'student' && entry?.assigned_buddy_id ? { buddy_id: entry.assigned_buddy_id } : {}),
        })
        .eq('id', data.user.id);
    }

    // Pre-auth funnel (/start): a brand-new student answered a full set of
    // questions before any account existed — this is the one place those
    // answers get persisted, whitelisted field-by-field. Never applied to a
    // returning user's real profile (isStub/!existing only, same guard the
    // registration branches above use).
    if ((isStub || !existing) && role === 'student' && onboarding) {
      const profileUpdate: Record<string, unknown> = {};
      if (typeof onboarding.ambition_date === 'string') profileUpdate.syllabus_target_date = onboarding.ambition_date;
      // Which CAT they picked in the funnel. Bounded to this year..+3 so a
      // tampered payload can't set a countdown to an arbitrary date, and so a
      // 2027 aspirant stops being silently filed under this year's exam.
      if (typeof onboarding.attempt_year === 'number') {
        const thisYear = new Date().getFullYear();
        if (Number.isInteger(onboarding.attempt_year)
            && onboarding.attempt_year >= thisYear && onboarding.attempt_year <= thisYear + 3) {
          profileUpdate.attempt_year = onboarding.attempt_year;
        }
      }
      if (Array.isArray(onboarding.dream_colleges)) {
        profileUpdate.dream_colleges = onboarding.dream_colleges.filter((c): c is string => typeof c === 'string').slice(0, 3);
      }
      if (typeof onboarding.target_percentile === 'number' && onboarding.target_percentile >= 50 && onboarding.target_percentile <= 99) {
        profileUpdate.target_percentile = onboarding.target_percentile;
      }
      if (typeof onboarding.hours_available === 'number') {
        // Replaying what they entered pre-signup. Still their own number.
        // (Legacy clients mid-funnel may still send hours; accepted as before.)
        Object.assign(profileUpdate, setDailyHours(onboarding.hours_available, 'signup'));
      }
      if (typeof onboarding.self_study_hours === 'number') {
        // The normal-day self-study number, excluding coaching/college/work.
        // Same one writer as every other hours write. It is asked at signup
        // again (it was removed this morning) because the finish date cannot
        // be computed without it — but it no longer sizes the daily plan, so
        // an ambitious answer costs a date correction, not a broken day.
        Object.assign(profileUpdate, setDailyHours(onboarding.self_study_hours, 'signup'));
      }
      if (typeof onboarding.bad_day_floor === 'number') {
        // Stage A: the bad-day floor — the size the daily plan is built to.
        // Written only through the one-owner module, same as the hours.
        Object.assign(profileUpdate, setBadDayFloor(onboarding.bad_day_floor));
      }
      if (typeof onboarding.coaching_enrolled === 'boolean') profileUpdate.coaching_enrolled = onboarding.coaching_enrolled;
      if (typeof onboarding.is_repeater === 'boolean') profileUpdate.is_repeater = onboarding.is_repeater;
      // Repeater-only sales signal (founder, 23 Jul): last year's real
      // percentile + whether they had genuine expert support last time.
      if (typeof onboarding.last_year_percentile === 'number' && onboarding.last_year_percentile >= 0 && onboarding.last_year_percentile <= 99.99) {
        profileUpdate.last_year_percentile = onboarding.last_year_percentile;
      }
      if (typeof onboarding.had_buddy_last_year === 'boolean') profileUpdate.had_buddy_last_year = onboarding.had_buddy_last_year;
      // Identity Engine (LIS L1): capture whether they're working — the persona
      // that most changes the plan shape (was never asked, so a working student
      // like Pranav got a full-time-aspirant plan).
      if (typeof onboarding.is_working_professional === 'boolean') profileUpdate.is_working_professional = onboarding.is_working_professional;
      if (Array.isArray(onboarding.pain_points)) {
        profileUpdate.pain_points = onboarding.pain_points.filter((p): p is string => typeof p === 'string').slice(0, 2);
      }
      if (typeof onboarding.wants_mentor === 'boolean') profileUpdate.wants_mentor = onboarding.wants_mentor;

      const subscription = onboarding.push_subscription as { endpoint?: unknown } | null | undefined;
      if (subscription?.endpoint && isValidPushEndpoint(subscription.endpoint)) {
        profileUpdate.push_subscription = subscription;
        profileUpdate.notif_prefs = { push: true };
      } else if (onboarding.push_prompted === true) {
        profileUpdate.notif_prefs = { push_prompted: true };
      }

      // A non-empty topic matrix is only ever sent once the /start wizard's
      // final mandatory step completed — the same signal the old post-login
      // Builder used to mark itself done.
      //
      // BUG FIX (audit, 14 July): onboarding_completed used to be flipped
      // true in THIS same profileUpdate, written BEFORE the coverage matrix
      // below was even validated — so a student whose matrix failed server
      // validation (or hit a transient DB error on the upsert) ended up with
      // onboarding_completed=true and ZERO coverage rows, and no way back
      // in (the pre-auth payload only replays for brand-new/stub profiles).
      // Now it's only set after the coverage write actually succeeds.
      const matrixOk = Array.isArray(onboarding.topic_matrix) && onboarding.topic_matrix.length > 0;

      const userId = data.user.id;
      if (Object.keys(profileUpdate).length > 0) {
        await admin.from('profiles').update(profileUpdate).eq('id', userId);
      }

      if (matrixOk) {
        const matrix = onboarding.topic_matrix as MatrixEntry[];
        const problem = validateCoverageMatrix(matrix);
        if (!problem) {
          // Topics a student says they already covered BEFORE joining must get a
          // realistic revision schedule. Seeding them all at "now" makes the
          // engine treat them as freshly studied, so they'd never come due for
          // revision. Backdate the covered ones (practicing/revising/exam_ready)
          // so revision comes due STAGGERED over the first ~2.5 weeks — timely,
          // but no day-1 flood. not_started / learning keep "now".
          const now = Date.now();
          const COVERED = new Set(['practicing', 'revising', 'exam_ready']);
          const coveredEntries = matrix.filter((e) => COVERED.has(e.status!));
          const SPREAD_DAYS = 18;
          const rows = matrix.map((e) => {
            let updatedAt = new Date(now).toISOString();
            if (COVERED.has(e.status!)) {
              const idx = coveredEntries.indexOf(e);
              const dueInDays = coveredEntries.length > 1
                ? Math.round((idx / (coveredEntries.length - 1)) * SPREAD_DAYS)
                : 0;
              const freq = TOPIC_METADATA[e.topic!]?.revisionFrequencyDays ?? 14;
              // updated_at = now − (freq − dueInDays) → comes revision-due ~dueInDays from now
              const backdate = Math.max(0, freq - dueInDays);
              updatedAt = new Date(now - backdate * 86_400_000).toISOString();
            }
            return { student_id: userId, section: e.section!, topic: e.topic!, status: e.status!, updated_at: updatedAt };
          });
          const { error: coverageError } = await admin.from('topic_coverage').upsert(rows, { onConflict: 'student_id,section,topic' });
          if (coverageError) {
            console.error('[verify-phone-otp] coverage upsert failed, NOT marking onboarding complete:', coverageError.message);
          } else {
            await admin.from('profiles').update({
              onboarding_completed: true,
              onboarding_last_activity_at: new Date().toISOString(),
            }).eq('id', userId);
          }
        } else {
          console.error('[verify-phone-otp] rejected pre-auth coverage matrix, NOT marking onboarding complete:', problem);
        }
      }
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
        const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin');
        await Promise.all(
          (admins ?? []).map((a) =>
            sendNotification({
              userId: a.id,
              type: 'new_signup',
              title: '🎉 New student joined CareerRai',
              body: `${newName} (${e164}) just signed up — tap to add them on WhatsApp.`,
              data: { url: '/admin', phone: e164 },
              channels: ['in_app', 'push'],
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
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
