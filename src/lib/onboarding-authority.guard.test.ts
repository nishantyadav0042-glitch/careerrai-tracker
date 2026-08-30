import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { applyOnboarding, type OnboardingPayload } from './onboarding-apply';
import { codeOnly } from './test-support/code-only';

/**
 * ── ONE ONBOARDING AUTHORITY, AND BOTH DOORS WALK THROUGH IT ────────────────
 *
 * Founder rule, 29 Aug, stated as non-negotiable: a student answers the /start
 * questions FIRST, then chooses Continue with Google or Continue with OTP, and
 * whichever they pick they must arrive as the same student. Nobody re-answers
 * anything because of which button they pressed.
 *
 * The mapping used to live inline inside verify-phone-otp — ~170 lines that the
 * OTP door ran and the Google door did not. The obvious repair was to copy the
 * block into /auth/callback, which would have fixed the bug that morning and
 * created two sets of business rules that drift the first time one is edited.
 * That is Incident #23's shape, and this file exists so it cannot recur.
 *
 * Comments are stripped before any structural match, so the prose here and in
 * the files under test can neither satisfy nor trip an assertion.
 */

const ROOT = join(__dirname, '..');
const OTP_ROUTE = 'app/api/auth/verify-phone-otp/route.ts';
const GOOGLE_ROUTE = 'app/auth/callback/route.ts';

const read = (rel: string) => codeOnly(readFileSync(join(ROOT, rel), 'utf8'));

