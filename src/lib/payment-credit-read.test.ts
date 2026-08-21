import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readUpgradeCredits, pickUpgradeCredit, SESSION_PRICE_PAISE, type CreditStatus } from './session-credit';

// ── UNKNOWN credit → NO order (Boundary 2, change 1) ───────────────────────
//
// The old create-order read session_credits with the error never inspected.
// One failed read → null rows → "no credit" → a student who had PAID Rs 299
// charged the full plan price, and the wrong amount committed into a real
// Razorpay order. Founder ruling: if the credit state cannot be established,
// no order is created — a retryable error beats an irreversible overcharge.
//
// These are the founder's four cases, driven through the REAL functions with
// clients that succeed, fail, or fail-then-succeed.

const paid = (over: Partial<{ id: string; created_at: string; status: CreditStatus; amount_paise: number; credited_to_payment_id: string | null }> = {}) => ({
  id: 'c1', created_at: new Date().toISOString(), status: 'paid' as CreditStatus,
  amount_paise: SESSION_PRICE_PAISE, credited_to_payment_id: null, ...over,
});

function clientAnswering(answers: Array<{ data: unknown; error: unknown }>) {
  let i = 0;
  const chain = { select: () => chain, eq: async () => answers[Math.min(i++, answers.length - 1)] };
  return { from: () => chain };
}
const ok = (rows: unknown[]) => ({ data: rows, error: null });
const fail = { data: null, error: { message: 'connection reset' } };

describe("the founder's four cases", () => {
  it('credit exists + read works → the credit is found and priced', async () => {
    const rows = await readUpgradeCredits(clientAnswering([ok([paid()])]), 's1');
    const credit = pickUpgradeCredit(rows as never[]);
    expect(credit).toEqual({ id: 'c1', paise: SESSION_PRICE_PAISE });
  });

  it('credit absent + read works → a normal full-price order (null, not an error)', async () => {
    const rows = await readUpgradeCredits(clientAnswering([ok([])]), 's1');
    expect(pickUpgradeCredit(rows as never[])).toBeNull();
  });

  it('read fails twice → THROWS — the caller must not see an empty list', async () => {
    // Returning [] here IS the bug: indistinguishable from "no credit".
    await expect(readUpgradeCredits(clientAnswering([fail, fail]), 's1')).rejects.toThrow();
  });

  it('first read fails, second works → the credit still arrives (one invisible retry)', async () => {
    const rows = await readUpgradeCredits(clientAnswering([fail, ok([paid()])]), 's1');
    expect(pickUpgradeCredit(rows as never[])?.paise).toBe(SESSION_PRICE_PAISE);
  });
});

describe('legitimate no-credit answers stay no-credit (Gate C)', () => {
  it.each([
    ['refunded', paid({ status: 'refunded' as CreditStatus })],
    ['already spent on another payment', paid({ credited_to_payment_id: 'p9' })],
    ['outside the upgrade window', paid({ created_at: new Date(Date.now() - 30 * 86_400_000).toISOString() })],
  ])('a credit that is %s does not discount', async (_why, row) => {
    const rows = await readUpgradeCredits(clientAnswering([ok([row])]), 's1');
    expect(pickUpgradeCredit(rows as never[])).toBeNull();
  });
});

describe('the route enforces the hard stop (Gate A)', () => {
  const route = readFileSync('src/app/api/payments/create-order/route.ts', 'utf8');
  const code = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('reads credits only through the throwing primitive', () => {
    expect(code).toContain('readUpgradeCredits(admin, user.id)');
    expect(code, 'the unchecked inline read must not return')
      .not.toMatch(/\{ data: creditRows \} = await admin/);
  });

  it('a failed read answers 503 with a machine code, before any order exists', () => {
    expect(code).toContain("code: 'CREDIT_READ_FAILED'");
    expect(code).toContain('status: 503');
    const stopAt = code.indexOf('CREDIT_READ_FAILED');
    const orderAt = code.indexOf('createRazorpayOrder(');
    expect(stopAt, 'the stop must sit before Razorpay order creation').toBeLessThan(orderAt);
    const insertAt = code.indexOf("from('student_payments')");
    expect(stopAt, 'the stop must sit before any payment row').toBeLessThan(insertAt);
  });
});
