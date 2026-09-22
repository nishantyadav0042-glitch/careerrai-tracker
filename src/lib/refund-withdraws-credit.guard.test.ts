import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { settleRefund } from './activate-payment';

// ── A REFUND MUST REACH THE SESSION CREDIT ──────────────────────────────────
//
// Found in production on 22 Sep 2026 while cross-checking the payment journey
// end to end.
//
// settleRefund did three things: take the payment out of the paid ledger,
// withdraw the counsellor's incentive, and (in its caller) revoke premium. Its
// own comment says the refund "has to reach three places now, not one". It is
// FOUR. revokePremium covers a PLAN; a single session's entitlement is not
// is_premium at all — it is a row in session_credits.
//
// Nothing in the codebase had ever written status='refunded' onto a credit.
// The value was in the CreditStatus union and two call sites already treated
// it as terminal on read, so every reader agreed what it meant and none of
// them had ever seen one. That is the quietest shape a defect takes.
//
// Production at the time: two refunded session payments, one credit correctly
// 'refunded' (set by hand) and one still 'assigned' — redeemable by a student
// whose money had already gone back.

type Row = Record<string, unknown>;

/**
 * A fake PostgREST that actually APPLIES the filters, so these tests assert
 * what the query does to rows rather than which methods were called. A
 * shape-only assertion would pass against a filter that matched nothing.
 */
function fakeDb(tables: Record<string, Row[]>, opts: { failOn?: string } = {}) {
  const from = (table: string) => {
    const preds: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    const builder: Record<string, unknown> = {};
    const chain = (fn: () => void) => { fn(); return builder as never; };

    Object.assign(builder, {
      update: (v: Row) => chain(() => { patch = v; }),
      eq: (c: string, v: unknown) => chain(() => preds.push((r) => r[c] === v)),
      is: (c: string, v: unknown) => chain(() => preds.push((r) => (r[c] ?? null) === v)),
      not: (c: string, op: string, list: string) => chain(() => {
        expect(op, 'only `in` is modelled here').toBe('in');
        const vals = list.replace(/[()"]/g, '').split(',').map((s) => s.trim());
        preds.push((r) => !vals.includes(String(r[c])));
      }),
      select: () => builder,
      then: (resolve: (v: unknown) => void) => {
        if (opts.failOn === table) return resolve({ data: null, error: { message: 'read failed' } });
        const rows = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)));
        if (patch) for (const r of rows) Object.assign(r, patch);
        return resolve({ data: rows.map((r) => ({ ...r })), error: null });
      },
    });
    return builder;
  };
  return { from } as never;
}

const TARGET = { paymentId: 'pay-1', studentId: 'stu-1' };
const AT = '2026-09-22T10:00:00.000Z';

const credit = (o: Row = {}): Row => ({
  id: 'c1', payment_id: 'pay-1', status: 'assigned', credited_to_payment_id: null,
  owner: 'ops', next_action: 'call them', ...o,
});
const payment = (o: Row = {}): Row => ({ id: 'pay-1', status: 'paid', refunded_at: null, ...o });