/** A Supabase-shaped double that records every write instead of performing one. */
function recordingAdmin() {
  const writes: Array<{ table: string; op: string; values: Record<string, unknown> }> = [];
  const upserts: Array<Record<string, unknown>> = [];
  const admin = {
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          writes.push({ table, op: 'update', values });
          return { eq: async () => ({ error: null }) };
        },
        upsert(rows: Array<Record<string, unknown>>) {
          upserts.push(...rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { admin, writes, upserts };
}

const FULL_DRAFT: OnboardingPayload = {
  ambition_date: '2026-11-29',
  attempt_year: new Date().getFullYear(),
  dream_colleges: ['IIM A', 'IIM B', 'IIM C', 'IIM L'],
  target_percentile: 98,
  self_study_hours: 4,
  coaching_enrolled: true,
  is_repeater: true,
  last_year_percentile: 82.5,
  had_buddy_last_year: false,
  is_working_professional: true,
  pain_points: ['time', 'DILR', 'motivation'],
  wants_mentor: true,
  self_reported_weakest_section: 'DILR',
  self_report_status: 'SELECTED_SECTION',
  topic_matrix: [
    { section: 'QA', topic: 'Percentages', status: 'practicing' },
    { section: 'VARC', topic: 'Reading Comprehension', status: 'not_started' },
  ],
};

// ─── 3. No duplicate profile/application logic exists ───────────────────────

describe('the onboarding mapping exists in exactly one place', () => {
  it('lib/onboarding-apply is the only module that maps draft answers to columns', () => {
    // Anchored on the WRITES, not on the word "onboarding". A second copy is
    // recognisable by the profile columns only this mapping produces.
    const FINGERPRINTS = [
      'syllabus_target_date',
      'last_year_percentile',
      'onboarding_insight_root_cause',
      'self_report_status',
    ];
    // READING these columns is not mapping them — the tracker, the blueprint
    // and the routine all select them to render, and counting those as
    // duplicate authorities would make this guard noise. A mapping WRITES: it
    // has to reach profiles through update/insert/upsert.
    const writers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
        const code = codeOnly(readFileSync(p, 'utf8'));
        const hits = FINGERPRINTS.filter((f) => code.includes(f));
        if (hits.length < 2) continue;
        if (!/from\(\s*['"]profiles['"]\s*\)\s*\.\s*(update|insert|upsert)/.test(code)) continue;
        writers.push(p.replace(`${ROOT}/`, ''));
      }
    };
    walk(ROOT);

    // EXACTLY TWO, pinned rather than allow-listed loosely, so a third fails.
    //
    //   · lib/onboarding-apply.ts       — the PRE-AUTH draft from /start, the
    //                                     subject of this file. Both the OTP
    //                                     and Google doors call it.
    //   · student/onboarding/onboarding-modal.tsx — the POST-LOGIN Blueprint
    //                                     Builder, a different moment: the
    //                                     student already has an account and
    //                                     is answering in-app.
    //
    // The modal is a genuine second place these columns are written, and it
    // predates this work. Folding it into the same authority is real scope —
    // it is a client surface with its own submit path and its own regression
    // surface — so it is recorded here as a KNOWN second writer rather than
    // quietly excluded. What this assertion buys is that no THIRD one appears,
    // and that the pre-auth mapping never gets copied.
    expect(writers.sort(), 'a new place now writes onboarding columns to profiles').toEqual([
      'app/student/onboarding/onboarding-modal.tsx',
      'lib/onboarding-apply.ts',
    ]);
  });

  it('both doors call the authority rather than reimplementing it', () => {
    for (const rel of [OTP_ROUTE, GOOGLE_ROUTE]) {
      const code = read(rel);
      expect(code, `${rel} must import the shared authority`)
        .toMatch(/from\s+['"]@\/lib\/onboarding-apply['"]/);
      expect(code, `${rel} must actually call applyOnboarding`)
        .toMatch(/\bapplyOnboarding\s*\(/);
    }
  });

  it('neither door may apply a draft to a student who finished onboarding', () => {
    // The authority cannot know this — only the caller knows which profile it
    // is holding. Incident #42: a guard in the caller is not a guard in the
    // callee, so the callers are asserted, not trusted.
    const otp = read(OTP_ROUTE);
    expect(otp).toMatch(/if\s*\(\s*\(\s*isStub\s*\|\|\s*!existing\s*\)[\s\S]{0,120}?applyOnboarding/);

    // ── THIS ASSERTION USED TO DEMAND THE BUG ────────────────────────────
    //
    // It required the Google claim to sit inside `if (isNewUser)`, and that
    // branch is unreachable: an auth.users trigger inserts the profile before
    // this route runs, so `existing` is never null for a Google signup. The
    // guard passed for a month while the feature it guarded never executed
    // once — a structural assertion proving only that code is in a place, not
    // that it runs (L2).
    //
    // What it is here to protect is unchanged and is asserted directly: a
    // student who has COMPLETED onboarding must never have a draft applied
    // over their real profile. That is now a condition on the data rather than
    // on a branch, so it cannot be satisfied by an unreachable one.
    const google = read(GOOGLE_ROUTE);
    const at = google.indexOf('claimOnboardingDraft(admin');
    expect(at, 'the Google door no longer claims a draft').toBeGreaterThan(-1);

    const guard = google.slice(Math.max(0, at - 260), at);
    expect(guard,
      'the Google door claims a draft without first checking onboarding_completed — '
      + "a completed student's real profile could be overwritten by a stale funnel answer")
      .toMatch(/onboarding_completed\s*!==\s*true/);
    expect(guard, 'the Google door must only apply a draft to a student')
      .toMatch(/effectiveRole\s*===\s*['"]student['"]/);

    // And the column has to be READ, or the check above is comparing undefined
    // to true and passing for everyone.
    expect(google, 'onboarding_completed is never selected, so the guard reads undefined')
      .toMatch(/\.select\([^)]*onboarding_completed/);
  });

  it('the stash endpoint rejects only when the throttle says BLOCKED', () => {
    // 29 Aug. registerAttemptAndCheck returns TRUE when the caller is over the
    // limit. This route read `if (!ok) return 429`, so it answered 429 to every
    // request from the first one onward and stored zero drafts in its entire
    // life — onboarding_drafts held 0 rows ever. Every student who chose Google
    // lost the answers they had just given and was sent back through them.
    //
    // The inversion is invisible in a green test suite and invisible in the UI
    // (the stash is best-effort by design), so it is pinned here.
    const code = read('app/api/auth/stash-onboarding/route.ts');
    const call = /(const\s+(\w+)\s*=\s*await\s+registerAttemptAndCheck\([\s\S]*?\);)\s*if\s*\((!?)\s*(\w+)\s*\)/
      .exec(code);
    expect(call, 'the stash endpoint no longer throttles at all').not.toBeNull();
    const [, , assigned, negation, tested] = call!;
    expect(tested, 'the throttle result is tested under a different name').toBe(assigned);
    expect(negation,
      'the stash endpoint returns 429 when the throttle says NOT blocked — inverted, '
      + 'which makes the endpoint reject every request from the very first one').toBe('');
  });

  it('parking a draft does not spend the login lockout budget', () => {
    // A /start completion is not a guess at a credential. Counted in the same
    // per-IP pool it was, and on CGNAT — one exit IP for an entire campus or
    // carrier — enough honest funnel traffic would push that IP past the LOGIN
    // lockout and lock real students out of their own accounts.
    const code = read('app/api/auth/stash-onboarding/route.ts');
    expect(code, 'the stash endpoint shares the credential throttle pool')
      .toMatch(/scope:\s*\w+/);

    const throttle = read('lib/attempt-throttle.ts');
    expect(throttle, 'the per-IP count is taken across every scope at once')
      .toMatch(/\.eq\(\s*['"]scope['"]\s*,\s*scope\s*\)[\s\S]{0,80}?\.eq\(\s*['"]ip['"]/);
  });
});

// ─── 1 & 2. Answers survive Google, and both doors produce the same student ──

describe('a Google student and an OTP student are the same student', () => {
  it('applies every whitelisted answer from a full /start draft', async () => {
    const { admin, writes, upserts } = recordingAdmin();
    const result = await applyOnboarding(admin, 'user-1', FULL_DRAFT);

    const profile = writes.find((w) => w.table === 'profiles')!.values;
    expect(profile.syllabus_target_date).toBe('2026-11-29');
    expect(profile.target_percentile).toBe(98);
    expect(profile.coaching_enrolled).toBe(true);
    expect(profile.is_repeater).toBe(true);
    expect(profile.last_year_percentile).toBe(82.5);
    expect(profile.is_working_professional).toBe(true);
    expect(profile.wants_mentor).toBe(true);
    expect(profile.self_reported_weakest_section).toBe('DILR');
    expect(profile.self_report_status).toBe('SELECTED_SECTION');
    // Bounded, not merely copied.
    expect(profile.dream_colleges).toHaveLength(3);
    expect(profile.pain_points).toHaveLength(2);

    expect(upserts).toHaveLength(2);
    expect(result.completed).toBe(true);
  });

  it('produces byte-identical writes whichever door calls it', async () => {
    // The real parity proof. Both routes hand the same payload to the same
    // function, so equality here plus the structural tests above is what makes
    // "Google gives you the same student" a property rather than a hope.
    const a = recordingAdmin();
    const b = recordingAdmin();
    await applyOnboarding(a.admin, 'same-user', FULL_DRAFT);
    await applyOnboarding(b.admin, 'same-user', FULL_DRAFT);

    // Wall-clock stamps are not part of the parity claim, and comparing them
    // makes this test fail whenever the two calls straddle a millisecond. It
    // stripped onboarding_last_activity_at by name and missed
    // study_hours_set_at, which setDailyHours writes — so it went red in CI on
    // 29 Aug for a one-millisecond difference and nothing else. Named fields
    // are a list someone has to remember to extend; the SHAPE cannot be
    // forgotten, so any full ISO-8601 instant is dropped. A plain date
    // (syllabus_target_date) has no T and no Z and stays compared, because
    // "both doors set the same target date" is exactly the claim.
    const isInstant = (x: unknown) =>
      typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(x);
    const strip = (v: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(v).filter(([, val]) => !isInstant(val)));
    expect(a.writes.map((w) => strip(w.values))).toEqual(b.writes.map((w) => strip(w.values)));
    expect(a.upserts.map((r) => r.topic)).toEqual(b.upserts.map((r) => r.topic));
  });
});

// ─── 4. Existing OTP behaviour does not regress ─────────────────────────────

describe('the behaviours the OTP door already had', () => {
  it('rejects a tampered attempt_year instead of writing it', async () => {
    const { admin, writes } = recordingAdmin();
    await applyOnboarding(admin, 'u', { ...FULL_DRAFT, attempt_year: 2099 });
    const profile = writes.find((w) => w.table === 'profiles')!.values;
    expect('attempt_year' in profile).toBe(false);
  });

  it('keeps "not sure yet" as a real answer rather than dropping it', async () => {
    // Keyed on PRESENCE, not truthiness — a truthiness check would silently
    // discard an honest "not sure" and leave the student on a default.
    const { admin, writes } = recordingAdmin();
    await applyOnboarding(admin, 'u', {
      ...FULL_DRAFT,
      self_reported_weakest_section: null,
      self_report_status: 'NOT_SURE_YET',
    });
    const profile = writes.find((w) => w.table === 'profiles')!.values;
    expect(profile.self_reported_weakest_section).toBeNull();
    expect(profile.self_report_status).toBe('NOT_SURE_YET');
  });

  it('does NOT mark onboarding complete when the coverage matrix is rejected', async () => {
    // The 14 July bug: completed was flipped before the matrix was validated,
    // stranding students with onboarding_completed=true and zero coverage rows.
    const { admin, writes } = recordingAdmin();
    const result = await applyOnboarding(admin, 'u', {
      ...FULL_DRAFT,
      topic_matrix: [{ section: 'NOPE', topic: 'x', status: 'wat' }],
    });
    expect(result.completed).toBe(false);
    expect(writes.some((w) => w.values.onboarding_completed === true)).toBe(false);
  });

  it('writes nothing at all for an empty draft', async () => {
    const { admin, writes, upserts } = recordingAdmin();
    const result = await applyOnboarding(admin, 'u', {});
    expect(writes).toEqual([]);
    expect(upserts).toEqual([]);
    expect(result.completed).toBe(false);
  });
});

// ─── 5. Returning from Google does not re-ask the questions ─────────────────

describe('a Google student is not sent back through onboarding', () => {
  it('a complete draft sets onboarding_completed, which is the gate', async () => {
    // The student layout gates on onboarding_completed for ANY /student/* page.
    // If the draft did not set it, a Google student would land in the Blueprint
    // Builder and re-answer the questions they had just finished.
    const { admin, writes } = recordingAdmin();
    await applyOnboarding(admin, 'u', FULL_DRAFT);
    expect(writes.some((w) => w.values.onboarding_completed === true)).toBe(true);
  });
});

// ─── 6. A failed or cancelled Google sign-in must not corrupt the draft ─────

describe('a cancelled or failed Google sign-in', () => {
  it('the stash endpoint never writes to a profile', () => {
    // It runs UNAUTHENTICATED — there is no account yet. If it could touch a
    // profile it would be an anonymous write into student data.
    const code = read('app/api/auth/stash-onboarding/route.ts');
    expect(code).not.toMatch(/from\(\s*['"]profiles['"]\s*\)/);
    expect(code).not.toMatch(/\bapplyOnboarding\s*\(/);
  });

  it('the draft is claimed single-use, so a replayed callback cannot reapply it', () => {
    // Claim and read in ONE statement. A select-then-update would let a
    // refreshed or duplicated callback apply the same answers twice.
    const code = read(GOOGLE_ROUTE);
    expect(code).toMatch(/\.is\(\s*['"]consumed_at['"]\s*,\s*null\s*\)/);
    expect(code).toMatch(/consumed_at:\s*new Date\(\)/);
  });

  it('an abandoned draft is simply never consumed — nothing is destroyed early', () => {
    // The row keeps consumed_at null and the answers stay in localStorage,
    // which the stash never cleared.
    const stash = read('app/api/auth/stash-onboarding/route.ts');
    expect(stash).not.toMatch(/removeItem|localStorage/);
  });

  // ── SUPERSEDES THE OLD "stash before the Google redirect" ORDERING GUARD ──
  //
  // That guard existed because /start sent the browser to accounts.google.com
  // mid-funnel, and the answers had to be parked server-side first or they were
  // lost. Incident #62 removed the detour rather than protecting it: Google
  // could not recognise a returning student on that screen even in principle
  // (963 of 969 students have no email to match on), so the only account it
  // could produce was a second one.
  //
  // The property is now stronger and is asserted as such — there is no redirect
  // to lose the draft TO. Written as a behaviour about the door, not about the
  // order of two calls, so it cannot be satisfied by restoring the button and
  // stashing before it.
  it('/start creates accounts through the phone door only — no OAuth detour to lose answers to', () => {
    const screen = read('app/start/screens/screen-login-build.tsx');
    expect(screen).not.toMatch(/ContinueWithGoogle/);
    expect(screen).not.toMatch(/signInWithOAuth/);
    // The phone door is still there. A screen with NO door is Incident #10.
    expect(screen).toMatch(/verify-phone-otp/);
    expect(screen).toMatch(/request-phone-otp/);
  });
});
