import { describe, it, expect } from 'vitest';
import { splitTax, netToPlatformPaise, taxLine, GST_RATE } from './gst';
import { SESSION_PRICE_PAISE } from './session-credit';
import { PLANS } from './plans';

// Tax arithmetic is the kind of code that is wrong quietly for months and
// then expensively all at once, at filing time. Every case below is a real
// number this business will actually charge.

describe('the split always balances', () => {
  it('base + gst equals gross, for every plan, both ways', () => {
    const prices = [...Object.values(PLANS).map((p) => p.amountPaise), SESSION_PRICE_PAISE, 100, 1, 0];
    for (const p of prices) {
      for (const mode of ['inclusive', 'exclusive'] as const) {
        const t = splitTax(p, mode);
        expect(t.basePaise + t.gstPaise, `${p} ${mode}`).toBe(t.grossPaise);
      }
    }
  });

  it('never produces a negative or fractional paise', () => {
    for (const p of [0, 1, 7, 99, 29900, 299900]) {
      for (const mode of ['inclusive', 'exclusive'] as const) {
        const t = splitTax(p, mode);
        expect(Number.isInteger(t.gstPaise)).toBe(true);
        expect(Number.isInteger(t.basePaise)).toBe(true);
        expect(t.gstPaise).toBeGreaterThanOrEqual(0);
        expect(t.basePaise).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('a negative input cannot produce a charge', () => {
    expect(splitTax(-500, 'exclusive').grossPaise).toBe(0);
  });
});

describe('subscriptions are INCLUSIVE — the published price does not move', () => {
  it('₹2,999 Till CAT stays ₹2,999 at checkout', () => {
    const t = splitTax(PLANS.tillcat.amountPaise, 'inclusive');
    expect(t.grossPaise).toBe(299900);
    // Carved out, not added on: base 2541.53 -> 254153 paise, GST 45747.
    expect(t.basePaise).toBe(254153);
    expect(t.gstPaise).toBe(45747);
  });

  it('₹999 monthly stays ₹999', () => {
    const t = splitTax(PLANS.monthly.amountPaise, 'inclusive');
    expect(t.grossPaise).toBe(99900);
    expect(t.basePaise + t.gstPaise).toBe(99900);
  });

  it('no published price is silently increased by adding GST on top', () => {
    // 77% of our checkouts are already abandoned; a ₹540 surprise between the
    // button and the bank would make that worse and invalidate every price we
    // have published, including the sales script.
    for (const plan of Object.values(PLANS)) {
      expect(splitTax(plan.amountPaise, 'inclusive').grossPaise).toBe(plan.amountPaise);
    }
  });
});

describe('the session is EXCLUSIVE, because the mentor must receive ₹299', () => {
  const t = splitTax(SESSION_PRICE_PAISE, 'exclusive');

  it('the student pays ₹352.82 and the mentor keeps a full ₹299', () => {
    expect(t.basePaise).toBe(29900);
    expect(t.grossPaise).toBe(35282);
    expect(t.gstPaise).toBe(5382);
  });

  it('if it were inclusive the mentor would be short-paid — which is why it is not', () => {
    const wrong = splitTax(SESSION_PRICE_PAISE, 'inclusive');
    expect(wrong.basePaise).toBeLessThan(29900);
  });

  it('CareerRai keeps NOTHING from a session at this payout', () => {
    // Recorded deliberately. The entire base is the mentor's and the GST is
    // the government's, so the gateway fee comes out of our pocket. Defensible
    // while the session's job is conversion — but never an accident.
    expect(netToPlatformPaise(t, 29900)).toBe(0);
  });
});

describe('the student can always read what they are paying', () => {
  it('inclusive says so', () => {
    expect(taxLine(splitTax(299900, 'inclusive'))).toContain('incl. 18% GST');
  });

  it('exclusive shows the addition rather than surprising them', () => {
    expect(taxLine(splitTax(29900, 'exclusive'))).toBe('₹299 + 18% GST = ₹352.82');
  });
});

describe('the rate is one constant', () => {
  it('18%, declared once', () => {
    expect(GST_RATE).toBe(0.18);
  });
});

describe('the money path charges the gross and stores the split', () => {
  const src = () => require('node:fs').readFileSync('src/app/api/payments/create-order/route.ts', 'utf8');

  it('Razorpay is charged the GROSS, not the pre-tax figure', () => {
    expect(src()).toContain('createRazorpayOrder(\n      tax.grossPaise,');
  });

  it('the split is persisted, never left to be recomputed at filing time', () => {
    const s = src();
    expect(s).toContain('base_paise: tax.basePaise');
    expect(s).toContain('gst_paise: tax.gstPaise');
    expect(s).toContain('gst_rate: tax.rate');
    expect(s).toContain('tax_mode: tax.mode');
  });

  it('the stored amount equals what we charged, so reconciliation matches', () => {
    expect(src()).toContain('amount: tax.grossPaise');
  });

  it('the pending-order reuse lookup compares the CHARGED amount', () => {
    // Comparing against the pre-tax figure would never match an exclusive
    // plan's row, so every session checkout would mint a fresh Razorpay order.
    expect(src()).toContain("eq('amount', taxForPlan(plan, price.finalPaise).grossPaise)");
  });
});
