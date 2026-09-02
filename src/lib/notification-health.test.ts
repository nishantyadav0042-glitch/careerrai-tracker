import { describe, it, expect } from 'vitest';
import { scoreStudent, getRecoveryQueue, type NotifHealthState } from './notification-health';

// ── THE HONEST CLASSIFICATION, PROVEN STATE BY STATE ────────────────────────
//
// notification-health.ts had zero test coverage before 15 Aug — every state
// this function can return was trusted on read, never pinned. That is how
// "opted_out" and "never_opted_in" survived as long as they did: nothing
// would have failed when the second one became permanently unreachable
// (notif_prefs is never null — the DB default sets push:false explicitly —
// so the branch checking "no notif_prefs at all" could never fire).

const NOW = Date.parse('2026-08-15T12:00:00.000Z');
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const base = {
  notif_prefs: { push: false },
  push_subscription: null,
  push_subscribed_at: null,
  push_verified_at: null,
  push_died_at: null,
};

describe('the "opted out" / "never opted in" split is gone', () => {
  it('push:false with NO record of a prompt → not_asked (was the mislabeled "opted out")', () => {
    const { state } = scoreStudent({ ...base }, NOW);
    expect(state).toBe('not_asked');
  });

  it('push:false WITH a real push_prompted record → declined', () => {
    const { state } = scoreStudent({ ...base, notif_prefs: { push: false, push_prompted: true } }, NOW);
    expect(state).toBe('declined');
  });

  it('push:false WITH a push_reprompted record also counts as declined', () => {
    const { state } = scoreStudent({ ...base, notif_prefs: { push: false, push_reprompted: true } }, NOW);
    expect(state).toBe('declined');
  });

  it('a prompted flag alone, without push:false explicitly set, still reads not_asked if push is not true', () => {
    // Belt and suspenders: only a TRUE push flag counts as opted in — an
    // absent or non-boolean value must never accidentally read as granted.
    const { state } = scoreStudent({ ...base, notif_prefs: {} }, NOW);
    expect(state).toBe('not_asked');
  });
});

describe('the "disconnected" split — Notification Reliability V2 Phase 4: provider_dead requires PROOF', () => {
  it('a real push_died_at (an actual 410/404 from the provider) → disconnected_dead', () => {
    const { state } = scoreStudent(
      { ...base, notif_prefs: { push: true }, push_subscription: null, push_subscribed_at: day(5), push_died_at: day(2) }, NOW
    );
    expect(state).toBe('disconnected_dead');
  });

  it('a subscription birth date ALONE, with NO push_died_at, is disconnected_unexplained — not proof of death', () => {
    // 16 Aug fix: this used to be disconnected_dead purely because
    // push_subscribed_at was set — an inference, not a provider-confirmed
    // rejection. The forensic audit's whole point: a missing subscription
    // is a different, less certain fact than a proven 410/404, and the
    // dashboard must never blur them into "dead" on inference alone.
    const { state } = scoreStudent(
      { ...base, notif_prefs: { push: true }, push_subscription: null, push_subscribed_at: day(5), push_died_at: null }, NOW
    );
    expect(state).toBe('disconnected_unexplained');
  });

  it('no subscription birth date and no death record → disconnected_unexplained', () => {
    const { state } = scoreStudent(
      { ...base, notif_prefs: { push: true }, push_subscription: null, push_subscribed_at: null, push_died_at: null }, NOW
    );
    expect(state).toBe('disconnected_unexplained');
  });
});

describe('a live subscription is never read as consent — Phase 1/4 fix for the exact contradiction the audit found', () => {
  it('push:false with a leftover LIVE subscription is still not_asked/declined, never healthy', () => {
    // Before 16 Aug: only `!prefsPush && !hasSub` was checked, so this exact
    // input fell through to the healthy/unverified/stale branch below and
    // was counted opted-in — the contradiction with push-state.ts's
    // pushHealth(), which already enforced "a live endpoint is not
    // consent; their choice governs" for the same two columns.
    const { state } = scoreStudent(
      { ...base, notif_prefs: { push: false }, push_subscription: { endpoint: 'x' }, push_verified_at: day(0) }, NOW
    );
    expect(state).toBe('not_asked');
  });

  it('same case, but with a real prompt on record → declined, not healthy', () => {
    const { state } = scoreStudent(
      { ...base, notif_prefs: { push: false, push_prompted: true }, push_subscription: { endpoint: 'x' }, push_verified_at: day(0) }, NOW
    );
    expect(state).toBe('declined');
  });
});

describe('a live subscription — healthy / unverified / stale', () => {
  const withSub = (verifiedDaysAgo: number | null) => ({
    ...base,
    notif_prefs: { push: true },
    push_subscription: { endpoint: 'x' },
    push_verified_at: verifiedDaysAgo == null ? null : day(verifiedDaysAgo),
  });

  it('verified within 3 days → healthy', () => {
    expect(scoreStudent(withSub(0), NOW).state).toBe('healthy');
    expect(scoreStudent(withSub(3), NOW).state).toBe('healthy');
  });

  it('verified 7+ days ago → stale', () => {
    expect(scoreStudent(withSub(7), NOW).state).toBe('stale');
    expect(scoreStudent(withSub(30), NOW).state).toBe('stale');
  });

  it('4-6 days, or never verified → unverified', () => {
    expect(scoreStudent(withSub(4), NOW).state).toBe('unverified');
    expect(scoreStudent(withSub(6), NOW).state).toBe('unverified');
    expect(scoreStudent(withSub(null), NOW).state).toBe('unverified');
  });
});

