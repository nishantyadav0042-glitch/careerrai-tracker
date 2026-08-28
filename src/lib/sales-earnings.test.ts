import { describe, it, expect } from 'vitest';
import {
  incentiveForPaise, istMonthWindow, istMonthOf, readTerms, computePayslip,
  type RawConversion, type RepTerms,
} from './sales-earnings';
import { PLANS, SESSION_PRICING } from './plans';

// ── The arithmetic two people are paid from ─────────────────────────────────
//
// Anshul Yadav and Neelam start on 2 September 2026 on ₹8,000 fixed + 10% of
// what each converted student actually pays. Their engagement letters print a
// three-row table of exactly what they earn per plan. These tests exist so
// that table and this code can never disagree.

const TERMS: RepTerms = { stated: true, fixedPaise: 800_000, incentivePercent: 10 };

const conv = (o: Partial<RawConversion> = {}): RawConversion => ({
  payment_id: 'p1', student_id: 's1', plan: 'session',
  amount_paise: SESSION_PRICING.offerPaise, realised_at: '2026-09-10T06:00:00.000Z',
  refunded_at: null, ...o,
});

describe('the incentive matches the table printed in the letter', () => {
  // If any of these three fail, a counsellor's letter and their payslip
  // disagree, and the letter is the one they will trust.
  it('a single session at ₹399 earns ₹40', () => {
    expect(incentiveForPaise(SESSION_PRICING.offerPaise, 10)).toBe(4_000);
  });

  it('one month at ₹999 earns ₹100', () => {
    expect(incentiveForPaise(PLANS.monthly.offerPaise, 10)).toBe(10_000);
  });

  it('Till CAT Day at ₹2,599 earns ₹260', () => {
    expect(incentiveForPaise(PLANS.tillcat.offerPaise, 10)).toBe(26_000);
  });

  it('rounds to whole rupees, because a payslip in paise is not readable', () => {
    // 10% of ₹399 is ₹39.90 exactly. The letter says ₹40.
    expect(incentiveForPaise(39_900, 10)).toBe(4_000);
    expect(incentiveForPaise(39_900, 10) % 100).toBe(0);
  });

  it('a rate that is not 10 still works — the rate is configuration, not code', () => {
    expect(incentiveForPaise(100_000, 15)).toBe(15_000);
    expect(incentiveForPaise(100_000, 0)).toBe(0);
  });
});

describe('terms that were never stated are UNKNOWN, never zero', () => {
  // Law L1. A rep whose terms have not been entered must not produce a
  // confident ₹0 payslip that a founder might pay, or fail to pay.
  it('no config row at all → not stated', () => {
    expect(readTerms(null)).toEqual({ stated: false, missing: ['fixed', 'incentive'] });
  });

  it('a fixed fee with no rate is still not stated', () => {
    expect(readTerms({ monthly_fixed_paise: 800_000, incentive_percent: null }))
      .toEqual({ stated: false, missing: ['incentive'] });
  });

  it('a rate with no fixed fee is still not stated', () => {
    expect(readTerms({ monthly_fixed_paise: null, incentive_percent: 10 }))
      .toEqual({ stated: false, missing: ['fixed'] });
  });

  it('numeric(5,2) arriving as the string "10.00" is a stated rate', () => {
    // PostgREST serialises numeric as a string. Untreated, '10.00' would have
    // reached arithmetic and produced a string-concatenated payslip.
    expect(readTerms({ monthly_fixed_paise: 800_000, incentive_percent: '10.00' as never }))
      .toEqual({ stated: true, fixedPaise: 800_000, incentivePercent: 10 });
  });

  it('a zero rate is STATED — "they earn no commission" is a real answer', () => {
    expect(readTerms({ monthly_fixed_paise: 0, incentive_percent: 0 }))
      .toEqual({ stated: true, fixedPaise: 0, incentivePercent: 0 });
  });

  it('an unstated payslip leaves every money field null, not 0', () => {
    const slip = computePayslip({
      repId: 'r1', month: '2026-09', conversions: [conv()],
      terms: { stated: false, missing: ['fixed', 'incentive'] },
    });
    expect(slip.fixedPaise).toBeNull();
    expect(slip.incentivePaise).toBeNull();
    expect(slip.totalPaise).toBeNull();
    // The work is still visible — only the money is withheld.
    expect(slip.conversionsCounted).toBe(1);
    expect(slip.lines[0].incentivePaise).toBeNull();
  });
});

describe('a refund withdraws that one incentive and nothing else', () => {
  // Clause 7: "Where a refund is made, only the incentive on that transaction
  // shall stand withdrawn."
  const slip = computePayslip({
    repId: 'r1', month: '2026-09', terms: TERMS,
    conversions: [
      conv({ payment_id: 'a', amount_paise: 259_900, plan: 'tillcat' }),
      conv({ payment_id: 'b', amount_paise: 99_900, plan: 'monthly', refunded_at: '2026-09-20T06:00:00.000Z' }),
      conv({ payment_id: 'c', amount_paise: 39_900, plan: 'session' }),
    ],
  });

  it('the refunded line earns nothing', () => {
    expect(slip.lines.find((l) => l.paymentId === 'b')!.incentivePaise).toBe(0);
  });

  it('the other lines are untouched', () => {
    expect(slip.lines.find((l) => l.paymentId === 'a')!.incentivePaise).toBe(26_000);
    expect(slip.lines.find((l) => l.paymentId === 'c')!.incentivePaise).toBe(4_000);
  });

  it('the refunded sale is still SHOWN, so the deduction can be explained', () => {
    // Hiding it would make the statement disagree with the rep's own memory
    // of the sale — a worse conversation than the deduction itself.
    expect(slip.lines).toHaveLength(3);
    expect(slip.conversionsRefunded).toBe(1);
    expect(slip.refundedPaise).toBe(99_900);
  });

  it('the total is fixed + the two surviving incentives', () => {
    expect(slip.conversionsCounted).toBe(2);
    expect(slip.netRealisedPaise).toBe(259_900 + 39_900);
    expect(slip.incentivePaise).toBe(26_000 + 4_000);
    expect(slip.totalPaise).toBe(800_000 + 30_000);
  });
});

