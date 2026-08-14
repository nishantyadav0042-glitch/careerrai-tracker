import { describe, it, expect } from 'vitest';
import { splitTax, netToPlatformPaise, taxLine, GST_RATE, GST_ENABLED } from './gst';
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

describe('WE ARE NOT REGISTERED, SO WE DO NOT COLLECT', () => {
  it('the switch is off', () => {
    // Registration is generally required only above ~₹20 lakh turnover;
    // CareerRai is at ₹5,996 lifetime. Collecting tax you are not registered
    // to collect is worse than not charging it.
    expect(GST_ENABLED).toBe(false);
  });

  it('every published price is charged EXACTLY as published', () => {
    for (const p of [...Object.values(PLANS).map((x) => x.amountPaise), SESSION_PRICE_PAISE]) {
      for (const mode of ['inclusive', 'exclusive'] as const) {
        expect(splitTax(p, mode).grossPaise, `${p} ${mode}`).toBe(p);
      }
    }
  });

  it('the ₹299 session costs ₹299 — nothing added, nothing carved out', () => {
    const t = splitTax(SESSION_PRICE_PAISE, 'exclusive');
    expect(t.grossPaise).toBe(29900);
    expect(t.gstPaise).toBe(0);
    // And the mentor still receives the whole ₹299, which was the point.
    expect(t.basePaise).toBe(29900);
    expect(netToPlatformPaise(t, 29900)).toBe(0);
  });

  it('no tax is ever collected while the switch is off', () => {
    for (const p of [100, 29900, 99900, 299900]) {
      for (const mode of ['inclusive', 'exclusive'] as const) {
        expect(splitTax(p, mode).gstPaise).toBe(0);
      }
    }
  });

  it('the checkout NEVER prints a tax line we are not entitled to add', () => {
    // "incl. GST" while unregistered is a false statement on the most
    // scrutinised line of the checkout.
    for (const mode of ['inclusive', 'exclusive'] as const) {
      const line = taxLine(splitTax(29900, mode));
      expect(line).not.toMatch(/GST/i);
    }
    expect(taxLine(splitTax(29900, 'exclusive'))).toBe('₹299');
  });
});

describe('the rate stays declared, ready for registration day', () => {
  it('18%, in one place, so switching on is one flag', () => {
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
