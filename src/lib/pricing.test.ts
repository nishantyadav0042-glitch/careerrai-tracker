import { describe, it, expect } from 'vitest';
import { priceWithScholarship, priceWithCoupon, MIN_CHARGE_PAISE, type ActiveScholarship, type ActiveCoupon } from './pricing';
import { PLANS, isPlanId, type PlanId } from './plans';

// These two functions decide what a student is charged. They were the largest
// untested surface in the codebase: pure, deterministic, money-handling, and
// covered by nothing. Everything below is an arithmetic invariant — a discount
// may never increase a price, may never go negative, and may never silently
// exceed what the founder actually granted.

const scholarship = (over: Partial<ActiveScholarship> = {}): ActiveScholarship =>
  ({ id: 's1', discount_percent: null, final_price_paise: null, ...over });

const coupon = (over: Partial<ActiveCoupon> = {}): ActiveCoupon =>
  ({ id: 'c1', code: 'TEST', discount_type: 'percent', discount_value: 10,
     max_uses: null, used_count: 0, ...over });

const BASE = PLANS.tillcat.offerPaise; // ₹2,599

describe('priceWithScholarship', () => {
  it('applies a percentage discount', () => {
    expect(priceWithScholarship(100_000, scholarship({ discount_percent: 20 }))).toBe(80_000);
  });

  it('honours an explicit final price', () => {
    expect(priceWithScholarship(BASE, scholarship({ final_price_paise: 49_900 }))).toBe(49_900);
  });

  it('never charges MORE than list price, even if the grant says so', () => {
    expect(priceWithScholarship(100_000, scholarship({ final_price_paise: 500_000 }))).toBe(100_000);
  });

  it('prefers the explicit final price over a percentage when both are set', () => {
    const s = scholarship({ discount_percent: 50, final_price_paise: 10_000 });
    expect(priceWithScholarship(100_000, s)).toBe(10_000);
  });

  it('leaves the price untouched when the grant specifies nothing', () => {
    expect(priceWithScholarship(BASE, scholarship())).toBe(BASE);
  });

  it('handles a 100% grant as free, not as a negative charge', () => {
    expect(priceWithScholarship(BASE, scholarship({ discount_percent: 100 }))).toBe(0);
  });

  it('never returns a negative price for any percentage', () => {
    for (const pct of [0, 1, 25, 50, 99, 100]) {
      expect(priceWithScholarship(BASE, scholarship({ discount_percent: pct }))).toBeGreaterThanOrEqual(0);
    }
  });

  it('is monotonic — a bigger discount never costs more', () => {
    let previous = Infinity;
    for (const pct of [0, 10, 25, 50, 75, 100]) {
      const price = priceWithScholarship(BASE, scholarship({ discount_percent: pct }));
      expect(price).toBeLessThanOrEqual(previous);
      previous = price;
    }
  });
});

describe('priceWithCoupon', () => {
  it('applies a percentage coupon', () => {
    expect(priceWithCoupon(100_000, coupon({ discount_type: 'percent', discount_value: 20 }))).toBe(80_000);
  });

  it('applies a flat coupon in paise', () => {
    expect(priceWithCoupon(100_000, coupon({ discount_type: 'flat', discount_value: 25_000 }))).toBe(75_000);
  });

  it('clamps a flat discount larger than the price to zero, never negative', () => {
    expect(priceWithCoupon(100_000, coupon({ discount_type: 'flat', discount_value: 500_000 }))).toBe(0);
  });

  it('never returns a negative price for any input', () => {
    for (const value of [0, 1, 50, 100, 1_000_000]) {
      for (const type of ['percent', 'flat'] as const) {
        const price = priceWithCoupon(BASE, coupon({ discount_type: type, discount_value: value }));
        expect(price).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('never charges more than list price', () => {
    for (const value of [0, 5, 50, 100]) {
      expect(priceWithCoupon(BASE, coupon({ discount_value: value }))).toBeLessThanOrEqual(BASE);
    }
  });

  it('returns whole paise — Razorpay cannot charge a fraction', () => {
    const price = priceWithCoupon(299_900, coupon({ discount_type: 'percent', discount_value: 33 }));
    expect(Number.isInteger(price)).toBe(true);
  });
});

describe('the free-purchase threshold', () => {
  it('is stated as a constant rather than repeated as a magic number', () => {
    expect(MIN_CHARGE_PAISE).toBe(100); // ₹1 — Razorpay's floor
  });

  it('a full discount lands at or below it, so checkout can skip the gateway', () => {
    expect(priceWithScholarship(BASE, scholarship({ discount_percent: 100 }))).toBeLessThanOrEqual(MIN_CHARGE_PAISE);
    expect(priceWithCoupon(BASE, coupon({ discount_type: 'flat', discount_value: BASE }))).toBeLessThanOrEqual(MIN_CHARGE_PAISE);
  });
});

describe('the plan catalogue is the single source of truth for price', () => {
  it('prices every plan in whole paise above the gateway floor', () => {
    for (const id of Object.keys(PLANS) as PlanId[]) {
      const plan = PLANS[id];
      expect(Number.isInteger(plan.offerPaise)).toBe(true);
      expect(plan.offerPaise).toBeGreaterThan(MIN_CHARGE_PAISE);
      expect(plan.months).toBeGreaterThan(0);
    }
  });

  it('keeps every display string consistent with its own amount', () => {
    for (const id of Object.keys(PLANS) as PlanId[]) {
      const plan = PLANS[id];
      const rupees = plan.offerPaise / 100;
      const digitsInDisplay = plan.display.replace(/[^0-9]/g, '');
      expect(digitsInDisplay).toBe(String(rupees));
    }
  });

  it('recognises exactly the plans it defines', () => {
    for (const id of Object.keys(PLANS)) expect(isPlanId(id)).toBe(true);
    expect(isPlanId('lifetime')).toBe(false);
    expect(isPlanId('')).toBe(false);
  });

  it('marks exactly one plan as recommended', () => {
    const recommended = Object.values(PLANS).filter((p) => p.recommended);
    expect(recommended).toHaveLength(1);
  });
});
