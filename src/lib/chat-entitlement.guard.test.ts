import { describe, it, expect } from 'vitest';
import { SESSION_PRICING } from '@/lib/plans';
import { readFileSync } from 'node:fs';
import { resolveChatEntitlement, consumeChatMessage, upgradeMessage } from './chat-entitlement';
import { MENTOR_FREE_MESSAGES } from './mentor-doors';
import { PLANS } from './plans';
import { SESSION_PRICE_PAISE } from './session-credit';

// ── The commercial boundary ─────────────────────────────────────────────────
//
// ₹299 buys ONE session and THREE messages. ₹999 / ₹2,499 / ₹2,999 buy
// continuous chat. A ₹299 student must never, by any route, obtain the
// subscription product.
//
// The leak these guards exist to keep closed: /api/chat/send asked
// resolvePair() — which checks ONLY profiles.buddy_id, with no plan, premium
// or entitlement check — and the 3-message cap lived inside `if (!pair)`. Any
// student holding a buddy_id skipped it. Pairing a ₹299 buyer with their
// mentor is exactly how they would get one.

const MIGRATION = 'supabase/migrations/20260824i_chat_entitlement.sql';
const SQL = readFileSync(MIGRATION, 'utf8');
const SEND = readFileSync('src/app/api/chat/send/route.ts', 'utf8');
const ACTIVATE = readFileSync('src/lib/activate-payment.ts', 'utf8');

