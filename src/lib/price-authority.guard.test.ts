import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLANS } from './plans';
import { SESSION_PRICE_PAISE } from './session-credit';

// ── Phase 2 of the pricing ladder: one price authority ─────────────────────
//
// Founder rule (20 Aug): displayed price === checkout price === Razorpay
// order amount, for all three products. The checkout side is already a
// single authority (PLANS.amountPaise via resolvePrice; SESSION_PRICE_PAISE
// via /api/sessions/book — the server never reads a client-supplied price).
// The remaining drift risk is DISPLAY: student-facing surfaces carry ₹
// literals in JSX. This guard walks every purchase surface and rejects any
// rupee literal that the canonical constants cannot produce — so a price
// change that forgets a surface, or a surface that invents a price, fails
// the build instead of lying to a student.

const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

// Everything the canonical definitions can legitimately produce on a surface.
const ALLOWED = new Set<string>([
  ...Object.values(PLANS).map((p) => p.display),
  inr(SESSION_PRICE_PAISE),                                   // ₹299
  inr(PLANS.monthly.amountPaise * PLANS.tillcat.months),      // ₹3,996 — the till-CAT comparison anchor
  inr(PLANS.monthly.amountPaise * PLANS.tillcat.months - PLANS.tillcat.amountPaise), // ₹997 saving
  inr(Math.round(PLANS.tillcat.amountPaise / (PLANS.tillcat.months * 30) / 100) * 100), // ~₹25/day
]);

const SURFACES = [
  'src/components/unlock-buddy-sheet.tsx',
  'src/components/membership-card.tsx',
  'src/components/daily-buddy-nudge.tsx',
  'src/components/buddy/buddy-conversion-screen.tsx',
  'src/components/buddy/book-session-card.tsx',
  'src/components/buddy/buddy-intervention-card.tsx',
  'src/components/buddy-first-login-guide.tsx',
  'src/app/student/onboarding/screens/screen-repeater-buddy-pitch.tsx',
  'src/app/student/onboarding/onboarding-modal.tsx',
  'src/app/student/layout.tsx',
  'src/app/student/buddy/page.tsx',
];

describe('every displayed price derives from the canonical product definitions', () => {
  it.each(SURFACES)('%s shows no price the constants cannot produce', (file) => {
    const literals = readFileSync(file, 'utf8').match(/₹[\d,]+/g) ?? [];
    for (const lit of literals) {
      expect(ALLOWED.has(lit), `${file} shows ${lit}, which no canonical constant produces`).toBe(true);
    }
  });

  it('the canonical numbers are what the founder ruled', () => {
    expect(inr(SESSION_PRICE_PAISE)).toBe('₹299');      // entry
    expect(PLANS.monthly.display).toBe('₹999');          // core upsell (monthly — founder, 20 Aug)
    expect(PLANS.tillcat.display).toBe('₹2,999');        // higher-value Till-CAT
  });

  it('checkout never reads a client-supplied amount', () => {
    // create-order: body carries only { plan, coupon }; price comes from
    // resolvePrice. book: body carries only the finding; price is the constant.
    const order = readFileSync('src/app/api/payments/create-order/route.ts', 'utf8');
    expect(order).toMatch(/\{ plan\?: string; coupon\?: string \}/);
    expect(order).not.toMatch(/body\.(amount|price|paise)/);
    const book = readFileSync('src/app/api/sessions/book/route.ts', 'utf8');
    expect(book).toMatch(/finding_kind\?: string/);
    expect(book).not.toMatch(/body\.(amount|price|paise)/);
  });
});
