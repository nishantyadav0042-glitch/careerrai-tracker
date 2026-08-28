import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';

// ── BOUNDARY 2, change 4: the webhook never ACKs work it could not establish ─
//
// These cases drive the REAL webhook POST handler — real signature
// verification, real activatePaidOrder, real grant/revoke — with a
// failure-capable admin client. The invariant has two halves:
//
//   1. SUCCESSFULLY processed → 200. LEGITIMATE absence/duplicate → 200.
//      INFRASTRUCTURE/DB failure → 500, never { ok: true }.
//   2. 500 must be SAFE: Razorpay redelivers, and the redelivery must never
//      double-activate, double-mint a credit, or double-grant premium.
//
// The dangerous shape this closes: `const { data: row } = await admin…` with
// the error never inspected — a failed ledger read made `row` null, the
// activation (or refund revoke) was silently skipped, and the handler fell
// through to { ok: true }. Razorpay stops retrying an acknowledged event, so
// that was a payment (or refund) lost forever, invisibly.

const SECRET = 'test-webhook-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;

// The route constructs its own admin client; tests swap in a scriptable fake.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentClient: any;
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => currentClient,
}));
// Meta CAPI is an outbound network call — irrelevant to ACK semantics.
vi.mock('@/lib/meta-capi', () => ({ sendMetaCapiEvent: vi.fn(async () => {}) }));

import { POST } from '@/app/api/payments/webhook/route';
import { SESSION_PLAN_ID } from '@/lib/session-credit';

type Res = { data: unknown; error: { message: string; code?: string } | null };
type Handler = (call: number) => Res;

/** Scriptable admin client: handlers are keyed `${table}.${op}` (op is
 *  select/insert/update/upsert) or `rpc.${fn}`, and receive the 1-based call
 *  count so a single key can fail once and then succeed. Unscripted keys
 *  resolve to { data: null, error: null } — the best-effort observability
 *  writers (security log, timeline) land there harmlessly. */
