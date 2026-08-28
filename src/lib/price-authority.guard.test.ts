import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PLANS, SESSION_PRICING, ALL_PRODUCTS } from './plans';
import { SESSION_PRICE_PAISE, SESSION_MRP_PAISE } from './session-credit';

// ── ONE PRICING AUTHORITY, PROVEN ───────────────────────────────────────────
//
// Founder rule: displayed price === checkout price === Razorpay order amount,
// for all three products, everywhere. CareerRai sells exactly three things and
// lib/plans.ts is the only file allowed to say what any of them costs.
//
// The checkout half was already safe and stays that way: the browser sends a
// PLAN ID, never an amount, and the server resolves the price itself. The
// standing risk is DISPLAY — ₹ literals in JSX drift the moment a price changes
// and someone misses a surface. So this guard walks every purchase surface and
// rejects any rupee literal the authority cannot produce, and separately
// rejects every retired price anywhere in active code.
//
// PRICING, 27 Aug 2026 (founder):
//   Single session  ₹499 → ₹399
//   Monthly         ₹1,299 → ₹999
//   Till CAT day    ₹3,999 → ₹2,599

const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

/** Everything the authority can legitimately put on a surface. */
const ALLOWED = new Set<string>([
  ...ALL_PRODUCTS.map((p) => p.display),
  ...ALL_PRODUCTS.map((p) => p.listDisplay).filter((d): d is string => !!d),
  // Comparison anchors, each computed from the authority rather than typed.
  inr(PLANS.monthly.offerPaise * PLANS.tillcat.months),                          // months-vs-Till-CAT
  inr(PLANS.monthly.offerPaise * PLANS.tillcat.months - PLANS.tillcat.offerPaise), // the saving
  inr(Math.round(PLANS.tillcat.offerPaise / (PLANS.tillcat.months * 30) / 100) * 100), // ≈ per day
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

/**
 * Prices this product has charged in the past and must never charge again.
 * Historical rows in student_payments legitimately hold these numbers — that is
 * a financial record, not pricing. No ACTIVE code may state them.
 */
const RETIRED = ['₹299', '₹2,999', '₹2,499', '₹4,499', '₹1,999', '₹599', '₹799'];

/** Walk src/, skipping tests — tests may reference historical amounts. */
function activeSourceFiles(dir = 'src'): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...activeSourceFiles(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe('the authority states exactly what the founder ruled', () => {
  it('all three products, offer and list', () => {
    expect(SESSION_PRICING.offerPaise).toBe(39900);
    expect(SESSION_PRICING.listPaise).toBe(49900);
    expect(PLANS.monthly.offerPaise).toBe(99900);
    expect(PLANS.monthly.listPaise).toBe(129900);
    expect(PLANS.tillcat.offerPaise).toBe(259900);
    expect(PLANS.tillcat.listPaise).toBe(399900);
  });

  it('and their display strings agree with their paise', () => {
    for (const p of ALL_PRODUCTS) {
      expect(p.display, `${p.id} display disagrees with offerPaise`).toBe(inr(p.offerPaise));
      if (p.listPaise != null) {
        expect(p.listDisplay, `${p.id} listDisplay disagrees with listPaise`).toBe(inr(p.listPaise));
      }
    }
  });

  it('CareerRai sells exactly three things', () => {
    // quarterly, half-year and the campaign price are gone. Production had zero
    // payments and zero subscribers on the first two, and the campaign expired.
    expect(Object.keys(PLANS).sort()).toEqual(['monthly', 'tillcat']);
    expect(ALL_PRODUCTS).toHaveLength(3);
  });

  it('a list price is always ABOVE the price charged', () => {
    // A struck-through number that is lower than the real one is not an anchor,
    // it is a lie with a line through it.
    for (const p of ALL_PRODUCTS) {
      if (p.listPaise != null) expect(p.listPaise).toBeGreaterThan(p.offerPaise);
    }
  });
});

describe('there is only one authority, and everything derives from it', () => {
  it('session-credit re-exports rather than redefines', () => {
    expect(SESSION_PRICE_PAISE).toBe(SESSION_PRICING.offerPaise);
    expect(SESSION_MRP_PAISE).toBe(SESSION_PRICING.listPaise);
    const src = readFileSync('src/lib/session-credit.ts', 'utf8');
    expect(src, 'session-credit must not hard-code a rupee amount')
      .toMatch(/SESSION_PRICE_PAISE = SESSION_PRICING\.offerPaise/);
  });

  it('no active file outside the authority hard-codes a product price in paise', () => {
    const paise = ALL_PRODUCTS.flatMap((p) => [String(p.offerPaise), String(p.listPaise ?? '')]).filter(Boolean);
    for (const file of activeSourceFiles()) {
      if (file === join('src', 'lib', 'plans.ts')) continue;
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const v of paise) {
        expect(code.includes(v), `${file} hard-codes ${v} — import it from lib/plans instead`).toBe(false);
      }
    }
  });

  it('the retired campaign is gone, not merely switched off', () => {
    for (const p of ['src/lib/campaign.ts', 'src/app/offer/page.tsx', 'src/app/api/campaign/route.ts']) {
      expect(existsSync(p), `${p} still exists — it carried the retired ₹2,499`).toBe(false);
    }
  });
});

describe('no surface shows a price the authority cannot produce', () => {
  it.each(SURFACES)('%s', (file) => {
    const literals = readFileSync(file, 'utf8').match(/₹[\d,]+/g) ?? [];
    for (const lit of literals) {
      expect(ALLOWED.has(lit), `${file} shows ${lit}, which no canonical price produces`).toBe(true);
    }
  });

  it('and no active file anywhere still states a RETIRED price', () => {
    // The wide net. Surfaces above are the ones a student buys from; this
    // catches the copy nobody remembers — a push template, an admin hint, a
    // comment that will be read as truth by the next person.
    const offenders: string[] = [];
    for (const file of activeSourceFiles()) {
      const text = readFileSync(file, 'utf8');
      for (const old of RETIRED) {
        if (text.includes(old)) offenders.push(`${file} → ${old}`);
      }
    }
    expect(offenders, `retired prices still present:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});

describe('checkout never trusts the browser', () => {
  it('create-order takes a plan id, never an amount', () => {
    const order = readFileSync('src/app/api/payments/create-order/route.ts', 'utf8');
    expect(order).toMatch(/\{ plan\?: string; coupon\?: string \}/);
    expect(order).not.toMatch(/body\.(amount|price|paise)/);
    expect(order, 'the amount must come from resolvePrice').toMatch(/resolvePrice\(/);
  });

  it('session booking prices itself from the constant', () => {
    const book = readFileSync('src/app/api/sessions/book/route.ts', 'utf8');
    expect(book).toMatch(/finding_kind\?: string/);
    expect(book).not.toMatch(/body\.(amount|price|paise)/);
    expect(book).toMatch(/SESSION_PRICE_PAISE/);
  });

  it('resolvePrice reads the authority and nothing else', () => {
    // Comments stripped first: pricing.ts explains in prose why listPaise stays
    // out of the money path, and a guard that reads its own explanation as a
    // violation is the six-times-bitten mistake this repo already knows.
    const pricing = readFileSync('src/lib/pricing.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(pricing).toMatch(/PLANS\[planId\]\.offerPaise/);
    expect(pricing, 'a list price must never reach a charge').not.toMatch(/listPaise/);
  });
});
