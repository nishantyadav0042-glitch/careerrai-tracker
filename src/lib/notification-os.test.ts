import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── dispatch() HAD ZERO TEST COVERAGE BEFORE 15 AUG ─────────────────────────
//
// The single function every push in the app now passes through — the fix
// for fourteen call sites that could reach the push service without it —
// had never been tested at all. These pin the two guarantees that actually
// matter: the 10/day hard ceiling holds regardless of type, and the soft
// per-state budget applies ONLY to the ladder types it was built for, never
// spilling onto a session reminder or a buddy reply that happens to fire on
// a busy day.
//
// A fake, in-memory `notifications`/`profiles` store, following the same
// vi.mock pattern already established in idempotency.test.ts — real
// dispatch() logic, no live Supabase.

interface FakeRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  reason: string;
  expected_action: string;
  created_at: string;
  pushed_at: string | null;
  send_status?: string;
  send_error?: string | null;
  failed_at?: string | null;
}

let rows: FakeRow[] = [];
let nextId = 1;
let sendResult: { ok: boolean; reason?: string } = { ok: true };
let sendCalls: { userId: string; notifId: string }[] = [];
// null = normal insert; a string = every insert fails with that Postgres
// error code (used to test the Phase 11 duplicate-suppression path and
// Phase 5's generic-insert-failure path without a real unique constraint).
let insertErrorCode: string | null = null;
let suppressionLog: Record<string, unknown>[] = [];

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      // Installment 5 Phase 6: dispatch() now logs every PREVENTED duplicate
      // to its own table, so the production duplicate rate is a measured
      // number rather than inferred from an absence. Captured here so the
      // duplicate-suppression test can assert the row is actually written.
      if (table === 'notification_duplicate_suppressions') {
        return { insert: async (row: Record<string, unknown>) => { suppressionLog.push(row); return { error: null }; } };
      }
      if (table !== 'notifications') throw new Error(`unexpected table ${table}`);
      const filters: { userId?: string; types?: string[]; pushedNotNull?: boolean; createdGte?: string; pushedGte?: string } = {};
      const q = {
        select: () => q,
        eq: (col: string, val: string) => { if (col === 'user_id') filters.userId = val; return q; },
        in: (col: string, vals: string[]) => { if (col === 'type') filters.types = vals; return q; },
        not: (col: string, _op: string, _val: unknown) => { if (col === 'pushed_at') filters.pushedNotNull = true; return q; },
        gte: (col: string, val: string) => { if (col === 'created_at') filters.createdGte = val; if (col === 'pushed_at') filters.pushedGte = val; return q; },
        head: true,
        get count() {
          // Timestamps compared as real instants, not raw strings — dispatch()
          // computes its "today" boundary with a +05:30 offset while these fake
          // rows are stamped in plain UTC (`Z`); the two representations do not
          // string-compare correctly even for the same instant.
          return rows.filter((r) => {
            if (filters.userId && r.user_id !== filters.userId) return false;
            if (filters.types && !filters.types.includes(r.type)) return false;
            if (filters.pushedNotNull && r.pushed_at == null) return false;
            if (filters.createdGte && Date.parse(r.created_at) < Date.parse(filters.createdGte)) return false;
            if (filters.pushedGte && (r.pushed_at == null || Date.parse(r.pushed_at) < Date.parse(filters.pushedGte))) return false;
            return true;
          }).length;
        },
        then: (resolve: (v: { count: number }) => void) => resolve({ count: q.count }),
        insert: (row: Partial<FakeRow>) => {
          if (insertErrorCode != null) {
            return { select: () => ({ single: async () => ({ data: null, error: { code: insertErrorCode, message: 'simulated insert failure' } }) }) };
          }
          const created: FakeRow = {
            id: `row-${nextId++}`, user_id: row.user_id as string, type: row.type as string,
            title: row.title as string, body: row.body as string, data: (row.data as Record<string, unknown>) ?? {},
            reason: row.reason as string, expected_action: row.expected_action as string,
            created_at: new Date().toISOString(), pushed_at: null, send_status: row.send_status,
          };
          rows.push(created);
          return {
            select: () => ({ single: async () => ({ data: { id: created.id }, error: null }) }),
          };
        },
        update: (patch: Partial<FakeRow>) => ({
          eq: (_col: string, id: string) => {
            const r = rows.find((x) => x.id === id);
            if (r) Object.assign(r, patch);
            return Promise.resolve({ error: null });
          },
        }),
      };
      return q;
    },
  }),
}));

vi.mock('@/lib/push', () => ({
  sendPushToUser: async (userId: string, payload: { notifId: string }) => {
    sendCalls.push({ userId, notifId: payload.notifId });
    return sendResult;
  },
}));

