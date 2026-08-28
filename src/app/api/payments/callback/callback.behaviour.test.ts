import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import crypto from 'node:crypto';

// ── THE RETURN LEG, EXECUTED ────────────────────────────────────────────────
//
// Until now this route had guards that READ its source and asserted the shape
// of the code. Nothing ever ran it. The failure that put it here — a POST
// landing on a page route and getting 405 — was a RUNTIME fact that no amount
// of source reading would have caught, so source reading is not the test this
// route deserves.
//
// Every case below drives the real handler with a real HMAC and asserts what
// it DID: which rows moved, which did not, and where the browser was sent.

/* eslint-disable @typescript-eslint/no-explicit-any */

const SECRET = 'rzp_test_secret_for_unit_tests_only';
process.env.RAZORPAY_KEY_SECRET = SECRET;

let currentAdmin: any;
const activate = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => true));
const readRow = vi.hoisted(() => vi.fn());
const emit = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => currentAdmin }));
// Only the SIDE-EFFECTING functions are stubbed. mayActivatePayment is the
// real one, deliberately: it is the rule that decides whether a replayed
// capture may re-activate a refunded payment, and a stub of it would make
// these tests pass no matter what that rule said.
vi.mock('@/lib/activate-payment', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  activatePaidOrder: activate,
  readWebhookPaymentRow: readRow,
}));
vi.mock('@/lib/payment-funnel', () => ({ emitPaymentFunnel: emit }));

import { POST, GET } from './route';

/** A real Razorpay checkout signature: HMAC_SHA256(order|payment) on the key secret. */
const sign = (order: string, payment: string, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(`${order}|${payment}`).digest('hex');

function post(fields: Record<string, string>, dest = 'buddy'): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return {
    formData: async () => form,
    nextUrl: {
      origin: 'https://careerrai.in',
      searchParams: new URLSearchParams(dest === '' ? '' : `dest=${dest}`),
    },
  } as unknown as NextRequest;
}

const PAID_ROW = { id: 'row-1', student_id: 'stu-1', plan: 'session', status: 'created' };

beforeEach(() => {
  vi.clearAllMocks();
  currentAdmin = { from: () => ({}) };
  readRow.mockResolvedValue({ ...PAID_ROW });
});

