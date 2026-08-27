import { describe, it, expect } from 'vitest';
import { settleCreditForSession } from './session-credit';

// ── The ₹299, from payment to terminal state, adversarially ────────────────
//
// The database invariants were proved on careerrai-test (see
// session-credit-release.guard.test.ts). This file proves the LAYER ABOVE
// them: the single writer that every terminal transition calls. The two are
// different failure surfaces — the trigger stops an illegal state, this stops
// an illegal ACTION reaching it, and a caller that thinks it released a
// credit it did not is invisible to the trigger.
//
// Every completion, cancellation and expiry route now funnels here:
//   calendar/cancel-meeting          → 'cancelled'
//   admin/buddy-integration          → 'cancelled'
//   cron/release-stale-sessions      → 'expired'
//   buddy/commitment                 → 'completed'
//   calendar/complete-orientation    → 'completed'  (no-op; no credit exists)
// session-credit-writers.guard.test.ts holds that list to exactly one writer.

type Row = Record<string, unknown>;

/**
 * A session_credits fake that behaves like Postgres: a status-guarded update
 * matches zero rows when the guard fails, and .select() reports which rows
 * were touched. Getting THAT right is the whole point — the bug this file
 * exists to catch was a writer that could not tell the difference.
 */
function fakeAdmin(credit: Row | null) {
  const writes: Row[] = [];
  const state = credit ? { ...credit } : null;
  const admin = {
    from(table: string) {
      if (table !== 'session_credits') throw new Error(`unexpected table ${table}`);
      let guardStatuses: string[] | null = null;
      let targetId: string | null = null;
      let patch: Row | null = null;
      const q: Record<string, unknown> = {
        select: (_c?: string) => {
          if (!patch) return q;
          // UPDATE ... RETURNING id
          const ok = state && (!targetId || state.id === targetId)
            && (!guardStatuses || guardStatuses.includes(state.status as string));
          if (ok && state) { Object.assign(state, patch); writes.push({ ...patch }); }
          return Promise.resolve({ data: ok ? [{ id: state!.id }] : [], error: null });
        },
        eq: (col: string, val: unknown) => {
          if (col === 'id') targetId = val as string;
          if (col === 'status') guardStatuses = [val as string];
          return q;
        },
        in: (_c: string, vals: string[]) => { guardStatuses = vals; return q; },
        update: (p: Row) => { patch = p; return q; },
        maybeSingle: async () => ({ data: state, error: null }),
      };
      return q;
    },
  };
  return { admin, writes, state };
}

const scheduled = { id: 'cred-1', status: 'scheduled', buddy_id: 'b1' };

describe('COMPLETED — the credit reaches a terminal state', () => {
  it('a completed session completes its credit and clears what it owes', async () => {
    const { admin, writes } = fakeAdmin(scheduled);
    const out = await settleCreditForSession(admin as never, 'sess-1', 'completed');
    expect(out).toEqual({ settled: 'completed' });
    // Rule 9: a finished credit cannot still be owed to anyone.
    expect(writes[0]).toMatchObject({ status: 'completed', owner: null, next_action: null });
  });

  it('completing TWICE settles once and says so the second time', async () => {
    const { admin, writes } = fakeAdmin(scheduled);
    await settleCreditForSession(admin as never, 'sess-1', 'completed');
    const second = await settleCreditForSession(admin as never, 'sess-1', 'completed');
    // 'already_terminal', not 'already_settled': the first write left the
    // credit COMPLETED, and the terminal check fires before the status-guarded
    // update is even attempted. Both answers are "I changed nothing"; this one
    // is the more specific truth, and the caller can tell them apart.
    expect(second).toEqual({ settled: 'none', reason: 'already_terminal' });
    expect(writes.length).toBe(1);
  });
});

