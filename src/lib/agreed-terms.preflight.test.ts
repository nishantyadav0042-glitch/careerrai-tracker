import { describe, it, expect } from 'vitest';
import { checkEmploymentStatement, PART_TIME_REQUIRED_FIELDS } from '@/lib/sales-rep-provisioning';
import { readTerms, computePayslip, incentiveForPaise } from '@/lib/sales-earnings';

// Anshul and Neelam's agreed terms, exactly as they will be typed into the
// hire form: ₹8,000 fixed, 10%, 17:00–22:00, six days, Tuesday off.
const ANSHUL = {
  employment_type: 'part_time',
  work_days: [1, 3, 4, 5, 6, 7],
  work_start_ist: '17:00', work_end_ist: '22:00',
  max_capacity_units: 40, max_new_per_day: 8,
  monthly_fixed_paise: 800_000,   // ₹8,000 — the form multiplies rupees by 100
  incentive_percent: 10,
};

describe('the agreed terms are accepted end to end', () => {
  it('the statement check passes with nothing missing', () => {
    expect(checkEmploymentStatement(ANSHUL, null)).toEqual({ ok: true });
  });
  it('every required field is present in what the form sends', () => {
    for (const f of PART_TIME_REQUIRED_FIELDS) {
      expect((ANSHUL as Record<string, unknown>)[f], `${f} missing`).toBeDefined();
    }
  });
  it('₹8,000 is inside the stored bound (0 … ₹1,000,000)', () => {
    expect(ANSHUL.monthly_fixed_paise).toBeGreaterThanOrEqual(0);
    expect(ANSHUL.monthly_fixed_paise).toBeLessThanOrEqual(100_000_000);
  });
  it('the terms read back as STATED, at ₹8,000 and 10%', () => {
    expect(readTerms({ monthly_fixed_paise: 800_000, incentive_percent: '10.00' as never }))
      .toEqual({ stated: true, fixedPaise: 800_000, incentivePercent: 10 });
  });
  it('day one payslip is exactly ₹8,000', () => {
    const slip = computePayslip({
      repId: 'anshul', month: '2026-09', conversions: [],
      terms: { stated: true, fixedPaise: 800_000, incentivePercent: 10 },
    });
    expect(slip.totalPaise).toBe(800_000);
  });
  it('and one ₹399 session takes it to ₹8,040', () => {
    const slip = computePayslip({
      repId: 'anshul', month: '2026-09',
      conversions: [{ payment_id: 'p', student_id: 's', plan: 'session',
        amount_paise: 39_900, realised_at: '2026-09-10T06:00:00.000Z', refunded_at: null }],
      terms: { stated: true, fixedPaise: 800_000, incentivePercent: 10 },
    });
    expect(incentiveForPaise(39_900, 10)).toBe(4_000);
    expect(slip.totalPaise).toBe(804_000);
  });
  it('and after the refund it returns to exactly ₹8,000', () => {
    const slip = computePayslip({
      repId: 'anshul', month: '2026-09',
      conversions: [{ payment_id: 'p', student_id: 's', plan: 'session',
        amount_paise: 39_900, realised_at: '2026-09-10T06:00:00.000Z',
        refunded_at: '2026-09-10T07:00:00.000Z' }],
      terms: { stated: true, fixedPaise: 800_000, incentivePercent: 10 },
    });
    expect(slip.lines[0].incentivePaise).toBe(0);
    expect(slip.totalPaise).toBe(800_000);
  });
});
