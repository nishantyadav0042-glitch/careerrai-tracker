import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── A mentor is assigned on the VERIFIED phone, never the editable copy ─────
//
// admin/allowlist used `.eq('phone', …)` against profiles, and profiles.phone
// is a column students edit in onboarding. So the assignment read a value the
// student controls rather than the number they proved they own with an OTP. A
// student who set their phone to match a pending allowlist entry would collect
// that entry's mentor -- and resolvePair() grants chat access on buddy_id
// alone, so that is unpaid access to a real person's time.
//
// NOT THEORETICAL: 36 students already have a profiles.phone that disagrees
// with their auth.users.phone, 32 of them after finishing onboarding.
//
// Locking the field was rejected: 4 students signed up without a verified
// phone and 2 gave theirs through exactly that onboarding input. Matching the
// verified number closes the hole and leaves onboarding alone.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ROUTE = 'src/app/api/admin/allowlist/route.ts';
const MIGRATION = 'supabase/migrations/20260819f_assignment_matches_verified_phone.sql';
const statements = () =>
  read(MIGRATION).split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

describe('the allowlist never assigns on a student-editable value', () => {
  it('no buddy_id update matches on profiles.phone', () => {
    const s = read(ROUTE);
    for (const m of s.matchAll(/update\(\{\s*buddy_id[\s\S]{0,120}?\)/g)) {
      expect(m[0], 'assignment must not key on the editable phone')
        .not.toMatch(/\.eq\('phone'/);
    }
  });

  it('both assignment sites resolve the verified phone first', () => {
    const s = read(ROUTE);
    const calls = [...s.matchAll(/profile_id_for_verified_phone/g)];
    expect(calls.length, 'POST and PATCH both assign').toBe(2);
  });

  it('both assign by id, and only when a verified account was found', () => {
    const s = read(ROUTE);
    const guarded = [...s.matchAll(/if \(verifiedId\) \{[\s\S]{0,220}?\.eq\('id', verifiedId\)/g)];
    expect(guarded.length, 'an unresolvable phone must assign nobody').toBe(2);
  });
});

describe('the resolver reads the verified number only', () => {
  it('reads auth.users, not profiles', () => {
    const s = statements();
    expect(s).toMatch(/FROM auth\.users/);
    expect(s, 'profiles.phone is the value being distrusted').not.toMatch(/FROM public\.profiles|FROM profiles/);
  });

  it('normalises both sides — the two columns store different formats', () => {
    // auth.users.phone is '917389513308'; profiles.phone is '+917440964764'.
    const s = statements();
    expect(s).toMatch(/regexp_replace\(u\.phone, '\\D', '', 'g'\)/);
    expect(s).toMatch(/regexp_replace\(coalesce\(p_phone, ''\), '\\D', '', 'g'\)/);
  });

  it('an empty or junk phone resolves to nobody', () => {
    expect(statements(), 'stripping must not turn "" into a match')
      .toMatch(/regexp_replace\(coalesce\(p_phone, ''\), '\\D', '', 'g'\) <> ''/);
  });

  it('is server-only — it must not become a phone-number lookup for clients', () => {
    const s = statements();
    expect(s).toMatch(/REVOKE ALL ON FUNCTION public\.profile_id_for_verified_phone\(text\) FROM public, anon, authenticated/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.profile_id_for_verified_phone\(text\) TO service_role/);
  });

  it('is read-only', () => {
    const s = statements();
    expect(s).toMatch(/\bSTABLE\b/);
    expect(s).not.toMatch(/UPDATE |INSERT |DELETE FROM|ALTER TABLE/i);
  });
});

describe('scope containment', () => {
  // ── SUPERSEDED BY THE ANCHOR GATE (Incident #62) ────────────────────────
  //
  // This used to assert that onboarding still had an EDITABLE phone input,
  // because students who came in through the email door had no other way to
  // supply a number. That input turned out to be a client write straight into
  // profiles.phone: it put 92 bare 10-digit numbers over the verified E.164
  // ones, and let anyone point the column the sales team calls at a number they
  // do not hold.
  //
  // The population it protected is now served properly — an account with no
  // verified phone is stopped at /auth/link-phone and gets a real OTP
  // round-trip. So the guard is inverted rather than deleted: onboarding must
  // NOT be able to set a phone, and the two verified routes must be the only
  // writers.
  it('onboarding displays the phone and cannot set it', () => {
    const screen = read('src/app/student/onboarding/screens/screen-about-you.tsx');
    expect(screen).not.toMatch(/onChange=\{\(e\) => setPhone\(e\.target\.value\)\}/);
    expect(screen).not.toMatch(/type="tel"/);
    const modal = read('src/app/student/onboarding/onboarding-modal.tsx');
    expect(modal, 'onboarding writes profiles.phone again').not.toMatch(/\bay\.phone\s*=/);
  });

  // ── THIS GUARD HAD THE HOLE THE BUG WALKED THROUGH ──────────────────────
  //
  // It required phone_verified_at on link-phone/verify ONLY, and said nothing
  // about verify-phone-otp — the PRIMARY signup verifier. So the anchor column
  // shipped with the gate reading it and the main door never writing it, and
  // every phone-OTP signup after deploy was created unanchored and bounced
  // straight into /auth/link-phone. A real student (14:15, 30 Aug) hit it
  // before the founder did.
  //
  // Both writers are now asserted, and the list is the assertion: adding a
  // third verifier without stamping the anchor fails here.
  it('EVERY completed OTP round-trip stamps the anchor', () => {
    const writers = [
      'src/app/api/auth/verify-phone-otp/route.ts',
      'src/app/api/auth/link-phone/verify/route.ts',
    ];
    for (const w of writers) {
      const code = read(w);
      expect(code, `${w} does not verify an OTP`).toMatch(/verifyOtp\(/);
      expect(code, `${w} verifies an OTP but never stamps phone_verified_at — a student who passes it stays gated`)
        .toMatch(/phone_verified_at:/);
    }
  });

  // The signup route writes the profile on three different branches (fresh
  // upsert, trigger-stub update, returning user). The bug was not "the column
  // was forgotten" but "it was forgotten on the paths that matter", so pin the
  // count: every branch that writes `phone:` must write the anchor too.
  it('the signup route stamps the anchor on every branch that writes a phone', () => {
    const code = read('src/app/api/auth/verify-phone-otp/route.ts');
    // Scoped to the PROFILE writes only. A blunt count over the whole file is
    // wrong and was: `phone: e164` also appears in the verifyOtp() call and in
    // the Meta CAPI payload, neither of which is a profile row.
    const blocks = code.split(/\.from\(\s*['"]profiles['"]\s*\)/).slice(1);
    const phoneBlocks = blocks.filter((b) => /phone: e164,/.test(b.slice(0, 1200)));
    expect(phoneBlocks.length, 'no profiles write sets the phone — has the route changed shape?')
      .toBeGreaterThanOrEqual(3);
    for (const [n, b] of phoneBlocks.entries()) {
      expect(/phone_verified_at:/.test(b.slice(0, 1200)),
        `profiles write #${n + 1} sets phone but not phone_verified_at — a student verified through it stays gated`)
        .toBe(true);
    }
  });

  it('bulk-import already assigned by id and is untouched', () => {
    expect(read('src/app/api/admin/bulk-import/route.ts'))
      .toMatch(/update\(\{ buddy_id: buddyId \}\)\s*\n?\s*\.eq\('id', studentData\.id\)/);
  });

  it('no historical row is rewritten', () => {
    expect(statements()).not.toMatch(/UPDATE public\.profiles/i);
  });
});
