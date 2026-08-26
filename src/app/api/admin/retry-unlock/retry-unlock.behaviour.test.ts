import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ── THE ₹299 → PREMIUM DOOR, EXECUTED ───────────────────────────────────────
//
// A guard that greps this route for the word `isPlanId` would have passed on
// the broken version too, because the broken version imported nothing and the
// grep would simply have been written later. These tests DRIVE the handler and
// assert what it did: whether grantPremiumAndQueueBuddy — the single writer of
// is_premium in the entire codebase — was called.
//
// The failure being pinned is not hypothetical. Dhruv Vakadia and Nishant hold
// unlimited buddy chat in production today because a ₹299 session payment was
// repaired through this route, which checked `status` and never `plan`.

/* eslint-disable @typescript-eslint/no-explicit-any */

const grantPremium = vi.hoisted(() => vi.fn(async () => {}));
const getUser = vi.hoisted(() => vi.fn());

let payment: any;
let profileRole: string;
let premiumBefore: boolean;   // what the route reads BEFORE granting
let premiumAfter: boolean;    // what it reads back afterwards
let premiumReads: number;

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));
vi.mock('@/lib/premium', () => ({ grantPremiumAndQueueBuddy: grantPremium }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/os/timeline', () => ({ emitTimeline: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const chain: any = {};
      for (const m of ['select', 'eq', 'update', 'insert']) chain[m] = () => chain;
      if (table === 'student_payments') {
        chain.maybeSingle = async () => ({ data: payment });
        chain.single = async () => ({ data: payment });
      } else {
        // profiles: the role read uses .single(), the is_premium reads .maybeSingle()
        chain.single = async () => ({ data: { role: profileRole } });
        // The route reads is_premium twice — once to decide whether there is
        // anything to do, once to report the outcome. A fake that answers both
        // with one value makes every success case look like "already premium",
        // which is a test bug that hides a real grant.
        chain.maybeSingle = async () => ({
          data: { is_premium: premiumReads++ === 0 ? premiumBefore : premiumAfter },
        });
      }
      return chain;
    },
  }),
}));

import { POST } from './route';

const req = (paymentId = 'pay-row-1') => ({
  json: async () => ({ payment_id: paymentId }),
  cookies: { getAll: () => [] },
}) as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
  profileRole = 'admin';
  premiumBefore = false;
  premiumAfter = false;
  premiumReads = 0;
  payment = { id: 'pay-row-1', student_id: 'stu-1', status: 'paid', amount: 29900, plan: 'session' };
});

describe('a ₹299 session payment can NEVER be unlocked into premium', () => {
  it('refuses the session plan and grants nothing', async () => {
    const res = await POST(req());
    expect(grantPremium).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/not a subscription/i);
  });

  it('says what the admin should do instead, rather than just refusing', async () => {
    // A repair tool that refuses without naming the real repair sends a human
    // looking for another door — which is how the wrong door gets used.
    const body = await (await POST(req())).json();
    expect(body.hint).toMatch(/assign a mentor/i);
  });

  it('refuses ANY non-subscription plan, not just the one we know about', async () => {
    // The check is an allow-list. A future product added to student_payments
    // must be refused here without anyone remembering to edit this route.
    for (const plan of ['session', 'workshop', 'mock_pack', '', 'SESSION', 'premium']) {
      payment = { ...payment, plan };
      const res = await POST(req());
      expect(res.status, `plan "${plan}" was allowed through`).toBe(409);
    }
    expect(grantPremium).not.toHaveBeenCalled();
  });
});

describe('a genuine subscription still unlocks', () => {
  it.each(['monthly', 'quarterly', 'halfyear', 'tillcat'])('%s is repaired as before', async (plan) => {
    payment = { ...payment, plan, amount: 99900 };
    premiumAfter = true;   // the grant landed
    const res = await POST(req());
    expect(grantPremium).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    expect((await res.json()).premium).toBe(true);
  });
});

describe('the older invariants are untouched', () => {
  it('an unpaid row is still refused before the plan is even considered', async () => {
    payment = { ...payment, plan: 'tillcat', status: 'created' };
    const res = await POST(req());
    expect(grantPremium).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/not paid/i);
  });

  it('a non-admin cannot reach the grant at all', async () => {
    profileRole = 'student';
    payment = { ...payment, plan: 'tillcat' };
    const res = await POST(req());
    expect(grantPremium).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
  });

  it('an anonymous caller cannot reach the grant at all', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req());
    expect(grantPremium).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
  });

  it('a student already premium is a no-op, not a second grant', async () => {
    payment = { ...payment, plan: 'tillcat' };
    premiumBefore = true;   // already premium BEFORE the route ran
    const res = await POST(req());
    expect(grantPremium).not.toHaveBeenCalled();
    expect((await res.json()).alreadyPremium).toBe(true);
  });
});