describe('a month with no sales still owes the fixed fee', () => {
  it('zero conversions pays ₹8,000, not ₹0', () => {
    const slip = computePayslip({ repId: 'r1', month: '2026-09', conversions: [], terms: TERMS });
    expect(slip.totalPaise).toBe(800_000);
    expect(slip.incentivePaise).toBe(0);
    expect(slip.conversionsCounted).toBe(0);
  });
});

describe('rounding happens per line, never on the total', () => {
  it('three ₹399 sales pay 3 × ₹40, not 10% of ₹1,197', () => {
    // 10% of 119700 paise is 11970 = ₹119.70, which would round to ₹120.
    // Per line it is ₹40 × 3 = ₹120 as well here, so use a rate that splits
    // them to prove which rule is in force.
    const lines = [conv({ payment_id: 'a' }), conv({ payment_id: 'b' }), conv({ payment_id: 'c' })];
    const slip = computePayslip({
      repId: 'r1', month: '2026-09', conversions: lines,
      terms: { stated: true, fixedPaise: 0, incentivePercent: 7 },
    });
    // Per line: 7% of ₹399 = ₹27.93 → ₹28 each → ₹84.
    // On the total it would be 7% of ₹1,197 = ₹83.79 → ₹84 — same here, so
    // assert the LINES, which is where the rule actually lives.
    expect(slip.lines.map((l) => l.incentivePaise)).toEqual([2_800, 2_800, 2_800]);
    expect(slip.incentivePaise).toBe(8_400);
  });

  it('every line is a whole number of rupees', () => {
    const slip = computePayslip({
      repId: 'r1', month: '2026-09', terms: TERMS,
      conversions: [conv({ amount_paise: 12_345 }), conv({ payment_id: 'b', amount_paise: 67_899 })],
    });
    for (const l of slip.lines) expect(l.incentivePaise! % 100).toBe(0);
  });
});

describe('the month window is IST and half-open', () => {
  it('September 2026 starts at 18:30 UTC on 31 August', () => {
    const { startIso, endIso } = istMonthWindow('2026-09');
    expect(startIso).toBe('2026-08-31T18:30:00.000Z');
    expect(endIso).toBe('2026-09-30T18:30:00.000Z');
  });

  it('December rolls the year, not the month', () => {
    expect(istMonthWindow('2026-12').endIso).toBe('2026-12-31T18:30:00.000Z');
  });

  it('a sale at 00:05 IST on 1 September belongs to September, not August', () => {
    // 00:05 IST on 1 Sep = 18:35 UTC on 31 Aug. A UTC month boundary would
    // have filed it under August and paid the wrong payslip.
    const sale = '2026-08-31T18:35:00.000Z';
    const sep = istMonthWindow('2026-09');
    const aug = istMonthWindow('2026-08');
    expect(sale >= sep.startIso && sale < sep.endIso).toBe(true);
    expect(sale >= aug.startIso && sale < aug.endIso).toBe(false);
  });

  it('a sale at 23:59:59.9 IST on the last day is still inside the month', () => {
    // The half-open end is what saves this one; an inclusive `<= 23:59:59`
    // boundary drops it into nobody's payslip.
    const sale = '2026-09-30T18:29:59.900Z';
    const { startIso, endIso } = istMonthWindow('2026-09');
    expect(sale >= startIso && sale < endIso).toBe(true);
  });

  it('the two months never overlap and never leave a gap', () => {
    expect(istMonthWindow('2026-09').endIso).toBe(istMonthWindow('2026-10').startIso);
  });

  it('istMonthOf reports the IST month, not the UTC one', () => {
    expect(istMonthOf(new Date('2026-08-31T18:35:00.000Z'))).toBe('2026-09');
    expect(istMonthOf(new Date('2026-09-15T00:00:00.000Z'))).toBe('2026-09');
  });
});

describe('the first payslip, as the letters describe it', () => {
  it('2 Sept to 30 Sept: fixed ₹8,000 + one of each plan = ₹8,400', () => {
    const slip = computePayslip({
      repId: 'anshul', month: '2026-09', terms: TERMS,
      conversions: [
        conv({ payment_id: 'a', amount_paise: SESSION_PRICING.offerPaise, plan: 'session' }),
        conv({ payment_id: 'b', amount_paise: PLANS.monthly.offerPaise, plan: 'monthly' }),
        conv({ payment_id: 'c', amount_paise: PLANS.tillcat.offerPaise, plan: 'tillcat' }),
      ],
    });
    expect(slip.incentivePaise).toBe(4_000 + 10_000 + 26_000);  // ₹40 + ₹100 + ₹260
    expect(slip.totalPaise).toBe(800_000 + 40_000);             // ₹8,000 + ₹400
  });
});