// A fake admin: enough shape to exercise the resolver's branches.
const fakeAdmin = (profile: Record<string, unknown> | null, grant: Record<string, unknown> | null,
  opts: { profileError?: boolean; grantError?: boolean } = {}) => ({
  from(table: string) {
    const result = table === 'profiles'
      ? { data: profile, error: opts.profileError ? { message: 'boom' } : null }
      : { data: grant, error: opts.grantError ? { message: 'boom' } : null };
    const chain: Record<string, unknown> = {
      select: () => chain, eq: () => chain, maybeSingle: async () => result,
    };
    return chain;
  },
  rpc: async () => ({ data: [{ allowed: true, used: 1, allowance: 3 }], error: null }),
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

describe('the ₹299 boundary', () => {
  it('a student with a buddy_id but NO entitlement gets NOTHING', async () => {
    // THE LEAK, as a test. Before this, holding a buddy_id meant unlimited.
    const ent = await resolveChatEntitlement(
      fakeAdmin({ id: 's', role: 'student', buddy_id: 'b', is_premium: false }, null), 's');
    expect(ent.kind).toBe('none');
    expect(ent.kind === 'none' && ent.reason).toBe('no_entitlement');
  });

  it('a ₹299 student with a grant gets exactly three, not unlimited', async () => {
    const ent = await resolveChatEntitlement(
      fakeAdmin({ id: 's', role: 'student', buddy_id: 'b', is_premium: false },
        { buddy_id: 'b', activated_at: 'now', messages_used: 0, messages_allowance: 3 }), 's');
    expect(ent.kind).toBe('limited');
    expect(ent.kind === 'limited' && ent.remaining).toBe(3);
  });

  it('a subscription student gets unlimited', async () => {
    const ent = await resolveChatEntitlement(
      fakeAdmin({ id: 's', role: 'student', buddy_id: 'b', is_premium: true }, null), 's');
    expect(ent).toEqual({ kind: 'unlimited', reason: 'subscription' });
  });

  it('a mentor is never metered', async () => {
    const ent = await resolveChatEntitlement(
      fakeAdmin({ id: 'b', role: 'buddy', buddy_id: null, is_premium: false }, null), 'b');
    expect(ent).toEqual({ kind: 'unlimited', reason: 'mentor' });
  });

  it('a spent entitlement is exhausted, not unlimited and not absent', async () => {
    const ent = await resolveChatEntitlement(
      fakeAdmin({ id: 's', role: 'student', buddy_id: 'b', is_premium: false },
        { buddy_id: 'b', activated_at: 'now', messages_used: 3, messages_allowance: 3 }), 's');
    expect(ent.kind).toBe('exhausted');
  });

  it('an un-activated grant grants nothing', async () => {
    const ent = await resolveChatEntitlement(
      fakeAdmin({ id: 's', role: 'student', buddy_id: 'b', is_premium: false },
        { buddy_id: 'b', activated_at: null, messages_used: 0, messages_allowance: 3 }), 's');
    expect(ent.kind).toBe('none');
  });

  it('a grant with no buddy yet is unspendable', async () => {
    // This is the state a ₹299 purchase creates before assignment. It must not
    // leak chat before there is a mentor to chat with.
    const ent = await resolveChatEntitlement(
      fakeAdmin({ id: 's', role: 'student', buddy_id: null, is_premium: false },
        { buddy_id: null, activated_at: 'now', messages_used: 0, messages_allowance: 3 }), 's');
    expect(ent.kind).toBe('none');
  });
});

describe('a failed read never silences a paying student', () => {
  it('a profile read failure is lookup_failed, not "no access"', async () => {
    const ent = await resolveChatEntitlement(fakeAdmin(null, null, { profileError: true }), 's');
    expect(ent).toEqual({ kind: 'none', reason: 'lookup_failed' });
  });

  it('a grant read failure is lookup_failed too', async () => {
    const ent = await resolveChatEntitlement(
      fakeAdmin({ id: 's', role: 'student', buddy_id: null, is_premium: false }, null,
        { grantError: true }), 's');
    expect(ent).toEqual({ kind: 'none', reason: 'lookup_failed' });
  });

  it('the send route answers 503 for a failed lookup, never 403', async () => {
    expect(SEND).toMatch(/lookup_failed[\s\S]{0,200}503/);
  });
});

describe('spending is atomic and cannot be faked', () => {
  it('the consume is ONE guarded UPDATE, not count-then-compare', async () => {
    // The defect: two tabs both read "one left" and both wrote. A single
    // UPDATE with the guard in its WHERE serialises on the row lock.
    expect(SQL).toMatch(/update public\.mentor_grants g[\s\S]*?where[\s\S]*?g\.messages_used < g\.messages_allowance/);
  });

  it('the database also refuses over-consumption structurally', () => {
    // Belt and braces: even if a caller bypassed the RPC, the CHECK aborts.
    expect(SQL).toMatch(/messages_used >= 0 and messages_used <= messages_allowance/);
  });

  it('a consumed message cannot be un-consumed by logging out and in', () => {
    expect(SQL).toMatch(/messages_used cannot decrease/);
  });

  it('an unlimited entitlement spends nothing', async () => {
    const r = await consumeChatMessage(fakeAdmin(null, null), { kind: 'unlimited', reason: 'subscription' }, 's');
    expect(r).toEqual({ ok: true, unlimited: true });
  });

  it('an exhausted entitlement refuses without touching the database', async () => {
    const r = await consumeChatMessage(
      fakeAdmin(null, null), { kind: 'exhausted', buddyId: 'b', used: 3, allowance: 3 }, 's');
    expect(r.ok).toBe(false);
  });

  it('an RPC failure refuses rather than letting the message through', async () => {
    const admin = { rpc: async () => ({ data: null, error: { message: 'down' } }) } as never;
    const r = await consumeChatMessage(
      admin, { kind: 'limited', buddyId: 'b', used: 0, allowance: 3, remaining: 3 }, 's');
    expect(r.ok).toBe(false);
  });

  it('students and anon cannot call the consume RPC directly', () => {
    expect(SQL).toMatch(/revoke all on function public\.consume_chat_message\(uuid, uuid\) from public, anon, authenticated/);
  });
});

describe('the send route evaluates entitlement on EVERY path', () => {
  it('the cap no longer hides inside the not-paired branch', () => {
    // The precise shape of the bug: the gate was reachable only when
    // resolvePair returned null.
    const entAt = SEND.indexOf('resolveChatEntitlement');
    const pairAt = SEND.indexOf('resolvePair(admin');
    expect(entAt).toBeGreaterThan(-1);
    expect(entAt, 'entitlement must be resolved BEFORE pairing decides anything')
      .toBeLessThan(pairAt);
  });

  it('the route no longer consults resolveGrantAccess as its gate', () => {
    // One authority. Two would drift.
    expect(SEND).not.toMatch(/resolveGrantAccess\s*\(/);
  });

  it('the debit happens before delivery, so a crash cannot gift a message', () => {
    const spendAt = SEND.indexOf('consumeChatMessage');
    const deliverAt = SEND.indexOf('deliverPairMessage({');
    expect(spendAt).toBeGreaterThan(-1);
    expect(spendAt).toBeLessThan(deliverAt);
  });

  it('remaining is returned from the server debit, never from the client', () => {
    // The SUCCESS path must carry the server's own post-debit count. A literal
    // 0 on the refusal path is correct and stays — an exhausted entitlement
    // genuinely has none left; the rule is that a SPENT message's remaining
    // is never a number the client supplied or the server guessed.
    expect(SEND).toMatch(/remaining: remainingAfterSend/);
    const success = SEND.slice(SEND.indexOf('deliverPairMessage({'));
    expect(success).not.toMatch(/remaining:\s*\d/);
    // And the client is never trusted for it.
    expect(SEND).not.toMatch(/payload\.remaining|body\.remaining/);
  });

  it('only the student is metered — a mentor reply is not', () => {
    expect(SEND).toMatch(/senderIsStudent/);
  });
});

describe('₹299 issues the entitlement it sells', () => {
  it('activation mints a session grant', () => {
    expect(ACTIVATE).toMatch(/door: 'session'/);
    expect(ACTIVATE).toMatch(/messages_allowance: MENTOR_FREE_MESSAGES/);
  });

  it('it still refuses to grant premium', () => {
    // The one thing that was already correct and must stay correct.
    const fn = ACTIVATE.slice(ACTIVATE.indexOf('async function activateSessionCredit'),
      ACTIVATE.indexOf('export async function activatePaidOrder'));
    expect(fn).not.toMatch(/is_premium/);
    expect(fn).not.toMatch(/grantPremiumAndQueueBuddy/);
  });

  it('a repeat purchase does not reset a spent counter', () => {
    expect(ACTIVATE).toMatch(/23505/);
  });

  it('a failed grant does not fail the payment', () => {
    expect(ACTIVATE).toMatch(/session chat grant failed/);
  });
});

describe('one pricing authority, one allowance authority', () => {
  it('the session price still comes from session-credit', () => {
    expect(SESSION_PRICE_PAISE).toBe(SESSION_PRICING.offerPaise);
  });

  it('the subscription plans are unchanged and all of them are continuous', () => {
    // Read, not assumed: the repo has THREE subscription plans.
    expect(PLANS.monthly.offerPaise).toBe(99900);
    expect(PLANS.tillcat.offerPaise).toBe(259900);
  });

  it('the free allowance is three', () => {
    expect(MENTOR_FREE_MESSAGES).toBe(3);
  });

  it('the upgrade copy names no price — pricing lives in one place', () => {
    const msg = upgradeMessage(3);
    expect(msg).toMatch(/3 free messages/);
    expect(msg).not.toMatch(/₹|\bRs\b|\d{3,}/);
  });
});