describe('a genuine Razorpay return', () => {
  it('verifies, activates ONCE, and lands the student on paid', async () => {
    const res = await POST(post({
      razorpay_order_id: 'order_A', razorpay_payment_id: 'pay_A',
      razorpay_signature: sign('order_A', 'pay_A'),
    }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://careerrai.in/student/buddy?pay=paid');
    expect(activate).toHaveBeenCalledOnce();
    // The SAME activator the webhook uses — source label 'webhook', not a third kind.
    expect(activate.mock.calls[0]![4]).toBe('webhook');
  });

  it('303, so the browser converts Razorpay POST into a GET of the page', async () => {
    // A 302 would let some clients re-POST to the page — which is the 405 all
    // over again, arriving by a different door.
    const res = await POST(post({
      razorpay_order_id: 'order_A', razorpay_payment_id: 'pay_A',
      razorpay_signature: sign('order_A', 'pay_A'),
    }));
    expect(res.status).toBe(303);
  });

  it('is IDEMPOTENT: a row already paid is not activated a second time', async () => {
    readRow.mockResolvedValue({ ...PAID_ROW, status: 'paid' });
    const res = await POST(post({
      razorpay_order_id: 'order_A', razorpay_payment_id: 'pay_A',
      razorpay_signature: sign('order_A', 'pay_A'),
    }));
    expect(activate).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('pay=paid');
  });

  it('a duplicate delivery of the SAME callback stays idempotent', async () => {
    const body = {
      razorpay_order_id: 'order_A', razorpay_payment_id: 'pay_A',
      razorpay_signature: sign('order_A', 'pay_A'),
    };
    await POST(post(body));
    readRow.mockResolvedValue({ ...PAID_ROW, status: 'paid' }); // first call landed it
    await POST(post(body));
    expect(activate).toHaveBeenCalledTimes(1);
  });
});

describe('anything unproven activates NOTHING', () => {
  it('rejects a forged signature', async () => {
    const res = await POST(post({
      razorpay_order_id: 'order_A', razorpay_payment_id: 'pay_A',
      razorpay_signature: 'deadbeefdeadbeef',
    }));
    expect(activate).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('pay=unverified');
  });

  it('rejects a signature minted for a DIFFERENT order', async () => {
    // The exact shape of a replay: a real signature, pointed at another order.
    const res = await POST(post({
      razorpay_order_id: 'order_B', razorpay_payment_id: 'pay_A',
      razorpay_signature: sign('order_A', 'pay_A'),
    }));
    expect(activate).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('pay=unverified');
  });

  it('rejects a signature minted for a different PAYMENT', async () => {
    const res = await POST(post({
      razorpay_order_id: 'order_A', razorpay_payment_id: 'pay_B',
      razorpay_signature: sign('order_A', 'pay_A'),
    }));
    expect(activate).not.toHaveBeenCalled();
  });

  it('rejects a signature minted with the wrong secret', async () => {
    const res = await POST(post({
      razorpay_order_id: 'order_A', razorpay_payment_id: 'pay_A',
      razorpay_signature: sign('order_A', 'pay_A', 'someone_elses_secret'),
    }));
    expect(activate).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('pay=unverified');
  });

  it('activates nothing when the order is not in our ledger', async () => {
    readRow.mockResolvedValue(null);
    const res = await POST(post({
      razorpay_order_id: 'order_GHOST', razorpay_payment_id: 'pay_A',
      razorpay_signature: sign('order_GHOST', 'pay_A'),
    }));
    expect(activate).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('pay=unverified');
  });
});

describe('a cancelled or failed payment', () => {
  it('lands on failed and activates nothing', async () => {
    const res = await POST(post({
      'error[code]': 'BAD_REQUEST_ERROR',
      'error[metadata][order_id]': 'order_A',
    }));
    expect(activate).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://careerrai.in/student/buddy?pay=failed');
  });

  it('never attributes the failure event to a student it could not identify', async () => {
    // analytics_events.student_id is NOT NULL. A row pointing at the wrong
    // person is worse than a missing one.
    readRow.mockResolvedValue(null);
    await POST(post({ 'error[code]': 'GATEWAY_ERROR', 'error[metadata][order_id]': 'order_X' }));
    expect(emit).not.toHaveBeenCalled();
  });

  it('survives an unreadable body without a stack trace', async () => {
    const bad = {
      formData: async () => { throw new Error('boom'); },
      nextUrl: { origin: 'https://careerrai.in', searchParams: new URLSearchParams('dest=buddy') },
    } as unknown as NextRequest;
    const res = await POST(bad);
    expect(res.status).toBe(303);
    expect(activate).not.toHaveBeenCalled();
  });
});

describe('the destination cannot be steered', () => {
  it('honours each allow-listed key', async () => {
    for (const [key, path] of [['buddy', '/student/buddy'], ['profile', '/student/profile'], ['home', '/student/home']]) {
      const res = await POST(post({
        razorpay_order_id: 'order_A', razorpay_payment_id: 'pay_A',
        razorpay_signature: sign('order_A', 'pay_A'),
      }, key));
      expect(res.headers.get('location')).toBe(`https://careerrai.in${path}?pay=paid`);
    }
  });

  it('refuses to redirect off-site whatever the query string says', async () => {
    for (const evil of ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)']) {
      const res = await POST(post({
        razorpay_order_id: 'order_A', razorpay_payment_id: 'pay_A',
        razorpay_signature: sign('order_A', 'pay_A'),
      }, encodeURIComponent(evil)));
      const loc = res.headers.get('location')!;
      expect(loc.startsWith('https://careerrai.in/student/'), `${evil} escaped as ${loc}`).toBe(true);
      expect(loc).not.toContain('evil.com');
    }
  });
});

describe('THE ORIGINAL FAILURE: 405 is now impossible', () => {
  it('the route answers POST — the method Razorpay actually uses', async () => {
    // The whole incident: callback_url pointed at /student/buddy, an App Router
    // PAGE. Pages serve GET only; Next returns 405 to everything else. Students
    // paid and met a Method Not Allowed error. A route that exports POST cannot
    // produce that, and this test fails the moment POST stops being exported.
    expect(typeof POST).toBe('function');
    const res = await POST(post({
      razorpay_order_id: 'order_A', razorpay_payment_id: 'pay_A',
      razorpay_signature: sign('order_A', 'pay_A'),
    }));
    expect(res.status).not.toBe(405);
    expect([301, 302, 303, 307, 308]).toContain(res.status);
  });

  it('even a stray GET redirects instead of erroring', async () => {
    const res = await GET({
      nextUrl: { origin: 'https://careerrai.in', searchParams: new URLSearchParams('dest=buddy') },
    } as unknown as NextRequest);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('pay=unverified');
  });
});