function makeClient(handlers: Record<string, Handler>) {
  const counts: Record<string, number> = {};
  const resolveKey = (key: string): Res => {
    const call = (counts[key] = (counts[key] ?? 0) + 1);
    return handlers[key] ? handlers[key](call) : { data: null, error: null };
  };
  const chain = (table: string) => {
    const state = { op: 'select' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const op of ['insert', 'update', 'upsert']) {
      c[op] = () => { state.op = op; return c; };
    }
    for (const m of ['eq', 'is', 'in', 'not', 'gte', 'lt', 'gt', 'order', 'limit', 'maybeSingle', 'single']) {
      c[m] = () => c;
    }
    c.select = () => c; // .select() after a mutation reports the mutation's result
    c.then = (ok: (r: Res) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve(resolveKey(`${table}.${state.op}`)).then(ok, err);
    return c;
  };
  return {
    from: (t: string) => chain(t),
    rpc: (name: string) => Promise.resolve(resolveKey(`rpc.${name}`)),
    counts,
  };
}

function signedRequest(body: object, signature?: string): NextRequest {
  const raw = JSON.stringify(body);
  const sig = signature ?? crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
  return new Request('http://test.local/api/payments/webhook', {
    method: 'POST',
    body: raw,
    headers: { 'x-razorpay-signature': sig },
  }) as unknown as NextRequest;
}

const captured = (orderId = 'order_1', paymentId = 'pay_1') => ({
  event: 'payment.captured',
  payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
});
const refunded = (paymentId = 'pay_1') => ({
  event: 'refund.processed',
  payload: { refund: { entity: { payment_id: paymentId } } },
});

const subscriptionRow = {
  id: 'p1', student_id: 's1', plan: 'buddy_monthly', status: 'created',
  coupon_code: null, amount: 99900, session_credit_id: null,
};
const sessionRow = { ...subscriptionRow, plan: SESSION_PLAN_ID, amount: 29900 };

beforeEach(() => {
  currentClient = makeClient({});
});

// ── Direction 1: capture events ─────────────────────────────────────────────

describe('capture: ACK semantics', () => {
  it('case 1 — a valid capture activates and ACKs 200', async () => {
    currentClient = makeClient({
      'student_payments.select': () => ({ data: subscriptionRow, error: null }),
      'profiles.update': () => ({ data: [{ id: 's1' }], error: null }),
    });
    const res = await POST(signedRequest(captured()));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(currentClient.counts['rpc.activate_payment']).toBe(1);
    expect(currentClient.counts['buddy_assignment_queue.insert']).toBe(1);
  });

  it('case 2 — the same capture delivered twice: second is idempotent, no re-activation', async () => {
    // First delivery already activated; the ledger row is now 'paid'.
    currentClient = makeClient({
      'student_payments.select': () => ({ data: { ...subscriptionRow, status: 'paid' }, error: null }),
    });
    const res = await POST(signedRequest(captured()));
    expect(res.status).toBe(200);
    expect(currentClient.counts['rpc.activate_payment']).toBeUndefined();
    expect(currentClient.counts['session_credits.insert']).toBeUndefined();
    expect(currentClient.counts['profiles.update']).toBeUndefined();
  });

  it('case 3 — payment read fails: 500, no false ACK, nothing activated', async () => {
    currentClient = makeClient({
      'student_payments.select': () => ({ data: null, error: { message: 'connection reset' } }),
    });
    const res = await POST(signedRequest(captured()));
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBeUndefined();
    expect(currentClient.counts['rpc.activate_payment']).toBeUndefined();
    // The primitive retried once before giving up — a blip never reaches Razorpay.
    expect(currentClient.counts['student_payments.select']).toBe(2);
  });

  it('a read that fails once then succeeds is invisible: one delivery, 200, activated', async () => {
    currentClient = makeClient({
      'student_payments.select': (call) =>
        call === 1 ? { data: null, error: { message: 'blip' } } : { data: subscriptionRow, error: null },
      'profiles.update': () => ({ data: [{ id: 's1' }], error: null }),
    });
    const res = await POST(signedRequest(captured()));
    expect(res.status).toBe(200);
    expect(currentClient.counts['rpc.activate_payment']).toBe(1);
  });

  it('case 4 — first delivery fails (500), the redelivery succeeds and activates exactly once', async () => {
    currentClient = makeClient({
      // Delivery 1 exhausts both read attempts; delivery 2 reads cleanly.
      'student_payments.select': (call) =>
        call <= 2 ? { data: null, error: { message: 'db down' } } : { data: subscriptionRow, error: null },
      'profiles.update': () => ({ data: [{ id: 's1' }], error: null }),
    });
    const first = await POST(signedRequest(captured()));
    expect(first.status).toBe(500);
    expect(currentClient.counts['rpc.activate_payment']).toBeUndefined();

    const second = await POST(signedRequest(captured()));
    expect(second.status).toBe(200);
    expect((await second.json()).ok).toBe(true);
    expect(currentClient.counts['rpc.activate_payment']).toBe(1);
  });

  it('genuine absence is NOT an error: unknown order ACKs 200 without retrying the read', async () => {
    currentClient = makeClient({
      'student_payments.select': () => ({ data: null, error: null }),
    });
    const res = await POST(signedRequest(captured('order_unknown')));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    // One clean read — absence is an ANSWER, so no retry loop fired.
    expect(currentClient.counts['student_payments.select']).toBe(1);
    expect(currentClient.counts['rpc.activate_payment']).toBeUndefined();
  });
});

describe('capture: activation write failures never ACK', () => {
  it('case 5a — activate_payment RPC fails: 500, retry stays safe', async () => {
    currentClient = makeClient({
      'student_payments.select': () => ({ data: subscriptionRow, error: null }),
      'rpc.activate_payment': () => ({ data: null, error: { message: 'tx aborted' } }),
    });
    const res = await POST(signedRequest(captured()));
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBeUndefined();
  });

  it('case 5b — the premium flip fails: 500, never silently "already premium"', async () => {
    // Before change 4 this returned 200: a failed flip and an already-premium
    // student were the same null, so the grant was skipped and the ACK stood.
    currentClient = makeClient({
      'student_payments.select': () => ({ data: subscriptionRow, error: null }),
      'profiles.update': () => ({ data: null, error: { message: 'update failed' } }),
    });
    const res = await POST(signedRequest(captured()));
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBeUndefined();
  });

  it('an actually-already-premium student is still a clean 200 (FALSE stays FALSE)', async () => {
    // The flip succeeds but matches 0 rows — the atomic gate's legitimate
    // "someone else already granted" answer. No queue row, no notification.
    currentClient = makeClient({
      'student_payments.select': () => ({ data: subscriptionRow, error: null }),
      'profiles.update': () => ({ data: [], error: null }),
    });
    const res = await POST(signedRequest(captured()));
    expect(res.status).toBe(200);
    expect(currentClient.counts['buddy_assignment_queue.insert']).toBeUndefined();
  });
});

describe('capture: the ₹299 session road', () => {
  it('a session capture mints ONE credit and never touches premium', async () => {
    currentClient = makeClient({
      'student_payments.select': () => ({ data: sessionRow, error: null }),
      // The conditional update reports the row it moved. Modelled because the
      // session path now filters on `.in('status', ['created','failed'])` and
      // reads the affected rows back — a refund landing between the read and
      // this write must move nothing, and "nothing moved" has to be
      // distinguishable from "moved".
      'student_payments.update': () => ({ data: [{ id: 'p1' }], error: null }),
      'session_credits.select': () => ({ data: null, error: null }),
    });
    const res = await POST(signedRequest(captured()));
    expect(res.status).toBe(200);
    expect(currentClient.counts['session_credits.insert']).toBe(1);
    expect(currentClient.counts['profiles.update']).toBeUndefined();
    expect(currentClient.counts['rpc.activate_payment']).toBeUndefined();
  });

  it('a concurrent duplicate mint (23505) is SUCCESS: the credit exists exactly once', async () => {
    currentClient = makeClient({
      'student_payments.select': () => ({ data: sessionRow, error: null }),
      // The conditional update reports the row it moved. Modelled because the
      // session path now filters on `.in('status', ['created','failed'])` and
      // reads the affected rows back — a refund landing between the read and
      // this write must move nothing, and "nothing moved" has to be
      // distinguishable from "moved".
      'student_payments.update': () => ({ data: [{ id: 'p1' }], error: null }),
      'session_credits.select': () => ({ data: null, error: null }),
      'session_credits.insert': () => ({ data: null, error: { message: 'duplicate', code: '23505' } }),
    });
    const res = await POST(signedRequest(captured()));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('a REAL credit-mint failure is 500 — money arrived, entitlement did not', async () => {
    currentClient = makeClient({
      'student_payments.select': () => ({ data: sessionRow, error: null }),
      // The conditional update reports the row it moved. Modelled because the
      // session path now filters on `.in('status', ['created','failed'])` and
      // reads the affected rows back — a refund landing between the read and
      // this write must move nothing, and "nothing moved" has to be
      // distinguishable from "moved".
      'student_payments.update': () => ({ data: [{ id: 'p1' }], error: null }),
      'session_credits.select': () => ({ data: null, error: null }),
      'session_credits.insert': () => ({ data: null, error: { message: 'disk full', code: '58030' } }),
    });
    const res = await POST(signedRequest(captured()));
    expect(res.status).toBe(500);
  });

  it('a failed paid-stamp is 500 and the mint is never attempted', async () => {
    currentClient = makeClient({
      'student_payments.select': () => ({ data: sessionRow, error: null }),
      // This test's own handler wins: the paid-stamp FAILS. Kept as the only
      // update handler here — the generic "reports the moved row" one added to
      // the other session fixtures would contradict the failure being tested.
      'student_payments.update': () => ({ data: null, error: { message: 'update failed' } }),
    });
    const res = await POST(signedRequest(captured()));
    expect(res.status).toBe(500);
    expect(currentClient.counts['session_credits.insert']).toBeUndefined();
  });
});

// ── Direction 2: refund events ──────────────────────────────────────────────

describe('refund: ACK semantics', () => {
  it('a valid refund revokes premium and ACKs 200', async () => {
    currentClient = makeClient({
      'student_payments.select': () => ({ data: { id: 'pay_row_9', student_id: 's9' }, error: null }),
    });
    const res = await POST(signedRequest(refunded()));
    expect(res.status).toBe(200);
    expect(currentClient.counts['profiles.update']).toBe(1);
    expect(currentClient.counts['buddy_assignment_queue.update']).toBe(1);
  });

  it('refund read fails: 500, no false ACK — the redelivery gets to revoke', async () => {
    currentClient = makeClient({
      'student_payments.select': () => ({ data: null, error: { message: 'read failed' } }),
    });
    const res = await POST(signedRequest(refunded()));
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBeUndefined();
    expect(currentClient.counts['profiles.update']).toBeUndefined();
    expect(currentClient.counts['student_payments.select']).toBe(2);
  });

  it('a refund for a payment not in our ledger is a legitimate 200', async () => {
    currentClient = makeClient({
      'student_payments.select': () => ({ data: null, error: null }),
    });
    const res = await POST(signedRequest(refunded('pay_foreign')));
    expect(res.status).toBe(200);
    expect(currentClient.counts['profiles.update']).toBeUndefined();
  });

  it('a failed revoke WRITE is 500 — a refunded student must not stay premium', async () => {
    currentClient = makeClient({
      'student_payments.select': () => ({ data: { id: 'pay_row_9', student_id: 's9' }, error: null }),
      'profiles.update': () => ({ data: null, error: { message: 'update failed' } }),
    });
    const res = await POST(signedRequest(refunded()));
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBeUndefined();
  });
});

// ── The front door still holds ──────────────────────────────────────────────

describe('signature gate', () => {
  it('a bad signature is 401 and the database is never touched', async () => {
    currentClient = makeClient({});
    const res = await POST(signedRequest(captured(), 'a'.repeat(64)));
    expect(res.status).toBe(401);
    expect(Object.keys(currentClient.counts)).toHaveLength(0);
  });
});

// ── Semantic guards: the decision shape, not the characters ─────────────────

describe('semantic guards', () => {
  const route = readFileSync('src/app/api/payments/webhook/route.ts', 'utf8');
  const premium = readFileSync('src/lib/premium.ts', 'utf8');

  it('the webhook never reads the ledger directly — only through the throwing primitives', () => {
    // Any direct read here can silently regrow the unchecked-destructure shape.
    expect(route).not.toMatch(/from\('student_payments'\)/);
    expect(route).toContain('readWebhookPaymentRow(admin');
    expect(route).toContain('readRefundTargetStudent(admin');
  });

  it('a thrown processing failure becomes 500, and the legitimate ACK survives', () => {
    expect(route).toMatch(/catch[\s\S]{0,200}status: 500/);
    expect(route).toContain('ok: true');
  });

  it('the premium flip and the revoke both bind and consult their write errors', () => {
    // Survives renaming: what is pinned is that the result of each mutation
    // destructures an `error`, not any particular variable name.
    expect(premium).toMatch(/\{[^}]*error[^}]*\}\s*=\s*await admin\s*[\s\S]{0,80}update\(\{ is_premium: true/);
    expect(premium).toMatch(/\{[^}]*error[^}]*\}\s*=\s*await admin\.from\('profiles'\)\.update\(\{ is_premium: false \}/);
  });
});
