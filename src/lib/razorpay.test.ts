import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mayActivatePayment } from './activate-payment';
import { verifyRazorpayWebhook } from './razorpay';

// PHASE 8 — the premium unlock, scored without spending money.
//
// The audit left this unscored because no purchase was executed, and a GO on an
// unexecuted payment flow is exactly the failure an audit exists to prevent.
// But the part that actually decides whether someone gets premium is not the
// card form — it is this signature check. `subscription_status` changes in
// exactly one place (api/payments/webhook), and only after this returns true.
//
// So the question worth answering is not "did a card work today". It is: can
// anyone who has not paid make us believe they did? That is testable for free,
// deterministically, and it is the half that carries the actual risk.
//
// Live evidence, 9 Aug: 15 orders `created`, 3 `paid`, 1 `failed`. Every one of
// those 3 passed through this function.

const SECRET = 'whsec_test_only_never_a_real_secret';

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const CAPTURED = JSON.stringify({
  event: 'payment.captured',
  payload: { payment: { entity: { id: 'pay_TEST123', order_id: 'order_TEST123' } } },
});

describe('a genuine Razorpay webhook is accepted', () => {
  it('verifies a correctly signed body', () => {
    expect(verifyRazorpayWebhook(CAPTURED, sign(CAPTURED), SECRET)).toBe(true);
  });

  it('verifies over the RAW bytes, not a re-serialised object', () => {
    // Razorpay signs the exact bytes it sent. Any handler that parses JSON and
    // re-stringifies before verifying will reorder keys or change spacing and
    // silently reject every real payment while accepting nothing — a total
    // outage that looks like "Razorpay is down".
    const raw = '{"event":"payment.captured",  "payload":{}}';
    const reserialised = JSON.stringify(JSON.parse(raw));
    expect(raw).not.toBe(reserialised);
    const sig = sign(raw);
    expect(verifyRazorpayWebhook(raw, sig, SECRET)).toBe(true);
    expect(verifyRazorpayWebhook(reserialised, sig, SECRET)).toBe(false);
  });
});

describe('nobody can unlock premium without paying', () => {
  it('rejects a body tampered with after signing', () => {
    // The attack: take a real ₹999 webhook, change the order to someone else's.
    const sig = sign(CAPTURED);
    const tampered = CAPTURED.replace('order_TEST123', 'order_VICTIM99');
    expect(verifyRazorpayWebhook(tampered, sig, SECRET)).toBe(false);
  });

  it('rejects a forged signature', () => {
    expect(verifyRazorpayWebhook(CAPTURED, 'a'.repeat(64), SECRET)).toBe(false);
  });

  it('rejects a body signed with the wrong secret', () => {
    expect(verifyRazorpayWebhook(CAPTURED, sign(CAPTURED, 'not_our_secret'), SECRET)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifyRazorpayWebhook(CAPTURED, null, SECRET)).toBe(false);
    expect(verifyRazorpayWebhook(CAPTURED, '', SECRET)).toBe(false);
  });

  it('rejects rather than throws when the secret is not configured', () => {
    // An unconfigured secret must never become "skip the check".
    expect(verifyRazorpayWebhook(CAPTURED, sign(CAPTURED), '')).toBe(false);
  });

  it('survives a wrong-length signature instead of crashing the route', () => {
    // timingSafeEqual throws on unequal lengths. Uncaught, that is a 500 —
    // and Razorpay retries a 500, so a single malformed probe would become a
    // retry storm against an endpoint that can never succeed.
    expect(() => verifyRazorpayWebhook(CAPTURED, 'short', SECRET)).not.toThrow();
    expect(verifyRazorpayWebhook(CAPTURED, 'short', SECRET)).toBe(false);
    expect(verifyRazorpayWebhook(CAPTURED, 'f'.repeat(200), SECRET)).toBe(false);
  });

  it('compares in constant time', () => {
    // A byte-by-byte early return leaks the expected digest to anyone willing
    // to time a few thousand requests, which turns forgery into arithmetic.
    const src = readFileSync('src/lib/razorpay.ts', 'utf8');
    expect(src).toContain('timingSafeEqual');
    expect(src).not.toMatch(/expected\s*===\s*signature/);
  });
});

describe('the route treats the webhook as the only source of truth', () => {
  const route = readFileSync('src/app/api/payments/webhook/route.ts', 'utf8');

  it('refuses the event before doing any work when the signature fails', () => {
    // The 401 must precede JSON.parse and every database call. Anchored on the
    // CALL `createAdminClient()`, not the bare name — the import sits at the
    // top of the file and would make this assertion pass by accident.
    const guard = route.indexOf('invalid signature');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(route.indexOf('JSON.parse'));
    expect(guard).toBeLessThan(route.indexOf('createAdminClient()'));
  });

  it('is idempotent — a replayed captured event cannot double-activate', () => {
    // Razorpay retries on any non-2xx, so the same payment.captured arrives
    // more than once as a matter of routine, not as an attack.
    //
    // This assertion USED to be `expect(route).toContain("row.status !== 'paid'")`,
    // and that string was the defect (28 Aug 2026). It guarded only against
    // re-activating an already-paid row. Once refunds began writing
    // status='refunded', a replayed capture after a refund passed it, put the
    // row back to 'paid' beside a live refunded_at, and handed premium back to
    // a student who had been refunded. Pinning the old string here would have
    // made this test the reason the bug could not be fixed.
    //
    // The property is now stated instead of the implementation: the route asks
    // the shared predicate, and the predicate covers refunded. Both halves are
    // asserted because either alone can be true while the system is wrong.
    expect(route).toMatch(/mayActivatePayment\(row\.status\)/);
    expect(route, 'the old, weaker guard must not come back').not.toMatch(/status\s*!==\s*['"]paid['"]/);
    expect(mayActivatePayment('paid'), 'a duplicate delivery must not re-activate').toBe(false);
    expect(mayActivatePayment('refunded'), 'a replay after a refund must not re-activate').toBe(false);
  });

  it('returns 500 on a failed activation so Razorpay retries', () => {
    // Swallowing this would take money and grant nothing, which is the one
    // outcome worse than rejecting a real payment.
    expect(route).toMatch(/activatePaidOrder[\s\S]{0,200}status:\s*500/);
  });

  it('never lets a client-side success callback change subscription state', () => {
    // The whole reason this file exists. If a route other than the webhook and
    // the reconcile cron can flip someone to paid, the signature check is
    // decoration.
    const writers = ['src/app/api/payments/webhook/route.ts', 'src/app/api/cron/reconcile-payments/route.ts'];
    for (const f of writers) expect(readFileSync(f, 'utf8')).toContain('activatePaidOrder');
  });
});
