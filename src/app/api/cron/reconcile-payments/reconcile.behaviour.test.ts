import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ── THE EXPLAIN PASS, EXECUTED ──────────────────────────────────────────────
//
// Incident #58: this cron asked Razorpay why a payment failed and threw the
// answer away, so eight iOS orders could be known-failed and never-explained.
// The fix has two halves and BOTH are runtime facts no source-reading guard
// would catch: the failing path must now persist the reason, and a second pass
// must reach the rows that were already marked failed before the fix existed.
//
// The second half has a trap that a lazy test would sail straight past: the
// route used to `return` early whenever no order was in flight, which is most
// ticks. If that early return survives, the backlog is drained almost never
// while every unit test still passes. The "no in-flight orders" case below is
// the one that fails if it comes back.

/* eslint-disable @typescript-eslint/no-explicit-any */

process.env.CRON_SECRET = 'test-cron-secret';

let stuckRows: any[] = [];
let failedRows: any[] = [];
const updates: Array<{ id: string; patch: any }> = [];
const fetchPayments = vi.hoisted(() => vi.fn());
const activate = vi.hoisted(() => vi.fn(async () => true));

vi.mock('@/lib/razorpay', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fetchOrderPayments: fetchPayments,
}));
vi.mock('@/lib/activate-payment', () => ({ activatePaidOrder: activate }));
vi.mock('@/lib/cron-auth', () => ({ authorizedCron: () => true }));
vi.mock('@/lib/cron-run-tracker', () => ({
  withCronTracking: (_p: string, fn: () => unknown) => fn(),
}));

// A query builder just real enough to tell the two SELECTs apart: the rescue
// loop asks for status='created', the explain pass for status='failed' with a
// null failure_seen_at. Everything else is chainable and inert.
function makeAdmin() {
  const table = () => {
    let wantStatus: string | null = null;
    let wantsUnseen = false;
    let updatePatch: any = null;
    const b: any = {
      select: () => b,
      not: () => b,
      lt: () => b,
      gt: () => b,
      order: () => b,
      limit: () => b,
      eq(col: string, val: string) {
        if (col === 'status') wantStatus = val;
        if (col === 'id' && updatePatch) updates.push({ id: val, patch: updatePatch });
        return b;
      },
      is(col: string, val: unknown) {
        if (col === 'failure_seen_at' && val === null) wantsUnseen = true;
        return b;
      },
      update(patch: any) { updatePatch = patch; return b; },
      then(res: (v: any) => unknown) {
        const data = wantStatus === 'failed' && wantsUnseen ? failedRows
          : wantStatus === 'created' ? stuckRows
          : [];
        return Promise.resolve(res({ data, error: null }));
      },
    };
    return b;
  };
  return { from: table };
}
let currentAdmin: any;
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => currentAdmin }));

import { POST } from './route';

const req = () => ({} as unknown as NextRequest);
const stuck = (id: string, order: string) => ({
  id, razorpay_order_id: order, student_id: 's1', plan: 'session', coupon_code: null,
  amount: 29900, session_credit_id: null, created_at: '2026-08-25T15:36:00Z',
  finding_kind: null, finding_evidence: null, session_intent: null, session_intent_note: null,
});
const patchFor = (id: string) => updates.find((u) => u.id === id)?.patch;

beforeEach(() => {
  stuckRows = []; failedRows = []; updates.length = 0;
  fetchPayments.mockReset(); activate.mockReset(); activate.mockResolvedValue(true);
  currentAdmin = makeAdmin();
});

describe('reconcile-payments records WHY a payment failed', () => {
  it('stores the Razorpay reason alongside status when it marks an order failed', async () => {
    stuckRows = [stuck('row1', 'order_A')];
    fetchPayments.mockResolvedValue([{
      id: 'pay_1', status: 'failed', amount: 29900, method: 'upi',
      error_code: 'BAD_REQUEST_ERROR', error_description: 'Payment was not completed on time',
      error_source: 'customer', error_step: 'payment_initiation',
    }]);

    await POST(req());

    const p = patchFor('row1');
    expect(p.status).toBe('failed');
    expect(p.failure_method).toBe('upi');
    expect(p.failure_step).toBe('payment_initiation');
    expect(p.failure_code).toBe('BAD_REQUEST_ERROR');
    expect(p.failure_seen_at).toBeTruthy();
  });

  it('leaves an order alone when Razorpay reports no failed attempt', async () => {
    // Nobody tried to pay. Writing failure columns here would manufacture a
    // failure that never happened.
    stuckRows = [stuck('row1', 'order_A')];
    fetchPayments.mockResolvedValue([]);
    await POST(req());
    expect(updates).toHaveLength(0);
  });

  it('still activates a captured payment, reason-recording notwithstanding', async () => {
    // The money safety net is the reason this cron exists; the diagnosis is a
    // passenger and must never displace it.
    stuckRows = [stuck('row1', 'order_A')];
    fetchPayments.mockResolvedValue([{ id: 'pay_ok', status: 'captured', amount: 29900 }]);
    const res = await POST(req());
    expect(activate).toHaveBeenCalledTimes(1);
    expect((await res.json()).rescued).toBe(1);
  });
});

describe('the explain pass reaches failures marked before the fix existed', () => {
  it('explains an already-failed row that has never been asked about', async () => {
    failedRows = [{ id: 'old1', razorpay_order_id: 'order_OLD' }];
    fetchPayments.mockResolvedValue([{
      id: 'pay_old', status: 'failed', amount: 299900, method: 'card',
      error_code: 'GATEWAY_ERROR', error_step: 'payment_authentication', error_source: 'bank',
    }]);

    const res = await POST(req());

    expect(patchFor('old1')).toMatchObject({
      failure_method: 'card', failure_step: 'payment_authentication', failure_source: 'bank',
    });
    expect((await res.json()).explained).toBe(1);
  });

  it('runs even when NO order is in flight — the early return must stay gone', async () => {
    // The regression that would silently disable the whole backlog drain.
    stuckRows = [];
    failedRows = [{ id: 'old1', razorpay_order_id: 'order_OLD' }];
    fetchPayments.mockResolvedValue([{ id: 'p', status: 'failed', amount: 1, error_code: 'X' }]);

    const res = await POST(req());

    expect(patchFor('old1')?.failure_code).toBe('X');
    expect((await res.json())).toMatchObject({ checked: 0, explained: 1 });
  });

  it('stamps failure_seen_at with no reason when Razorpay reports no failure', async () => {
    // "Asked, and Razorpay named nothing" must be recorded as exactly that —
    // otherwise the row is re-queried forever and reads as never-asked (L1).
    failedRows = [{ id: 'old1', razorpay_order_id: 'order_OLD' }];
    fetchPayments.mockResolvedValue([{ id: 'p', status: 'captured', amount: 1 }]);

    await POST(req());

    const p = patchFor('old1');
    expect(p.failure_seen_at).toBeTruthy();
    expect(p.failure_code).toBeUndefined();
    expect(p.status).toBeUndefined(); // never rewrites the settled status
  });

  it('a Razorpay outage on one row is counted, not thrown', async () => {
    failedRows = [{ id: 'old1', razorpay_order_id: 'order_OLD' }];
    fetchPayments.mockRejectedValue(new Error('Razorpay 503'));
    const res = await POST(req());
    expect((await res.json())).toMatchObject({ explained: 0, errors: 1 });
    // Unstamped, so the next tick tries again rather than recording a lie.
    expect(patchFor('old1')).toBeUndefined();
  });
});
