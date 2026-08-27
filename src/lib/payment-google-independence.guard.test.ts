import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── A STUDENT WITHOUT GOOGLE MUST BE ABLE TO PAY ────────────────────────────
 *
 * Founder rule, 27 Aug, stated as non-negotiable: Google must never enter the
 * payment funnel. No OAuth before Razorpay, none during it, no block because a
 * student has not connected, no consent screen between "Pay" and confirmation.
 *
 * This is a STRUCTURAL guard rather than a behaviour test, and deliberately so.
 * A behaviour test proves that today's checkout does not call Google. It says
 * nothing about the checkout someone writes next month, which is exactly how a
 * funnel acquires a dependency: not by anyone deciding to add one, but by a
 * convenience import that looks harmless in review.
 *
 * The rule is therefore expressed as a BOUNDARY. Every file that can run
 * during a payment is listed, and none of them may reach Google by any route —
 * not the OAuth helpers, not the connect endpoints, not Supabase's OAuth
 * entry point. If a future change needs one of these files to touch Google,
 * this test fails and forces the conversation.
 *
 * Comments are stripped before matching, so the prose above cannot satisfy or
 * trip any assertion below.
 */

const ROOT = join(__dirname, '..');

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every file the money actually flows through. */
const PAYMENT_CHAIN = [
  'app/api/payments/create-order/route.ts',
  'app/api/payments/callback/route.ts',
  'app/api/payments/webhook/route.ts',
  'lib/activate-payment.ts',
  'lib/payment-return.ts',
];

/**
 * Ways a file could reach Google. `signInWithOAuth` is included because the
 * student-side Google button uses Supabase rather than /api/google/*, so
 * banning only the latter would leave the easier mistake available.
 */
const GOOGLE_REACHES = [
  /from\s+['"]@\/lib\/google-oauth['"]/,
  /from\s+['"]@\/lib\/google-meet['"]/,
  /from\s+['"]@\/lib\/buddy-room['"]/,
  /\/api\/google\//,
  /\bsignInWithOAuth\s*\(/,
  /\bgoogleConsentUrl\s*\(/,
  /\bgoogleConfigured\s*\(/,
  /\bContinueWithGoogle\b/,
  /\bPostPaymentGoogle\b/,
];

describe('the payment funnel cannot reach Google', () => {
  it.each(PAYMENT_CHAIN)('%s exists — the chain is being checked, not skipped', (rel) => {
    // Without this, renaming a route would silently empty the guard and it
    // would go on passing over a funnel nobody was inspecting.
    expect(existsSync(join(ROOT, rel)), `${rel} moved — update this guard`).toBe(true);
  });

  it.each(PAYMENT_CHAIN)('%s has no path to Google', (rel) => {
    const code = codeOnly(readFileSync(join(ROOT, rel), 'utf8'));
    for (const reach of GOOGLE_REACHES) {
      expect(
        reach.test(code),
        `${rel} reaches Google via ${reach} — a student who has not connected ` +
          'Google would be blocked from paying, or asked for consent mid-checkout',
      ).toBe(false);
    }
  });

  it('nothing in the funnel makes the credit conditional on Google', () => {
    // The subtler failure: not an import, but a rule. A credit that is only
    // written when some Google fact is true is a payment blocked by Google
    // even though no OAuth call appears anywhere.
    const activate = codeOnly(readFileSync(join(ROOT, 'lib/activate-payment.ts'), 'utf8'));
    expect(/google/i.test(activate),
      'activate-payment mentions Google — the ₹299 credit must not depend on it',
    ).toBe(false);
  });

  it('the post-payment offer is reachable ONLY after a verified payment', () => {
    // The card exists, and its one mount is gated on ?pay=paid, which the
    // Razorpay callback appends after verification. Ordering enforced by
    // construction: there is no render path that reaches it earlier.
    const page = codeOnly(readFileSync(join(ROOT, 'app/student/buddy/page.tsx'), 'utf8'));
    expect(page).toMatch(/PostPaymentGoogle/);
    expect(page, 'the Google offer must be gated on the paid flag')
      .toMatch(/justPaid\s*&&\s*<PostPaymentGoogle/);
    expect(page, "justPaid must come from the callback's ?pay=paid")
      .toMatch(/pay\s*===\s*['"]paid['"]/);
  });

  it('no OTHER component renders the post-payment Google card', () => {
    // One mount, one gate. A second mount somewhere ungated would reopen the
    // exact ordering this rule exists to fix.
    const mounts: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const c = codeOnly(readFileSync(p, 'utf8'));
          if (/<PostPaymentGoogle\b/.test(c)) mounts.push(p.replace(`${ROOT}/`, ''));
        }
      }
    };
    walk(ROOT);
    expect(mounts).toEqual(['app/student/buddy/page.tsx']);
  });
});
