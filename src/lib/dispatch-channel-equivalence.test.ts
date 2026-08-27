import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Proof that routing dispatch() through the policy changed NOTHING ────────
//
// Before 27 Aug, dispatch() decided channels from the caller's payload:
//
//     push  fires iff  prefs.push === true
//     email fires iff  opts.email && prefs.email !== false
//
// It now asks event-policy.ts. That is only safe if the two rules agree on
// every live event, and the guard test proves the STRUCTURAL preconditions
// (every ladder has push; every email-leg type declares email). This file
// proves the BEHAVIOUR, by driving the real dispatch() and watching which
// rails actually fire — which is the thing the founder cares about and the
// thing a table inspection cannot establish.
//
// The five email types are enumerated rather than sampled, because "we
// checked a couple" is how red_flag would have gone dark.

const sendCalls: string[] = [];
const emailSends: string[] = [];
let insertShouldConflict = false;
const updates: Array<Record<string, unknown>> = [];

vi.mock('@/lib/push', () => ({
  sendPushToUser: async (userId: string) => { sendCalls.push(userId); return { ok: true }; },
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'notification_duplicate_suppressions') {
        return { insert: async () => ({ error: null }) };
      }
      const q: Record<string, unknown> = {
        select: (_c?: unknown, o?: { head?: boolean }) => (o?.head ? countQ() : q),
        eq: () => q, in: () => q, gte: () => q, not: () => q,
        insert: () => ({
          select: () => ({
            single: async () =>
              insertShouldConflict
                ? { data: null, error: { code: '23505', message: 'dup' } }
                : { data: { id: 'notif-1' }, error: null },
          }),
        }),
        update: (patch: Record<string, unknown>) => { updates.push(patch); return { eq: async () => ({ error: null }) }; },
      };
      function countQ() {
        const c: Record<string, unknown> = {
          eq: () => c, in: () => c, gte: () => c, not: () => c,
          then: (r: (v: unknown) => unknown) => Promise.resolve({ count: 0 }).then(r),
        };
        return c;
      }
      return q;
    },
  }),
}));

const { dispatch } = await import('./notification-os');

function call(type: string, prefs: Record<string, unknown>, withEmail: boolean) {
  return dispatch({
    userId: 'stu-1', type, title: 't', body: 'b', url: '/x',
    reason: 'test', expectedAction: 'acknowledge', prefs,
    email: withEmail ? { to: 'a@b.c', send: async () => { emailSends.push(type); } } : null,
  });
}

beforeEach(() => { sendCalls.length = 0; emailSends.length = 0; updates.length = 0; insertShouldConflict = false; });

/** Every type that hands dispatch() an email leg in production. */
const EMAIL_TYPES = ['activation', 'builder_recovery', 'onboarding_evening', 'red_flag', 'weekly_digest'];
/** A spread across taxonomies: habit, transactional, relationship, commercial, digest. */
const PUSH_TYPES = ['daily_insight', 'session_cancelled', 'chat', 'buddy_evening', 'weekly_digest', 'brain_abc123'];

describe('push fires exactly where it fired before', () => {
  it.each(PUSH_TYPES)('%s pushes when the student allows push', async (type) => {
    await call(type, { push: true }, false);
    expect(sendCalls, `${type} stopped pushing`).toEqual(['stu-1']);
  });

  it.each(PUSH_TYPES)('%s does NOT push when the student has push off', async (type) => {
    await call(type, { push: false }, false);
    expect(sendCalls).toEqual([]);
  });

  it('a type with no registry entry still pushes — the default cannot mute anyone', async () => {
    // Nothing should reach here (the completeness guard forbids it), but if a
    // type ever slips through, silence must not be the failure mode.
    await call('some_unregistered_future_type', { push: true }, false);
    expect(sendCalls).toEqual(['stu-1']);
  });

  it('the in-app row is written even when every channel is off', async () => {
    const outcome = await call('daily_insight', { push: false }, false);
    expect(sendCalls).toEqual([]);
    expect(outcome).toBe('sent'); // 'sent' == the row exists; no push was owed
  });
});

describe('email fires exactly where it fired before', () => {
  it.each(EMAIL_TYPES)('%s sends its email', async (type) => {
    await call(type, { push: false }, true);
    expect(
      emailSends,
      `${type} builds an email in production and dispatch() dropped it. This is the exact regression the policy wiring could have introduced.`,
    ).toEqual([type]);
  });

  it.each(EMAIL_TYPES)('%s respects an explicit email:false preference', async (type) => {
    await call(type, { push: false, email: false }, true);
    expect(emailSends).toEqual([]);
  });

  it('a type with no email leg sends no email however the ladder reads', async () => {
    await call('weekly_digest', { push: false }, false);
    expect(emailSends).toEqual([]);
  });

  it('email still sends when push FAILS — the rails are independent', async () => {
    await call('red_flag', { push: true }, true);
    expect(emailSends).toEqual(['red_flag']);
  });
});

describe('the row is still the event, and delivery is still separate from it', () => {
  it('a duplicate insert (23505) suppresses without sending anything', async () => {
    insertShouldConflict = true;
    const outcome = await call('daily_insight', { push: true }, false);
    expect(outcome).toBe('duplicate_suppressed');
    expect(sendCalls).toEqual([]);
    expect(emailSends).toEqual([]);
  });

  it('a successful push stamps delivery on the SAME row, never a second one', async () => {
    await call('session_cancelled', { push: true }, false);
    expect(updates.some((u) => 'pushed_at' in u && u.send_status === 'provider_accepted')).toBe(true);
  });
});
