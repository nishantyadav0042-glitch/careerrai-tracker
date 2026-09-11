import { describe, it, expect } from 'vitest';
import { recordConversion } from './sales-earnings';

// ── A TEST PURCHASE IS NOT A SALE ───────────────────────────────────────────
//
// 5 Sep 2026. Two rows existed in sales_conversions. One of them was the
// founder's own ₹399 session, bought on a phone-signup account to check that
// checkout worked and refunded twelve hours later. That account happened to
// sit in a counsellor's book, so `recordConversion` credited her — and it was
// the ONLY conversion she had, so the sales screen reported one sale for a rep
// who had made none.
//
// The "real student" rule already existed and is what every student count uses
// (getRealStudents): role student, not a test account, not a demo. Attribution
// was the one place that never asked.
//
// These drive a fake admin so a regression fails here rather than on a payslip.

function fakeAdmin(payer: Record<string, unknown> | null) {
  const inserts: Array<Record<string, unknown>> = [];
  return {
    inserts,
    admin: {
      from(table: string) {
        if (table === 'lead_outreach') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: { owner_id: 'rep-1' }, error: null }) }),
            }),
          };
        }
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: payer, error: null }) }),
            }),
          };
        }
        if (table === 'sales_conversions') {
          return {
            upsert: (row: Record<string, unknown>) => {
              inserts.push(row);
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    },
  };
}

const args = {
  paymentId: 'pay-1', studentId: 'stu-1', amountPaise: 39900, plan: 'session',
  realisedAt: '2026-09-04T15:02:45.982Z',
};

describe('a conversion is only credited for a real student', () => {
  it('credits the rep for an ordinary student', async () => {
    const { admin, inserts } = fakeAdmin({ role: 'student', is_test_account: false, is_demo: false });
    await recordConversion(admin, args);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].rep_id).toBe('rep-1');
  });

  it('credits nobody for a test account — the 4 Sep ₹399 case', async () => {
    const { admin, inserts } = fakeAdmin({ role: 'student', is_test_account: true, is_demo: false });
    await recordConversion(admin, args);
    expect(inserts).toHaveLength(0);
  });

  it('credits nobody for a demo account', async () => {
    const { admin, inserts } = fakeAdmin({ role: 'student', is_test_account: false, is_demo: true });
    await recordConversion(admin, args);
    expect(inserts).toHaveLength(0);
  });

  it('credits nobody when the payer is staff rather than a student', async () => {
    const { admin, inserts } = fakeAdmin({ role: 'buddy', is_test_account: false, is_demo: false });
    await recordConversion(admin, args);
    expect(inserts).toHaveLength(0);
  });

  it('credits nobody when the payer profile cannot be found', async () => {
    // An unreadable payer is not evidence of a sale. Guessing here is exactly
    // how the original bug paid an incentive on a transaction nobody made.
    const { admin, inserts } = fakeAdmin(null);
    await recordConversion(admin, args);
    expect(inserts).toHaveLength(0);
  });

  it('never throws — a payment that already succeeded must not 500 on bookkeeping', async () => {
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.reject(new Error('boom')) }) }),
      }),
    };
    await expect(recordConversion(admin, args)).resolves.toBeUndefined();
  });
});
