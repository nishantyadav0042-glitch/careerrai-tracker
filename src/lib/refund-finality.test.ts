import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mayActivatePayment, activatePaidOrder } from './activate-payment';
import { vi } from 'vitest';

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


// ── THE RACE THE PREDICATE CANNOT CLOSE ─────────────────────────────────────
//
// Found in the release audit on 84c2be3 and REPRODUCED against the real
// function before being fixed:
//
//   1 captured + activated   payment=paid,     subscription=active
//   2 refunded               payment=refunded, subscription=free
//   3 activate_payment()     payment=PAID,     subscription=ACTIVE
//                            refunded_at still set → a row claiming both
//
// mayActivatePayment() is evaluated against a row read several statements
// earlier. A refund landing in that window passes a guard computed on stale
// data. Check-then-act is not a guard; it is a race with good intentions.
//
// So the precondition moved into the WRITE, on both paths:
//   subscription → activate_payment() takes SELECT ... FOR UPDATE and returns
//                  on 'refunded' (migration 20260828c)
//   session      → the update filters `.in('status', ['created','failed'])`
//                  and reads back the affected rows
describe('the session path lets the DATABASE decide, not a stale read', () => {
  const sessionRow = {
    id: 'p1', student_id: 's1', plan: 'session', status: 'created', amount: 39900,
  };

  /** Minimal client: records calls, answers per (table, op). */
  function client(handlers: Record<string, () => { data: unknown; error: unknown }>) {
    const calls: string[] = [];
    const chain = (table: string) => {
      const st = { op: 'select' };
      const c: Record<string, unknown> = {};
      for (const op of ['insert', 'update', 'upsert', 'delete']) {
        c[op] = () => { st.op = op; return c; };
      }
      for (const m of ['eq', 'in', 'is', 'not', 'select', 'maybeSingle', 'single', 'order', 'limit']) {
        c[m] = () => c;
      }
      (c as { then: unknown }).then = (ok: (r: unknown) => unknown) => {
        const key = `${table}.${st.op}`;
        calls.push(key);
        return Promise.resolve(handlers[key] ? handlers[key]() : { data: null, error: null }).then(ok);
      };
      return c;
    };
    return { from: (t: string) => chain(t), rpc: async () => ({ data: null, error: null }), calls };
  }

  it('a refund landing mid-activation mints NOTHING', async () => {
    // The update moves no rows (its status filter excludes 'refunded'), and the
    // re-read says why. No credit, no premium, and a 200 so Razorpay stops.
    const db = client({
      'student_payments.update': () => ({ data: [], error: null }),
      'student_payments.select': () => ({ data: { status: 'refunded' }, error: null }),
    });
    const ok = await activatePaidOrder(db as never, { ...sessionRow } as never, 'ord1', 'pay1', 'webhook');
    expect(ok, 'a refused replay is a no-op, not a 500').toBe(true);
    expect(db.calls, 'no credit may be minted for a refunded payment')
      .not.toContain('session_credits.insert');
  });

  it('but a retry after a FAILED credit insert still mints the credit', async () => {
    // The regression the first version of this fix introduced. Delivery one
    // marked the payment paid and then failed to mint; the retry finds
    // status='paid', moves no rows, and must FALL THROUGH — otherwise the
    // student paid ₹399 for a credit that never existed and the webhook ACKs.
    const db = client({
      'student_payments.update': () => ({ data: [], error: null }),
      'student_payments.select': () => ({ data: { status: 'paid' }, error: null }),
      'session_credits.select': () => ({ data: null, error: null }),
      'session_credits.insert': () => ({ data: [{ id: 'c1' }], error: null }),
    });
    const ok = await activatePaidOrder(db as never, { ...sessionRow, status: 'created' } as never, 'ord1', 'pay1', 'webhook');
    expect(ok).toBe(true);
    expect(db.calls, 'the retry must still create the missing credit')
      .toContain('session_credits.insert');
  });

  it('a row that neither moved nor settled is a 500, not a silent mint', async () => {
    // Added after a mutation survived: replacing the `status !== 'paid'` check
    // with `false` let a stuck row fall through and mint a credit, and no test
    // noticed. The update moved nothing and the row still says 'created' —
    // something else is holding it (a lock, a contended write). Minting on
    // that basis would hand out an entitlement against a payment we have not
    // established. Returning false 500s the webhook so Razorpay redelivers.
    const db = client({
      'student_payments.update': () => ({ data: [], error: null }),
      'student_payments.select': () => ({ data: { status: 'created' }, error: null }),
      'session_credits.select': () => ({ data: null, error: null }),
      'session_credits.insert': () => ({ data: [{ id: 'c1' }], error: null }),
    });
    const ok = await activatePaidOrder(db as never, { ...sessionRow } as never, 'ord1', 'pay1', 'webhook');
    expect(ok, 'an unestablished payment must not ACK').toBe(false);
    expect(db.calls, 'and must not mint an entitlement').not.toContain('session_credits.insert');
  });

  it('a normal first delivery mints exactly one credit', async () => {
    const db = client({
      'student_payments.update': () => ({ data: [{ id: 'p1' }], error: null }),
      'session_credits.select': () => ({ data: null, error: null }),
      'session_credits.insert': () => ({ data: [{ id: 'c1' }], error: null }),
    });
    const ok = await activatePaidOrder(db as never, { ...sessionRow } as never, 'ord1', 'pay1', 'webhook');
    expect(ok).toBe(true);
    expect(db.calls.filter((c) => c === 'session_credits.insert')).toHaveLength(1);
  });

  it('the session update filters on status and reads the affected rows back', () => {
    const src = readFileSync('src/lib/activate-payment.ts', 'utf8');
    const body = src.slice(src.indexOf('async function activateSessionCredit'));
    const upd = body.slice(body.indexOf(".from('student_payments')"), body.indexOf(".from('student_payments')") + 500);
    expect(upd, 'the status precondition is what makes this atomic')
      .toMatch(/\.in\('status',\s*\['created',\s*'failed'\]\)/);
    expect(upd, 'without .select() a no-op and a success are indistinguishable')
      .toMatch(/\.select\('id'\)/);
  });
});

describe('the migration puts the guard in the write', () => {
  const sql = readFileSync('supabase/migrations/20260828c_activation_is_refund_final.sql', 'utf8');

  it('activate_payment takes a row lock', () => {
    // The lock is what serialises against settleRefund's own UPDATE. Without
    // it the function is still check-then-act, just in SQL.
    expect(sql).toMatch(/for update/i);
  });

  it('and returns before touching profiles when the payment is refunded', () => {
    const guardAt = sql.search(/if v_status = 'refunded' then/);
    const profilesAt = sql.indexOf('update profiles');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt, 'premium was restored even when the payment row refused to move')
      .toBeLessThan(profilesAt);
  });
});
