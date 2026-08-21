import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pickUpgradeCredit, upgradeCreditPaise, CREDIT_WINDOW_DAYS, type CreditStatus } from './session-credit';

// ── The ₹299 entry ladder (founder, 20 Aug 2026) ───────────────────────────
//
// The session is the entry point; its price credits against ANY plan bought
// within the window. Before this ladder was wired, upgradeCreditPaise had
// ZERO callers — the promise existed only as copy. These tests pin the rule
// AND the wiring, so the credit can neither vanish again nor double-spend.

const NOW = new Date('2026-08-20T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const credit = (over: Partial<{ id: string; created_at: string; status: CreditStatus; amount_paise: number; credited_to_payment_id: string | null }> = {}) => ({
  id: 'c1', created_at: days(1), status: 'paid' as CreditStatus, amount_paise: 29900, credited_to_payment_id: null, ...over,
});

describe('which credit applies', () => {
  it('a fresh unspent credit applies in full', () => {
    expect(pickUpgradeCredit([credit()], NOW)).toEqual({ id: 'c1', paise: 29900 });
  });

  it('outside the window it is gone', () => {
    expect(pickUpgradeCredit([credit({ created_at: days(CREDIT_WINDOW_DAYS + 1) })], NOW)).toBeNull();
  });

  it('a spent or refunded credit never applies again', () => {
    expect(pickUpgradeCredit([credit({ credited_to_payment_id: 'pay1' })], NOW)).toBeNull();
    expect(pickUpgradeCredit([credit({ status: 'refunded' })], NOW)).toBeNull();
  });

  it('only ONE credit applies — the largest, never a sum', () => {
    const picked = pickUpgradeCredit([credit(), credit({ id: 'c2', amount_paise: 30000 })], NOW);
    expect(picked).toEqual({ id: 'c2', paise: 30000 });
    expect(upgradeCreditPaise([credit(), credit({ id: 'c2' })], NOW)).toBe(29900);
  });
});

describe('the wiring — checkout applies it, activation spends it', () => {
  const createOrder = () => readFileSync('src/app/api/payments/create-order/route.ts', 'utf8');
  const activate = () => readFileSync('src/lib/activate-payment.ts', 'utf8');

  it('create-order computes the credit through the one authority', () => {
    const s = createOrder();
    expect(s).toContain('pickUpgradeCredit(');
    // Applied after scholarship/coupon, capped at the price itself.
    expect(s).toMatch(/Math\.min\(credit\.paise, price\.finalPaise\)/);
    // Both insert paths record which credit discounted the order.
    expect(s.match(/session_credit_id: credit\?\.id \?\? null/g)?.length).toBe(2);
  });

  it('tax is computed on the credited price, not the pre-credit price', () => {
    const s = createOrder();
    expect(s).not.toMatch(/taxForPlan\(plan, price\.finalPaise\)/);
    expect(s).toMatch(/taxForPlan\(plan, effectivePaise\)/);
  });

  it('activation spends the credit with an IS NULL guard — one credit, one discount', () => {
    const s = activate();
    const stamp = s.indexOf("credited_to_payment_id: row.id");
    expect(stamp).toBeGreaterThan(-1);
    expect(s.slice(stamp, stamp + 300)).toContain(".is('credited_to_payment_id', null)");
  });

  it('the webhook and the reconcile cron both carry the credit id to activation', () => {
    // Boundary 2 change 4 moved the webhook's ledger read into
    // readWebhookPaymentRow — the credit id now rides in the primitive's
    // select, and the route must consume that primitive. The idea being
    // pinned is unchanged: the row handed to activation carries the credit.
    expect(readFileSync('src/lib/activate-payment.ts', 'utf8')).toMatch(/select\('[^']*session_credit_id[^']*'\)/);
    expect(readFileSync('src/app/api/payments/webhook/route.ts', 'utf8')).toContain('readWebhookPaymentRow(admin');
    expect(readFileSync('src/app/api/cron/reconcile-payments/route.ts', 'utf8')).toContain('session_credit_id');
  });
});
