import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Incident #57: the queue died at ~850 students ───────────────────────────
//
// PostgREST puts `.in()` lists in the QUERY STRING. With 975 students that is
// a ~38,000 character URL and every request came back 400 Bad Request. /sales
// rendered "This page didn't load" and both counsellors were locked out of the
// product on the morning they were supposed to start.
//
// 4,723 tests passed while production was down, because the fake database in
// every other suite ignores `.in()` entirely. A harness that accepts any
// argument cannot fail on the argument being too large — so the bug was
// invisible to the whole test suite by construction.
//
// This harness models the ONE property those miss: a real backend rejects an
// over-long list. It is deliberately strict, because the failure it reproduces
// was total.

/** What PostgREST does when the URL gets too long. */
const SERVER_IN_LIMIT = 200;

const ROSTER: Record<string, unknown>[] = [];
vi.mock('@/lib/momentum', async (orig) => ({
  ...(await orig<typeof import('./momentum')>()),
  getRosterMomentum: vi.fn(async () => ROSTER),
}));

const BOSS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const asAdmin = { id: BOSS, role: 'admin' as const };
const STAFF = [{ id: BOSS, email: null, full_name: 'Founder', role: 'admin' }];

/** Every `.in()` list this run issued, per table. */
let inSizes: { table: string; n: number }[] = [];

function db(outreach: Record<string, unknown>[] = []) {
  const chain = (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    let ids: string[] | null = null;
    let tooLong = false;
    for (const m of ['select', 'gte', 'lt', 'gt', 'not', 'order', 'limit', 'eq', 'neq']) c[m] = () => c;
    c.in = (col: string, vals: unknown[]) => {
      if (col === 'student_id' || col === 'id') {
        ids = vals as string[];
        inSizes.push({ table, n: vals.length });
        // THE PRODUCTION BEHAVIOUR. Too many ids → the request never runs.
        if (vals.length > SERVER_IN_LIMIT) tooLong = true;
      }
      return c;
    };
    c.then = (ok: (r: unknown) => unknown) => {
      if (tooLong) {
        return Promise.resolve({ data: null, error: { message: 'Bad Request' } }).then(ok);
      }
      if (table === 'profiles' && ids === null) {
        return Promise.resolve({ data: STAFF, error: null }).then(ok);
      }
      if (table === 'lead_outreach') {
        const set = new Set(ids ?? []);
        return Promise.resolve({
          data: outreach.filter((o) => set.has(o.student_id as string)), error: null,
        }).then(ok);
      }
      return Promise.resolve({ data: [], error: null }).then(ok);
    };
    return c;
  };
  return { from: (t: string) => chain(t) };
}

const student = (i: number) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  full_name: `Student ${i}`, phone: `98${String(i).padStart(8, '0')}`,
  score: 50, band: 'at_risk', reachable: true, isPremium: false, hasBuddy: false,
  daysSinceLastLog: 5, buddyCtaClicks: 0,
});

beforeEach(() => { vi.clearAllMocks(); ROSTER.length = 0; inSizes = []; });

describe('the queue survives the real student base', () => {
  it('renders for 975 students instead of throwing Bad Request', async () => {
    for (let i = 0; i < 975; i++) ROSTER.push(student(i));
    const { buildCallQueue } = await import('./call-queue');
    // Before the fix this threw "Could not read the sales queue state: Bad Request"
    // and took the whole page down.
    const { queue, totalOpen } = await buildCallQueue(db(), asAdmin);
    expect(queue.length, 'a counsellor must get a working deck').toBeGreaterThan(0);
    expect(totalOpen).toBeGreaterThan(0);
  });

  it('never asks the database for more ids than it can take', async () => {
    for (let i = 0; i < 975; i++) ROSTER.push(student(i));
    const { buildCallQueue } = await import('./call-queue');
    await buildCallQueue(db(), asAdmin);
    const worst = Math.max(...inSizes.map((x) => x.n));
    expect(worst, `largest .in() list was ${worst}`).toBeLessThanOrEqual(SERVER_IN_LIMIT);
  });

  it('chunks EVERY read, not just the one that happened to throw', async () => {
    // lead_outreach was the only read that inspected its error, so it was the
    // only one that surfaced. The rest — including the PAID PAYMENTS read that
    // stops a paying student being dealt as a lead — failed silently.
    for (let i = 0; i < 975; i++) ROSTER.push(student(i));
    const { buildCallQueue } = await import('./call-queue');
    await buildCallQueue(db(), asAdmin);
    const tables = new Set(inSizes.map((x) => x.table));
    for (const t of ['lead_outreach', 'student_payments', 'student_engagement', 'daily_reports', 'profiles']) {
      expect(tables, `${t} must be read in chunks too`).toContain(t);
    }
    for (const { table, n } of inSizes) {
      expect(n, `${table} issued an over-long list`).toBeLessThanOrEqual(SERVER_IN_LIMIT);
    }
  });

  it('still returns the right rows after chunking, not duplicates', async () => {
    for (let i = 0; i < 400; i++) ROSTER.push(student(i));
    const target = student(250).id;
    const { buildCallQueue } = await import('./call-queue');
    const { queue } = await buildCallQueue(db([{
      student_id: target, status: 'dnd', next_action_at: null,
      last_attempt_at: null, no_answer_count: 0, callback_at: null, owner: null,
    }]), asAdmin);
    // The dnd row lives in a later chunk; if chunking dropped or duplicated it
    // the student would be dealt anyway.
    expect(queue.find((l) => l.studentId === target), 'a dnd student must stay suppressed').toBeFalsy();
    const ids = queue.map((l) => l.studentId);
    expect(new Set(ids).size, 'chunking must not duplicate students').toBe(ids.length);
  });

  // Non-vacuity: the harness genuinely rejects long lists, so the tests above
  // are detecting the chunking rather than a permissive fake.
  it('the harness itself would fail an unchunked read', async () => {
    const c = db().from('lead_outreach');
    const tooMany = Array.from({ length: SERVER_IN_LIMIT + 1 }, (_, i) => `id${i}`);
    const { error } = await c.select('x').in('student_id', tooMany);
    expect(error?.message, 'the fake must model the real 400').toBe('Bad Request');
  });
});