describe('CANCELLED / EXPIRED — the money comes back, owned', () => {
  it.each(['cancelled', 'expired'] as const)('a %s session releases the credit for rebooking', async (outcome) => {
    const { admin, writes } = fakeAdmin(scheduled);
    const out = await settleCreditForSession(admin as never, 'sess-1', outcome);
    expect(out).toEqual({ settled: 'released', creditId: 'cred-1' });
    expect(writes[0]).toMatchObject({
      status: 'booking_blocked', video_session_id: null, owner: 'ops',
      failure_reason: `session_${outcome}`,
    });
    // Rule 6: a failure nobody owns is the failure this state exists to prevent.
    expect(writes[0].next_action).toBeTruthy();
    expect(writes[0].failure_at).toBeTruthy();
  });

  it('NO DOUBLE RELEASE — a cancel racing an expiry releases once', async () => {
    // Both routes can fire for the same session: a mentor cancels at the same
    // moment the stale-session cron expires it. One release, one truth.
    const { admin, writes } = fakeAdmin(scheduled);
    const first = await settleCreditForSession(admin as never, 'sess-1', 'cancelled');
    const second = await settleCreditForSession(admin as never, 'sess-1', 'expired');
    expect(first).toEqual({ settled: 'released', creditId: 'cred-1' });
    expect(
      second,
      'The second settle reported a release it did not perform. A caller keying a notification off this value would tell the student twice.',
    ).toEqual({ settled: 'none', reason: 'already_settled' });
    expect(writes.length).toBe(1);
  });

  it('a released credit is not released again by a later completion', async () => {
    const { admin, writes } = fakeAdmin(scheduled);
    await settleCreditForSession(admin as never, 'sess-1', 'cancelled');
    const after = await settleCreditForSession(admin as never, 'sess-1', 'completed');
    expect(after).toEqual({ settled: 'none', reason: 'already_settled' });
    expect(writes.length).toBe(1);
  });
});

describe('what must NEVER happen', () => {
  it('NO RELEASE AFTER COMPLETION — delivery happened, the money is earned', async () => {
    const { admin, writes } = fakeAdmin({ ...scheduled, status: 'completed' });
    const out = await settleCreditForSession(admin as never, 'sess-1', 'cancelled');
    expect(out).toEqual({ settled: 'none', reason: 'already_terminal' });
    expect(writes).toEqual([]);
  });

  it('a REFUNDED credit is never touched again', async () => {
    const { admin, writes } = fakeAdmin({ ...scheduled, status: 'refunded' });
    expect(await settleCreditForSession(admin as never, 'sess-1', 'completed'))
      .toEqual({ settled: 'none', reason: 'already_terminal' });
    expect(writes).toEqual([]);
  });

  it('a session with no credit settles nothing — orientation and buddy-plan calls', async () => {
    const { admin, writes } = fakeAdmin(null);
    expect(await settleCreditForSession(admin as never, 'sess-1', 'completed'))
      .toEqual({ settled: 'none', reason: 'no_credit' });
    expect(writes).toEqual([]);
  });

  it('IT ONLY EVER TOUCHES THE CREDIT ATTACHED TO THAT SESSION', async () => {
    // The lookup is by video_session_id, so there is no path that takes a
    // student id or a mentor id and could reach someone else's entitlement.
    const src = (await import('node:fs')).readFileSync('src/lib/session-credit.ts', 'utf8');
    const fn = src.slice(src.indexOf('export async function settleCreditForSession'));
    expect(fn).toMatch(/\.eq\('video_session_id', sessionId\)/);
    expect(fn.slice(0, fn.indexOf('return'))).not.toMatch(/\.eq\('student_id'/);
  });

  it('a failed READ never guesses — it reports, and touches nothing', async () => {
    const admin = { from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'boom' } }) }) }),
    }) };
    expect(await settleCreditForSession(admin as never, 'sess-1', 'cancelled'))
      .toEqual({ settled: 'none', reason: 'read_failed' });
  });

  it('NEVER THROWS — a bookkeeping failure must not fail the mentor\'s close-out', async () => {
    // Every caller runs this AFTER the session state has already changed and
    // none of them catch. A throw here turned a successful cancellation into a
    // 500 for the mentor, with the cancellation already committed.
    const admin = { from: () => { throw new Error('db down'); } };
    await expect(settleCreditForSession(admin as never, 'sess-1', 'completed'))
      .resolves.toEqual({ settled: 'none', reason: 'write_failed' });
  });
});
