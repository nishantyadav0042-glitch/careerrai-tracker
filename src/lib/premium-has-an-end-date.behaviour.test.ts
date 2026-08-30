import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── PREMIUM MUST HAVE AN END DATE ──────────────────────────────────────────
//
// Founder, 30 Aug: only people who paid get a renewal, and nobody keeps access
// or mentor chat past what they paid for.
//
// The gap this closes: grantPremiumAndQueueBuddy sets is_premium but NOT
// subscription_status / subscription_renews_at — its callers do. A grant that
// ran without its caller's subscription write leaves is_premium=true, status
// 'free', renews_at NULL. Sweep 1 only looks at rows already 'active' with a
// past date, so it can never see that shape: access with no end date and no way
// to end it. resolveChatEntitlement returns UNLIMITED on is_premium alone, so a
// single-session buyer was holding the subscription product.
//
// These call the real POST handler and assert what it DID to the rows.

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  profiles: [] as Row[],
  updates: [] as { ids: string[]; values: Row }[],
}));

vi.mock('@/lib/cron-auth', () => ({ authorizedCron: () => true }));
vi.mock('@/lib/cron-run-tracker', () => ({
  withCronTracking: async (_p: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('@/lib/notification-os', () => ({ dispatch: async () => {} }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const state: { ids: string[]; values: Row; premiumOnly: boolean; activeOnly: boolean } = {
        ids: [], values: {}, premiumOnly: false, activeOnly: false,
      };
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          if (col === 'is_premium' && val === true) state.premiumOnly = true;
          if (col === 'subscription_status' && val === 'active') state.activeOnly = true;
          return chain;
        },
        lt: () => { state.activeOnly = true; return chain; },
        update: (values: Row) => { state.values = values; return chain; },
        in: async (_col: string, ids: string[]) => {
          if (table === 'profiles') db.updates.push({ ids, values: state.values });
          return { error: null };
        },
        then: (res: (v: unknown) => void) => {
          if (table !== 'profiles') return res({ data: [], error: null });
          const rows = state.premiumOnly
            ? db.profiles.filter((r) => r.is_premium === true)
            : db.profiles.filter((r) => r.subscription_status === 'active' && r.lapsed === true);
          return res({ data: rows, error: null });
        },
      });
      return chain;
    },
  }),
}));

import { POST } from '@/app/api/cron/expire-subscriptions/route';

const req = () => ({ headers: new Headers(), url: 'https://careerrai.in/api/cron/expire-subscriptions' }) as never;
const revokedIds = () =>
  db.updates.filter((u) => u.values.is_premium === false && !('subscription_status' in u.values))
    .flatMap((u) => u.ids);

beforeEach(() => { db.profiles = []; db.updates = []; });

describe('premium with no paid window is revoked', () => {
  // Dhruv Vakadia's real shape: a single-session buyer holding unlimited chat.
  it('revokes a session buyer who was never on a subscription', async () => {
    db.profiles = [{ id: 'session-buyer', is_premium: true, subscription_status: 'free' }];
    await POST(req());
    expect(revokedIds()).toContain('session-buyer');
  });

  it('revokes someone flagged premium who never paid at all', async () => {
    db.profiles = [{ id: 'never-paid', is_premium: true, subscription_status: 'free' }];
    await POST(req());
    expect(revokedIds()).toContain('never-paid');
  });

  it('leaves a real active subscriber alone', async () => {
    db.profiles = [{ id: 'paying', is_premium: true, subscription_status: 'active' }];
    await POST(req());
    expect(revokedIds()).not.toContain('paying');
  });

  // THE ONE THAT MATTERS MOST. `.eq('is_test_account', false)` in PostgREST
  // drops NULL rows, so pushing this filter into the query would have swept
  // Apple's reviewer login — and failed the next iOS submission on an account
  // that silently lost access.
  it('never revokes the App Store reviewer or the demo login', async () => {
    db.profiles = [
      { id: 'appreview', is_premium: true, subscription_status: 'free', is_test_account: true },
      { id: 'buddydemo', is_premium: true, subscription_status: 'active', is_demo: true },
      { id: 'demo-unbacked', is_premium: true, subscription_status: 'free', is_demo: true },
    ];
    await POST(req());
    for (const id of ['appreview', 'buddydemo', 'demo-unbacked']) {
      expect(revokedIds(), `${id} was swept`).not.toContain(id);
    }
  });

  it('treats a NULL test/demo flag as a real student, not an exemption', async () => {
    db.profiles = [{ id: 'real', is_premium: true, subscription_status: 'free', is_test_account: null, is_demo: null }];
    await POST(req());
    expect(revokedIds()).toContain('real');
  });

  // The old code returned early when nothing had lapsed, which is almost every
  // day — the net would then have run only on the rare day a plan ended.
  it('runs even when no subscription lapsed today', async () => {
    db.profiles = [{ id: 'unbacked', is_premium: true, subscription_status: 'free' }];
    const res = await POST(req());
    const body = await res.json();
    expect(body.expired).toBe(0);
    expect(body.revoked).toBe(1);
  });

  it('writes nothing when every premium account is backed', async () => {
    db.profiles = [{ id: 'paying', is_premium: true, subscription_status: 'active' }];
    const res = await POST(req());
    expect((await res.json()).revoked).toBe(0);
    expect(revokedIds()).toEqual([]);
  });
});