import { dispatch, isStudentBudgetType, STUDENT_BUDGET_TYPES, DAILY_BUDGET } from './notification-os';

beforeEach(() => {
  rows = [];
  nextId = 1;
  sendResult = { ok: true };
  sendCalls = [];
  insertErrorCode = null;
  suppressionLog = [];
});

const opts = (over: Partial<Parameters<typeof dispatch>[0]> = {}) => ({
  userId: 'u1', type: 'chat', title: 'Hi', body: 'body', url: '/x',
  reason: 'test', expectedAction: 'acknowledge' as const, prefs: { push: true },
  ...over,
});

describe('every send carries the row it belongs to', () => {
  it('sendPushToUser is always called with the notification row\'s own id', async () => {
    await dispatch(opts());
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].notifId).toBe(rows[0].id);
  });

  it('pushed_at is stamped only when the send actually succeeds', async () => {
    await dispatch(opts());
    expect(rows[0].pushed_at).not.toBeNull();

    rows = []; nextId = 1; sendResult = { ok: false, reason: 'send_failed_500' };
    await dispatch(opts());
    expect(rows[0].pushed_at).toBeNull();
  });

  it('a push:false student gets the in-app row but no send attempt at all', async () => {
    await dispatch(opts({ prefs: { push: false } }));
    expect(rows).toHaveLength(1);
    expect(sendCalls).toHaveLength(0);
    expect(rows[0].pushed_at).toBeNull();
  });

  // Notification Reliability V2, Phase 6: "every real push attempt has
  // exactly one notification ID" — proven across MULTIPLE attempts, not
  // just the single-call case above, since the actual failure mode this
  // guards (14 call sites reaching the transport with no id at all, 15 Aug)
  // was only visible across a whole run of real traffic, not one send.
  it('across many attempts, every push carries a distinct, non-empty, correctly-correlated id', async () => {
    for (let i = 0; i < 8; i++) await dispatch(opts({ type: `t${i}` }));
    expect(sendCalls).toHaveLength(8);
    for (const call of sendCalls) {
      expect(call.notifId).toBeTruthy();
      expect(typeof call.notifId).toBe('string');
    }
    // one id per attempt, no id reused across two different pushes
    const ids = sendCalls.map((c) => c.notifId);
    expect(new Set(ids).size).toBe(ids.length);
    // every id sent to the transport actually belongs to a real row
    for (const id of ids) expect(rows.some((r) => r.id === id)).toBe(true);
  });
});

describe('the hard 10/day ceiling — "at any cost", every type, every recipient', () => {
  it('the 11th push attempt of the day is suppressed; the in-app row still lands', async () => {
    for (let i = 0; i < 10; i++) {
      const outcome = await dispatch(opts({ type: `t${i}` })); // distinct types — proves the CEILING is type-independent
      expect(outcome).toBe('sent');
    }
    expect(sendCalls).toHaveLength(10);

    const outcome = await dispatch(opts({ type: 't10' }));
    expect(outcome).toBe('daily_cap');
    expect(sendCalls).toHaveLength(10); // no 11th send attempt
    expect(rows).toHaveLength(11);      // but the in-app row for it exists
    expect(rows[10].pushed_at).toBeNull();
  });

  it('applies even to a type never on the soft-budget list — the exact bypass this closed', async () => {
    // 'chat', 'session_reminder', 'escalation' etc are deliberately absent
    // from STUDENT_BUDGET_TYPES (transactional rows are exempt from the
    // ladder's soft budget by design). The hard ceiling must not share that
    // exemption, or every one of those types reopens the bypass.
    expect(STUDENT_BUDGET_TYPES).not.toContain('chat');
    for (let i = 0; i < 10; i++) await dispatch(opts({ type: 'chat' }));
    const outcome = await dispatch(opts({ type: 'chat' }));
    expect(outcome).toBe('daily_cap');
  });
});