describe('getRecoveryQueue — Installment 3 Batch 15: the specific worklist, not a generic count', () => {
  function fakeAdmin(opts: {
    profiles: Record<string, unknown>[];
    notifications?: Record<string, unknown>[];
    events?: Record<string, unknown>[];
  }) {
    return {
      from(table: string) {
        if (table === 'profiles') {
          // getRecoveryQueue reads the roster through fetchAll (Incident #65),
          // which orders and pages with .range(from, to). The fake must honour
          // the window or it would hand back every row on every page.
          let rng: [number, number] | null = null;
          const q = {
            select: () => q, eq: () => q, not: () => q, is: () => q, order: () => q,
            range: (from: number, to: number) => { rng = [from, to]; return q; },
            then: (resolve: (v: { data: unknown; error: null }) => void) =>
              resolve({ data: rng ? opts.profiles.slice(rng[0], rng[1] + 1) : opts.profiles, error: null }),
          };
          return q;
        }
        if (table === 'notifications') {
          const filters: { requireField?: string; likePrefix?: string } = {};
          const q = {
            select: () => q,
            in: () => q,
            not: (col: string) => { filters.requireField = col; return q; },
            ilike: (_col: string, pattern: string) => { filters.likePrefix = pattern.replace('%', ''); return q; },
            then: (resolve: (v: { data: unknown }) => void) => {
              let rows = opts.notifications ?? [];
              if (filters.requireField) rows = rows.filter((r) => (r as Record<string, unknown>)[filters.requireField!] != null);
              if (filters.likePrefix) rows = rows.filter((r) => String((r as Record<string, unknown>).send_error ?? '').startsWith(filters.likePrefix!));
              resolve({ data: rows });
            },
          };
          return q;
        }
        if (table === 'student_events') {
          const q = {
            select: () => q, in: () => q,
            then: (resolve: (v: { data: unknown }) => void) => resolve({ data: opts.events ?? [] }),
          };
          return q;
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
  }

  it('returns permission-granted, subscription-missing students only', async () => {
    const admin = fakeAdmin({
      profiles: [
        { id: 's1', full_name: 'A', push_died_at: '2026-08-01T00:00:00Z', push_recovery_attempted_at: null, push_recovery_last_error: null },
      ],
    });
    const queue = await getRecoveryQueue(admin);
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe('s1');
    expect(queue[0].subscriptionState).toBe('provider_dead');
    expect(queue[0].recoveryState).toBe('recovery_required');
  });

  it('classifies recovery_attempted vs recovery_failed correctly from the two new columns', async () => {
    const admin = fakeAdmin({
      profiles: [
        { id: 's_attempted', full_name: 'B', push_died_at: '2026-08-01T00:00:00Z', push_recovery_attempted_at: '2026-08-16T00:00:00Z', push_recovery_last_error: null },
        { id: 's_failed', full_name: 'C', push_died_at: '2026-08-01T00:00:00Z', push_recovery_attempted_at: '2026-08-16T00:00:00Z', push_recovery_last_error: 'subscribe_threw:AbortError' },
      ],
    });
    const queue = await getRecoveryQueue(admin);
    expect(queue.find((e) => e.id === 's_attempted')!.recoveryState).toBe('recovery_attempted');
    expect(queue.find((e) => e.id === 's_failed')!.recoveryState).toBe('recovery_failed');
    expect(queue.find((e) => e.id === 's_failed')!.recoveryLastError).toBe('subscribe_threw:AbortError');
  });

  it('surfaces the LATEST death reason by failed_at, not just whichever row the query happened to return last', async () => {
    const admin = fakeAdmin({
      profiles: [{ id: 's1', full_name: 'A', push_died_at: '2026-08-10T00:00:00Z', push_recovery_attempted_at: null, push_recovery_last_error: null }],
      notifications: [
        { user_id: 's1', send_error: 'send_failed_500', failed_at: '2026-08-05T00:00:00Z' },
        { user_id: 's1', send_error: 'send_failed_410', failed_at: '2026-08-10T00:00:00Z' }, // the real, later death
      ],
    });
    const queue = await getRecoveryQueue(admin);
    expect(queue[0].deathReason).toBe('send_failed_410');
  });

  it('missing (no push_died_at) vs provider_dead are distinguished', async () => {
    const admin = fakeAdmin({
      profiles: [{ id: 's1', full_name: 'A', push_died_at: null, push_recovery_attempted_at: null, push_recovery_last_error: null }],
    });
    const queue = await getRecoveryQueue(admin);
    expect(queue[0].subscriptionState).toBe('missing');
  });
});

describe('every state is reachable — the exact bug that let never_opted_in go dead', () => {
  it('all seven states are producible by some real input', () => {
    const seen = new Set<NotifHealthState>();
    seen.add(scoreStudent({ ...base }, NOW).state);
    seen.add(scoreStudent({ ...base, notif_prefs: { push: false, push_prompted: true } }, NOW).state);
    seen.add(scoreStudent({ ...base, notif_prefs: { push: true }, push_subscribed_at: day(5), push_died_at: day(2) }, NOW).state);
    seen.add(scoreStudent({ ...base, notif_prefs: { push: true } }, NOW).state);
    seen.add(scoreStudent({ ...base, notif_prefs: { push: true }, push_subscription: { endpoint: 'x' }, push_verified_at: day(0) }, NOW).state);
    seen.add(scoreStudent({ ...base, notif_prefs: { push: true }, push_subscription: { endpoint: 'x' }, push_verified_at: day(7) }, NOW).state);
    seen.add(scoreStudent({ ...base, notif_prefs: { push: true }, push_subscription: { endpoint: 'x' }, push_verified_at: null }, NOW).state);
    const all: NotifHealthState[] = [
      'healthy', 'unverified', 'stale', 'disconnected_dead', 'disconnected_unexplained', 'declined', 'not_asked',
    ];
    for (const s of all) expect(seen.has(s), `${s} is unreachable`).toBe(true);
  });
});