describe('a refund withdraws the session credit it paid for', () => {
  it('an ASSIGNED credit is withdrawn — the defect this exists for', () => {
    const c = credit();
    const db = fakeDb({ student_payments: [payment()], session_credits: [c], sales_conversions: [] });
    return settleRefund(db, TARGET, AT).then(() => {
      expect(c.status).toBe('refunded');
      // Rule (9): a terminal credit owes nobody anything.
      expect(c.owner).toBeNull();
      expect(c.next_action).toBeNull();
    });
  });

  it('a PAID, unassigned credit is withdrawn too', async () => {
    const c = credit({ status: 'paid' });
    await settleRefund(fakeDb({ student_payments: [payment()], session_credits: [c], sales_conversions: [] }), TARGET, AT);
    expect(c.status).toBe('refunded');
  });

  it('a SCHEDULED credit is withdrawn — the session has not happened yet', async () => {
    const c = credit({ status: 'scheduled' });
    await settleRefund(fakeDb({ student_payments: [payment()], session_credits: [c], sales_conversions: [] }), TARGET, AT);
    expect(c.status).toBe('refunded');
  });

  it('a COMPLETED session is NOT withdrawn — the mentor did the work', async () => {
    // The student had the value and the mentor is owed. Clawing that back is a
    // founder's decision, not a side effect of a webhook.
    const c = credit({ status: 'completed' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await settleRefund(fakeDb({ student_payments: [payment()], session_credits: [c], sales_conversions: [] }), TARGET, AT);
    expect(c.status).toBe('completed');
    // ...but it is SAID OUT LOUD. Money went back while the entitlement stayed,
    // and being silent about that a second time is the original defect.
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toMatch(/NOT withdrawn/);
    warn.mockRestore();
  });

  it('a credit already SPENT as a discount is NOT withdrawn', async () => {
    // Its value moved into a different purchase. Unpicking it from here would
    // be guessing at which payment to adjust.
    const c = credit({ credited_to_payment_id: 'pay-2' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await settleRefund(fakeDb({ student_payments: [payment()], session_credits: [c], sales_conversions: [] }), TARGET, AT);
    expect(c.status).toBe('assigned');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('another student’s credit is never touched', async () => {
    const mine = credit();
    const theirs = credit({ id: 'c2', payment_id: 'pay-99' });
    await settleRefund(
      fakeDb({ student_payments: [payment()], session_credits: [mine, theirs], sales_conversions: [] }), TARGET, AT);
    expect(mine.status).toBe('refunded');
    expect(theirs.status).toBe('assigned');
  });

  it('a redelivered refund is a clean no-op, not a second write', async () => {
    // Razorpay retries for hours. The second delivery must find nothing to do.
    const c = credit({ status: 'refunded' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await settleRefund(fakeDb({ student_payments: [payment({ status: 'refunded' })], session_credits: [c], sales_conversions: [] }), TARGET, AT);
    expect(c.status).toBe('refunded');
    warn.mockRestore();
  });

  it('a failed credit write THROWS, so the webhook 500s and Razorpay redelivers', async () => {
    // Same rule as the rest of this path: a refund we ACKed but never finished
    // is the silent-loss shape the whole module exists to prevent.
    await expect(settleRefund(
      fakeDb({ student_payments: [payment()], session_credits: [credit()], sales_conversions: [] },
        { failOn: 'session_credits' }), TARGET, AT)).rejects.toThrow(/session credit/i);
  });

  it('the original three places still happen', async () => {
    // Regression: adding the fourth must not disturb the three that worked.
    const p = payment();
    const conv: Row = { payment_id: 'pay-1', refunded_at: null };
    await settleRefund(fakeDb({ student_payments: [p], session_credits: [credit()], sales_conversions: [conv] }), TARGET, AT);
    expect(p.status).toBe('refunded');
    expect(p.refunded_at).toBe(AT);
    expect(conv.refunded_at).toBe(AT);
  });
});

describe('the fourth place cannot be silently dropped again', () => {
  it('the refund path calls the credit AUTHORITY, and does not write the state itself', () => {
    // The first version of this fix wrote status='refunded' directly from
    // activate-payment.ts and the credit-writer guard caught it. It was right:
    // a terminal credit must also have its owner and next_action cleared, and
    // session-credit.ts is the only file that knows that.
    const src = readFileSync('src/lib/activate-payment.ts', 'utf8');
    const from = src.indexOf('export async function settleRefund');
    // Scope to THIS function only. activateSessionCredit sits further down the
    // same file and legitimately writes session_credits — it MINTS them, which
    // is the transition this file is declared to own.
    const body = src.slice(from, src.indexOf('\n}', from) + 2);
    expect(body).toMatch(/withdrawCreditForRefund\(/);
    expect(body).not.toMatch(/from\('session_credits'\)/);
  });

  it('the authority clears owner and next_action with the status (rule 9)', () => {
    const src = readFileSync('src/lib/session-credit.ts', 'utf8');
    const body = src.slice(src.indexOf('export async function withdrawCreditForRefund'));
    expect(body).toMatch(/status: 'refunded'/);
    expect(body).toMatch(/owner: null/);
    expect(body).toMatch(/next_action: null/);
  });

  it('and still refuses to withdraw a completed or already-spent one', () => {
    const src = readFileSync('src/lib/session-credit.ts', 'utf8');
    const body = src.slice(src.indexOf('export async function withdrawCreditForRefund'));
    expect(body).toContain('("completed","refunded")');
    expect(body).toMatch(/\.is\('credited_to_payment_id', null\)/);
  });
});