describe('the soft state budget — opt-in by type, never a silent global gate', () => {
  it('a STUDENT_BUDGET_TYPES type stops at its budget, with NO row created at all', async () => {
    const kind = STUDENT_BUDGET_TYPES[0];
    for (let i = 0; i < DAILY_BUDGET; i++) {
      const outcome = await dispatch(opts({ type: kind }));
      expect(outcome).toBe('sent');
    }
    expect(rows).toHaveLength(DAILY_BUDGET);

    const outcome = await dispatch(opts({ type: kind }));
    expect(outcome).toBe('budget_exhausted');
    expect(rows).toHaveLength(DAILY_BUDGET); // exhausted call created NOTHING, not even an in-app row
  });

  it('a non-ladder type is never blocked by another type\'s budget usage', async () => {
    // Exhaust the soft budget on a real ladder type…
    const ladderType = STUDENT_BUDGET_TYPES[0];
    for (let i = 0; i < DAILY_BUDGET; i++) await dispatch(opts({ type: ladderType }));
    expect(await dispatch(opts({ type: ladderType }))).toBe('budget_exhausted');

    // …a transactional type for the SAME student, same day, must still go
    // through — a buddy's reply must never be silently dropped because the
    // student already saw their four companion nudges today.
    const outcome = await dispatch(opts({ type: 'chat' }));
    expect(outcome).toBe('sent');
  });

  it('a custom dailyBudget overrides the default for that call only', async () => {
    const kind = STUDENT_BUDGET_TYPES[1];
    for (let i = 0; i < 2; i++) {
      expect(await dispatch(opts({ type: kind, dailyBudget: 2 }))).toBe('sent');
    }
    expect(await dispatch(opts({ type: kind, dailyBudget: 2 }))).toBe('budget_exhausted');
  });
});

describe('Notification Reliability V2, Phase 5 — dispatch() reports the REAL transport outcome', () => {
  it('a failed push reports "failed", never the old optimistic "sent"', async () => {
    sendResult = { ok: false, reason: 'send_failed_500' };
    const outcome = await dispatch(opts());
    expect(outcome).toBe('failed');
  });

  it('a failed push stamps send_status/send_error/failed_at on the row via update', async () => {
    sendResult = { ok: false, reason: 'send_failed_410' };
    await dispatch(opts());
    expect(rows[0].send_status).toBe('failed');
    expect(rows[0].send_error).toBe('send_failed_410');
    expect(rows[0].failed_at).not.toBeNull();
  });

  it('a successful push stamps send_status = provider_accepted alongside pushed_at', async () => {
    await dispatch(opts());
    expect(rows[0].send_status).toBe('provider_accepted');
    expect(rows[0].pushed_at).not.toBeNull();
  });

  it('an in-app-only student (push:false) is still "sent" — no transport was ever supposed to run', async () => {
    const outcome = await dispatch(opts({ prefs: { push: false } }));
    expect(outcome).toBe('sent');
  });
});

describe('Notification Reliability V2, Phase 11 — duplicate suppression and insert-failure reporting', () => {
  it('a unique-constraint violation (23505) on insert reports duplicate_suppressed, never attempts a push', async () => {
    insertErrorCode = '23505';
    const outcome = await dispatch(opts());
    expect(outcome).toBe('duplicate_suppressed');
    expect(sendCalls).toHaveLength(0);
    expect(rows).toHaveLength(0); // the DB rejected the row; nothing was created
  });

  it('the PREVENTED duplicate is logged, so the production rate is measured rather than inferred from an absence', async () => {
    // Installment 5 Phase 6. Without this row, a real suppression left zero
    // trace anywhere — the notifications row deliberately doesn't exist —
    // so "0 duplicates in production" could only ever mean "we found none",
    // never "we prevented N".
    insertErrorCode = '23505';
    await dispatch(opts({ userId: 'u9', type: 'inactive_recovery' }));
    expect(suppressionLog).toEqual([
      { student_id: 'u9', notification_type: 'inactive_recovery', detected_by: 'db_unique_index' },
    ]);
  });

  it('a non-duplicate insert failure logs NO suppression — it was not a prevented duplicate', async () => {
    insertErrorCode = '23P01';
    await dispatch(opts());
    expect(suppressionLog).toHaveLength(0);
  });

  it('a genuine insert failure (not 23505) reports failed instead of silently returning sent', async () => {
    insertErrorCode = '23P01'; // any non-duplicate Postgres error
    const outcome = await dispatch(opts());
    expect(outcome).toBe('failed');
    expect(sendCalls).toHaveLength(0);
  });
});

describe('Notification Reliability V2, Phase 12 — isStudentBudgetType closes the brain_* gap', () => {
  it('a dynamically-named brain_<action_id> type is recognized without being in the static list', () => {
    expect(STUDENT_BUDGET_TYPES).not.toContain('brain_activate_first_value');
    expect(isStudentBudgetType('brain_activate_first_value')).toBe(true);
  });

  it('a genuinely transactional type is still exempt', () => {
    expect(isStudentBudgetType('chat')).toBe(false);
    expect(isStudentBudgetType('session_reminder')).toBe(false);
  });
});

describe('extra row data merges alongside url, for callers that need correlation fields', () => {
  it('session-tomorrow-style extra data survives into the row', async () => {
    await dispatch(opts({ data: { session_id: 'abc123' } }));
    expect(rows[0].data).toEqual({ url: '/x', session_id: 'abc123' });
  });

  it('with no extra data, the row still carries just the url', async () => {
    await dispatch(opts());
    expect(rows[0].data).toEqual({ url: '/x' });
  });
});
