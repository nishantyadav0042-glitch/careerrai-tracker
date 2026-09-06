import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Phase 5: paying for one product can never grant another's entitlement ──
//
// Founder rule (20 Aug): all three price points must be independently
// reliable. The sharpest failure available here is a CROSS-GRANT — a ₹299
// session buyer waking up premium (we would give away the subscription we
// are trying to sell), or a ₹999/₹2,999 subscriber getting only a session
// credit (they paid and did not get what they bought).
//
// activatePaidOrder forks on row.plan exactly once. These tests drive the
// REAL module with a fake admin client and assert on which side of that
// fork the write actually landed — not on the shape of the source.

const grantPremiumAndQueueBuddy = vi.fn(async () => {});
vi.mock('@/lib/premium', () => ({ grantPremiumAndQueueBuddy }));
vi.mock('@/lib/security-log', () => ({ logSecurityEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/os/timeline', () => ({ emitTimeline: vi.fn(async () => {}) }));
vi.mock('@/lib/meta-capi', () => ({ sendMetaCapiEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
// dispatch() (session_booked's real transport, added 3 Sep) makes its own
// real admin client via the mocked createAdminClient() above, which returns
// undefined here — so it must be stubbed independently, same as every other
// activation side effect this file isn't testing.
vi.mock('@/lib/notification-os', () => ({ dispatch: vi.fn(async () => 'sent') }));

const { activatePaidOrder } = await import('./activate-payment');
const { SESSION_PLAN_ID } = await import('./session-credit');

/** Records every table touched, so a cross-grant is visible as a write.
 *  `existingCredit` simulates a second webhook delivery (the credit is
 *  already there), which the module detects via select().eq().maybeSingle(). */
function fakeAdmin(opts: { existingCredit?: boolean; paymentStatus?: string } = {}) {
  const inserts: Record<string, unknown[]> = {};
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];

  // The session path settles the payment with a CONDITIONAL update
  // (`.in('status', ['created','failed'])`) and reads the affected rows back,
  // so that a refund landing mid-activation moves nothing. This fake models
  // that: `moved` is empty when the row is not in an activatable state, and
  // the follow-up status read then says why. Before the 84c2be3 audit it
  // returned a bare `{ error: null }` with no rows, which is a shape the real
  // client never produces.
  const status = opts.paymentStatus ?? 'created';
  const activatable = status === 'created' || status === 'failed';

  function chainFor(table: string) {
    let op: 'select' | 'update' = 'select';
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      is: () => chain,
      maybeSingle: async () => ({
        data: table === 'session_credits'
          ? (opts.existingCredit ? { id: 'c1' } : null)
          : table === 'student_payments' ? { status } : null,
      }),
      // session_booked's own confirmation reads profiles.notif_prefs with
      // .single() rather than .maybeSingle() — the same call shape
      // grantPremiumAndQueueBuddy already uses for the identical read on the
      // subscription path (lib/premium.ts), mirrored here on purpose.
      single: async () => ({ data: table === 'profiles' ? { notif_prefs: {} } : null }),
      insert: async (v: unknown) => { (inserts[table] ??= []).push(v); return { error: null }; },
      update: () => { op = 'update'; return chain; },
      then: (res: (v: { data: unknown; error: null }) => void) =>
        res(op === 'update' && table === 'student_payments'
          ? { data: activatable ? [{ id: 'p1' }] : [], error: null }
          : { data: null, error: null }),
    };
    return chain;
  }

  return {
    inserts, rpcs,
    rpc: async (fn: string, args: Record<string, unknown>) => { rpcs.push({ fn, args }); return { error: null }; },
    from: (table: string) => chainFor(table),
  };
}

beforeEach(() => { grantPremiumAndQueueBuddy.mockClear(); });

const SUBSCRIPTIONS = [
  { plan: 'monthly', amount: 99900 },
  { plan: 'tillcat', amount: 299900 },
];

describe('a ₹299 session never becomes a subscription', () => {
  it('mints a session credit and does NOT grant premium', async () => {
    const admin = fakeAdmin();
    const ok = await activatePaidOrder(
      admin as never,
      { id: 'p1', student_id: 's1', plan: SESSION_PLAN_ID, amount: 29900 },
      'order_1', 'pay_1', 'webhook',
    );

    expect(ok).toBe(true);
    expect(admin.inserts.session_credits).toHaveLength(1);
    // The whole point: the subscription entitlement must not fire.
    expect(grantPremiumAndQueueBuddy).not.toHaveBeenCalled();
    expect(admin.rpcs.find((r) => r.fn === 'activate_payment')).toBeUndefined();
  });

  it('a REFUNDED session payment mints nothing at all', async () => {
    // Added in the 84c2be3 release audit. This suite exists to prove a ₹399
    // session never becomes a subscription — and it had no case for the state
    // that matters most once refunds became real: a replayed capture after the
    // money went back. The conditional update moves no row, the status read
    // says 'refunded', and nothing is minted.
    const admin = fakeAdmin({ paymentStatus: 'refunded' });
    const ok = await activatePaidOrder(
      admin as never,
      { id: 'p1', student_id: 's1', plan: SESSION_PLAN_ID, amount: 39900, status: 'created' },
      'order_1', 'pay_1', 'webhook',
    );
    expect(ok, 'a refused replay is a no-op, not a 500').toBe(true);
    expect(admin.inserts.session_credits ?? [], 'no credit for a refunded payment').toHaveLength(0);
    expect(grantPremiumAndQueueBuddy).not.toHaveBeenCalled();
  });

  it('a second delivery mints no second credit', async () => {
    const admin = fakeAdmin({ existingCredit: true, paymentStatus: 'paid' });
    await activatePaidOrder(
      admin as never,
      { id: 'p1', student_id: 's1', plan: SESSION_PLAN_ID, amount: 29900 },
      'order_1', 'pay_1', 'webhook',
    );
    expect(admin.inserts.session_credits ?? []).toHaveLength(0);
    expect(grantPremiumAndQueueBuddy).not.toHaveBeenCalled();
  });
});

describe('a subscription never becomes a mere session', () => {
  it.each(SUBSCRIPTIONS)('$plan grants premium and mints no session credit', async ({ plan, amount }) => {
    const admin = fakeAdmin();
    const ok = await activatePaidOrder(
      admin as never,
      { id: 'p2', student_id: 's2', plan, amount },
      'order_2', 'pay_2', 'webhook',
    );

    expect(ok).toBe(true);
    expect(grantPremiumAndQueueBuddy).toHaveBeenCalledWith(admin, 's2');
    expect(admin.inserts.session_credits ?? []).toHaveLength(0);

    // Wrong-plan guard: the plan that reaches the DB is the plan on the
    // payment row — never a default, never another product's id.
    const call = admin.rpcs.find((r) => r.fn === 'activate_payment');
    expect(call?.args.p_plan).toBe(plan);
    expect(call?.args.p_plan).not.toBe(SESSION_PLAN_ID);
    expect(call?.args.p_payment_id).toBe('p2');
    expect(call?.args.p_student_id).toBe('s2');
  });

  it('an unknown plan id cannot silently borrow another plan’s duration', async () => {
    const admin = fakeAdmin();
    await activatePaidOrder(
      admin as never,
      { id: 'p3', student_id: 's3', plan: 'not_a_plan', amount: 99900 },
      'order_3', 'pay_3', 'webhook',
    );
    const call = admin.rpcs.find((r) => r.fn === 'activate_payment');
    // It falls back to ONE month — the shortest, never till-CAT. A garbled
    // plan must under-grant, not over-grant.
    const renews = new Date(String(call?.args.p_renews_at)).getTime();
    const twoMonths = Date.now() + 62 * 86_400_000;
    expect(renews).toBeLessThan(twoMonths);
  });
});
