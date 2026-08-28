import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mayActivatePayment } from './activate-payment';

// ── A REFUND IS FINAL ───────────────────────────────────────────────────────
//
// Found on 28 Aug 2026 auditing the refund fix made the same day, BEFORE it
// could reach a real refund.
//
// The refund fix made the webhook write `status = 'refunded'`. Correct on its
// own. But both activation entry points guarded activation with
// `row.status !== 'paid'`, and while a refunded payment wrongly kept
// status='paid' FOREVER, that guard had also been — entirely by accident —
// the thing preventing re-activation after a refund.
//
// Writing the correct status removed the accidental protection:
//
//   student pays  →  refund processed (status='refunded', premium revoked)
//                 →  Razorpay redelivers payment.captured
//                 →  'refunded' !== 'paid'  →  guard passes
//                 →  activatePaidOrder runs again
//                 →  status back to 'paid' beside a non-null refunded_at,
//                    premium handed back to a refunded student
//
// Razorpay retries an unacknowledged webhook for hours, which comfortably
// spans a same-day refund, so this is an ordinary sequence rather than an
// exotic one. It is the classic shape: fixing a bug removed a protection that
// nobody knew the bug was providing.

describe('the activation predicate', () => {
  it('refuses a refunded payment', () => {
    expect(mayActivatePayment('refunded')).toBe(false);
  });

  it('refuses an already-paid payment — duplicate delivery', () => {
    expect(mayActivatePayment('paid')).toBe(false);
  });

  it('allows a created payment', () => {
    expect(mayActivatePayment('created')).toBe(true);
  });

  it('allows a failed payment — a late capture is legitimate', () => {
    // reconcile-payments marks a stale 'created' row 'failed'. If Razorpay
    // later says it captured, the student paid and must be unlocked.
    expect(mayActivatePayment('failed')).toBe(true);
  });

  it('allows an ABSENT status — reconcile-payments filters in the query', () => {
    // It selects its rows without the status column and filters
    // `.eq('status','created')`. Absent there means 'created', not "unsafe".
    expect(mayActivatePayment(undefined)).toBe(true);
    expect(mayActivatePayment(null)).toBe(true);
  });
});

describe('every activation path is guarded by the one predicate', () => {
  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const authority = strip(readFileSync('src/lib/activate-payment.ts', 'utf8'));
  const webhook = strip(readFileSync('src/app/api/payments/webhook/route.ts', 'utf8'));
  const callback = strip(readFileSync('src/app/api/payments/callback/route.ts', 'utf8'));

  it('activatePaidOrder refuses non-activatable rows itself', () => {
    // The load-bearing one. Both call sites independently wrote the same
    // wrong guard; a rule every caller must remember is one the third caller
    // forgets. Here it cannot be forgotten.
    const body = authority.slice(authority.indexOf('export async function activatePaidOrder'));
    expect(body).toMatch(/if\s*\(!mayActivatePayment\(row\.status\)\)/);
  });

  it('the refusal happens BEFORE any money or entitlement is touched', () => {
    const body = authority.slice(authority.indexOf('export async function activatePaidOrder'));
    const guardAt = body.indexOf('mayActivatePayment');
    const conversionAt = body.indexOf('recordConversion');
    const sessionAt = body.indexOf('activateSessionCredit');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt, 'the guard must precede attribution').toBeLessThan(conversionAt);
    expect(guardAt, 'the guard must precede the session-credit branch').toBeLessThan(sessionAt);
  });

  it('neither entry point still compares status to the bare string paid', () => {
    // The exact defect. `row.status !== 'paid'` reads as "not yet activated"
    // and silently means "including refunded".
    for (const [name, src] of [['webhook', webhook], ['callback', callback]] as const) {
      expect(src, `${name} still guards on a bare !== 'paid'`).not.toMatch(/status\s*!==\s*['"]paid['"]/);
      expect(src, `${name} must use the shared predicate`).toMatch(/mayActivatePayment\(/);
    }
  });

  it('a refused activation is a no-op, never a 500', () => {
    // Returning false would 500 the webhook and make Razorpay redeliver the
    // same impossible event indefinitely.
    const body = authority.slice(authority.indexOf('export async function activatePaidOrder'));
    const guard = body.slice(body.indexOf('if (!mayActivatePayment'), body.indexOf('if (!mayActivatePayment') + 400);
    expect(guard).toMatch(/return true;/);
  });
});
