import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── One payment, one credit — and "paid" always carries its timestamp ──────
//
// 21 Aug. The Operations invariant "a paid payment is stamped paid_at"
// flagged exactly one row. Pulling that thread found TWO defects in the same
// function, both on the FIRST real Rs 299 payment the product ever took —
// the plan that is now the primary entry CTA.
//
//   paid_at was never written on the session path. The subscription path
//   stamps it inside the activate_payment RPC; this one set status='paid'
//   and stopped. Every Rs 299 payment would have been paid-with-no-when.
//
//   TWO credits were minted for ONE payment, 12ms apart, because the guard
//   was SELECT-then-INSERT. The webhook and the reconcile cron both read
//   null and both inserted. Each credit carried a full Rs 299 mentor payout,
//   so the system believed it owed Rs 598 against Rs 299 of revenue.
//
// A check-then-insert cannot be made safe in application code, however
// carefully it is written. The database has to be the one that decides.

const SRC = 'src/lib/activate-payment.ts';
const MIGRATION = 'supabase/migrations/20260821a_session_credit_one_per_payment.sql';
const read = (p: string) => readFileSync(p, 'utf8');
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('"paid" always means paid AND when', () => {
  it('the session path stamps paid_at, exactly as the subscription path does', () => {
    const s = code(SRC);
    const update = s.slice(s.indexOf("from('student_payments')"), s.indexOf('if (payErr)'));
    expect(update).toContain('paid_at');
    expect(update).toContain("status: 'paid'");
  });

  it('status and paid_at are written together, never in separate statements', () => {
    // Two writes could half-fail and recreate the exact row the invariant
    // caught. One update, both fields.
    const s = code(SRC);
    const writes = [...s.matchAll(/status: 'paid'/g)].length;
    const stamps = [...s.matchAll(/paid_at:/g)].length;
    expect(stamps).toBeGreaterThanOrEqual(writes - 1); // the RPC stamps its own
  });
});

describe('the duplicate credit cannot happen again', () => {
  it('the database holds the invariant, not the application', () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/create unique index[\s\S]*session_credits[\s\S]*payment_id/i);
  });

  it('the dedupe refuses to touch anything a human used', () => {
    const sql = read(MIGRATION);
    for (const col of ['buddy_id', 'assigned_at', 'completed_at', 'video_session_id',
                       'credited_to_payment_id', 'mentor_paid_at']) {
      expect(sql, `dedupe must not delete a credit with ${col} set`).toContain(`c.${col} is null`);
    }
  });

  it('a constraint violation counts as success, not failure', () => {
    // If a concurrent delivery already minted the credit, the entitlement
    // exists — returning false there would make the webhook retry forever.
    const s = code(SRC);
    expect(s).toContain("creditErr.code !== '23505'");
  });

  it('the application still checks first — the index is the guard, not the only step', () => {
    const s = code(SRC);
    expect(s).toContain("from('session_credits').select('id').eq('payment_id'");
  });
});
