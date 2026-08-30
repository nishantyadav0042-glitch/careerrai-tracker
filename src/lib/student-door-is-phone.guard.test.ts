import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── THE STUDENT DOOR IS A PHONE NUMBER ──────────────────────────────────────
//
// Founder, 30 Aug: phone OTP is the primary student journey, as it was before
// 28 Aug. Google is not a student sign-in. It keeps exactly two homes, both
// asserted below to still exist:
//
//   · the MENTOR calendar connection — what makes Meet links and invites work;
//   · the PREMIUM moment — offered to a student who has already paid.
//
// This guard exists because the button came back once already. It was removed
// from /start in the morning and was still live on /login in the afternoon,
// which is what the founder was looking at when they said the primary door was
// still Google. A rule that lives in a commit message gets re-added; a rule
// with a test does not.

const ROOT = join(process.cwd(), 'src');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** Comments describe the rule and must not be mistaken for breaking it. */
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/** Every surface a student can reach BEFORE they have an account. */
const STUDENT_DOORS = [
  'app/login/page.tsx',
  'app/start/screens/screen-login-build.tsx',
  'app/student/onboarding/onboarding-modal.tsx',
  'app/student/onboarding/screens/screen-about-you.tsx',
];

/** Ways a file could put a Google sign-in in front of a student. */
const GOOGLE_DOOR = [
  /\bContinueWithGoogle\b/,
  /\bsignInWithOAuth\s*\(/,
  /accounts\.google\.com/,
];

describe('a student signs up and logs in with a phone number', () => {
  it.each(STUDENT_DOORS)('%s exists — the guard is checking a real file', (rel) => {
    // Without this, renaming a screen silently empties the guard and it goes on
    // passing over a door nobody is inspecting.
    expect(existsSync(join(ROOT, rel)), `${rel} moved — update this guard`).toBe(true);
  });

  it.each(STUDENT_DOORS)('%s offers no Google door', (rel) => {
    const code = codeOnly(read(rel));
    for (const door of GOOGLE_DOOR) {
      expect(
        door.test(code),
        `${rel} puts a Google sign-in in front of a student (${door}). Google cannot ` +
          'recognise a returning phone student, so the only account it can make is a second one.',
      ).toBe(false);
    }
  });

  it('the phone door is actually there — a screen with no door is Incident #10', () => {
    const start = read('app/start/screens/screen-login-build.tsx');
    expect(start).toMatch(/request-phone-otp/);
    expect(start).toMatch(/verify-phone-otp/);
    const login = read('app/login/page.tsx');
    expect(login, '/login lost its OTP path').toMatch(/otp-phone|request-phone-otp/);
  });
});

describe('Google keeps the two homes it earns', () => {
  it('the MENTOR calendar connection is untouched', () => {
    const connect = read('components/buddy/google-connect.tsx');
    expect(connect).toMatch(/\/api\/google\/connect/);
  });

  it('the PREMIUM offer is untouched, and still cannot appear before the money', () => {
    const post = read('components/student/post-payment-google.tsx');
    expect(post).toMatch(/signInWithOAuth/);
    // It renders only where the paid flag is read. If this ever moves earlier,
    // the payment funnel starts depending on Google — the 27 Aug rule.
    const buddyPage = read('app/student/buddy/page.tsx');
    expect(buddyPage).toMatch(/justPaid\s*&&\s*<PostPaymentGoogle/);
  });
});
