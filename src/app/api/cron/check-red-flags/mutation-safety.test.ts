import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── B3b gate 6 — source failure produces ZERO side effects ─────────────────
//
// Founder ruling, 23 Aug: proving "failed read → no database write" is not
// enough. `dispatch()` and `sendRedFlagAlert()` make a path mutation-capable
// with no SQL in it, so the assertion has to cover every student-facing side
// effect:
//
//     UNAVAILABLE → no DB mutation
//                   no notification
//                   no email
//                   no student-facing claim
//
// What this job did before the migration, on one dead query:
// `reports ?? []` gave every student zero reports, `reports.length < 4` fired
// for all of them, and every mentor got an in-app alert AND an email saying
// their student had gone quiet. The job would have answered `{ flagged: N }`.
//
// Gate 7 is folded in here rather than kept separate: the same failures are
// asserted at 2,000 students, well above the 739 at which production actually
// broke, so a future pagination or chunking bug cannot pass by being under the
// old threshold.

// dispatch() writes via .insert(...).select('id').single(), so the fake models
// that chain. The spy still records every attempted notification write, which
// is what every assertion below counts — only the SHAPE changed, because the
// route now goes through the send boundary instead of inserting by hand.
const insert = vi.fn(() => {
  const row = { data: { id: 'notif-fake' }, error: null };
  const chain: Record<string, unknown> = {
    select: () => chain,
    single: () => Promise.resolve(row),
    then: (res: (v: unknown) => unknown) => Promise.resolve(row).then(res),
  };
  return chain;
});
const sendRedFlagAlert = vi.fn((...args: unknown[]) => { void args; return Promise.resolve(); });

vi.mock('@/lib/email', () => ({ sendRedFlagAlert: (...a: unknown[]) => sendRedFlagAlert(...a) }));
vi.mock('@/lib/cron-auth', () => ({ authorizedCron: () => true }));
vi.mock('@/lib/cron-run-tracker', () => ({
  withCronTracking: (_p: string, run: () => Promise<Response>) => run(),
}));

/** How each table should answer this run. */
type Mode = 'ok' | 'error' | 'null-no-error' | 'throw';
let mode: Record<string, Mode> = {};
let population = 5;

// Mentors are drawn from the same id space so ONE `profiles` stub can answer
// both the roster read and the buddy-identity read. First draft used `b${i%7}`,
// which no profiles row had, so every student fell out at `if (!buddy)` and the
// positive controls reported zero alerts — a mock defect that would have read
// as "the migration disabled the job".
function studentRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`, full_name: `Student ${i}`, buddy_id: `s${i % 7}`,
    email: `mentor${i % 7}@example.test`,
  }));
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const m: Mode = mode[table] ?? 'ok';
      const answer = () => {
        if (m === 'throw') throw new Error(`${table} exploded`);
        if (m === 'error') return Promise.resolve({ data: null, error: { message: `${table} timeout` } });
        // The weekly-plan-reconcile shape: null data, NO error.
        if (m === 'null-no-error') return Promise.resolve({ data: null, error: null });
        if (table === 'profiles') return Promise.resolve({ data: studentRows(population), error: null });
        // daily_reports returns NOTHING — a genuinely quiet cohort. This is the
        // case that MUST still alert, so the guard cannot pass by never acting.
        return Promise.resolve({ data: [], error: null });
      };
      const chain: Record<string, unknown> = {};
      for (const k of ['select', 'eq', 'gte', 'lte', 'in', 'contains', 'limit', 'order']) {
        chain[k] = () => chain;
      }
      chain.insert = insert;
      chain.maybeSingle = answer;
      // Awaiting the builder resolves it — that is how the route consumes it.
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        try { return Promise.resolve(answer()).then(res, rej); }
        catch (e) { return Promise.reject(e).catch(rej); }
      };
      return chain;
    },
  }),
}));

async function run() {
  const { POST } = await import('./route');
  return POST(new Request('https://x/api/cron/check-red-flags', { method: 'POST' }) as never);
}

beforeEach(() => {
  vi.resetModules();
  insert.mockClear();
  sendRedFlagAlert.mockClear();
  mode = {};
  population = 5;
});

const FAILURES: [string, Mode][] = [
  ['an explicit error', 'error'],
  ['data: null with NO error — the incident shape', 'null-no-error'],
  ['a thrown exception', 'throw'],
];

describe('daily_reports unavailable → zero side effects', () => {
  for (const [name, m] of FAILURES) {
    it(`${name}: no notification row, no email, and the run says so`, async () => {
      mode = { daily_reports: m };
      const res = await run();
      const body = await res.json();

      expect(insert, 'a notification was inserted on a failed read').not.toHaveBeenCalled();
      expect(sendRedFlagAlert, 'a mentor was emailed on a failed read').not.toHaveBeenCalled();
      expect(res.status).toBe(503);
      expect(body.skipped).toBe('source_unavailable');
      expect(body.flagged).toBe(0);
      expect(body.ok).toBe(false);
    });
  }

  it('at 2,000 students the failure still produces nothing (gate 7)', async () => {
    population = 2000;
    mode = { daily_reports: 'null-no-error' };
    const res = await run();
    expect(insert).not.toHaveBeenCalled();
    expect(sendRedFlagAlert).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
  });
});

describe('the roster itself unavailable → zero side effects', () => {
  for (const [name, m] of FAILURES) {
    it(`${name}: does not report a calm day`, async () => {
      mode = { profiles: m };
      const res = await run();
      const body = await res.json();
      expect(insert).not.toHaveBeenCalled();
      expect(sendRedFlagAlert).not.toHaveBeenCalled();
      // The old code answered { flagged: 0 } here — indistinguishable from
      // "nobody is at risk". It must not look like a normal run.
      expect(res.status).toBe(503);
      expect(body.skipped).toBe('source_unavailable');
    });
  }
});

describe('the job still works when the sources ARE available', () => {
  it('a genuinely quiet cohort is alerted — the guard has not disabled the job', async () => {
    // Every student has zero reports for real, so "fewer than 4 reports"
    // legitimately fires. If this ever stops alerting, the migration has
    // silently turned the job off instead of making it fail closed.
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.flagged).toBeGreaterThan(0);
    expect(insert).toHaveBeenCalled();
  });

  it('at 2,000 students a successful read still alerts (gate 7)', async () => {
    population = 2000;
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.examined).toBe(2000);
    expect(body.flagged).toBeGreaterThan(0);
  });
});

describe('a failed dedup read fails CLOSED', () => {
  it('does not send a duplicate alert it cannot rule out', async () => {
    // The old code read the dedup query as `{ data: recentAlert }`; an
    // unavailable read made it null, which reads as "nothing sent recently",
    // so a BROKEN query manufactured a duplicate alert. Backwards.
    mode = { notifications: 'error' };
    const res = await run();
    const body = await res.json();
    expect(insert).not.toHaveBeenCalled();
    expect(sendRedFlagAlert).not.toHaveBeenCalled();
    // Not a failure of the whole run — but not silent either.
    expect(res.status).toBe(200);
    expect(body.skipped_dedup_unavailable).toBeGreaterThan(0);
  });
});
