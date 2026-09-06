import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── The daily intake: a failed read enrols NOBODY, and a good run is honest ─
//
// B3b posture (ENGINEERING_PLAYBOOK): a cron that mutates on a partial read is
// worse than one that never ran. For this engine the failure mode would be
// subtle — a roster read that came back short would enrol a SUBSET and report
// success, and a lead_outreach read that came back empty would re-enrol the
// whole base into new books. Every source is therefore asserted to fail
// closed, and the positive controls pin what a correct run writes.

/* eslint-disable @typescript-eslint/no-explicit-any */

type Mode = 'ok' | 'error' | 'null-no-error' | 'throw';
let mode: Record<string, Mode> = {};
let flag: string | null = null;

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let staff: any[] = [];
let configs: any[] = [];
let roster: any[] = [];
let book: any[] = [];
/** Rows the database already holds — what ON CONFLICT DO NOTHING will refuse. */
let owned = new Set<string>();
let profilesReads = 0;
const upserts: { rows: any[]; opts: any }[] = [];
const activity: any[] = [];
const audit = vi.fn(async (..._a: unknown[]) => { void _a; });

vi.mock('@/lib/server-config', () => ({ getServerConfig: async () => flag }));
vi.mock('@/lib/cron-auth', () => ({ authorizedCron: () => true }));
vi.mock('@/lib/cron-run-tracker', () => ({
  withCronTracking: (_p: string, run: () => Promise<Response>) => run(),
}));
vi.mock('@/lib/audit', () => ({ logAdminAction: (...a: unknown[]) => audit(...a) }));

const page = <T,>(rows: T[], rng: [number, number] | null) => (rng ? rows.slice(rng[0], rng[1] + 1) : rows);

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const m: Mode = mode[table] ?? 'ok';
      const eqs: [string, unknown][] = [];
      const ins: [string, unknown][] = [];
      let rng: [number, number] | null = null;
      let pendingUpsert: { rows: any[]; opts: any } | null = null;
      let pendingInsert: any[] | null = null;
      const answer = () => {
        if (m === 'throw') throw new Error(`${table} exploded`);
        if (m === 'error') return { data: null, error: { message: `${table} timeout` } };
        if (m === 'null-no-error') return { data: null, error: null };
        if (pendingInsert) { activity.push(...pendingInsert); return { data: null, error: null }; }
        if (pendingUpsert) {
          upserts.push(pendingUpsert);
          const inserted = pendingUpsert.rows.filter((r) => !owned.has(r.student_id));
          for (const r of inserted) { owned.add(r.student_id); book.push({ student_id: r.student_id, owner_id: r.owner_id, enrolled_at: r.enrolled_at }); }
          return { data: inserted.map((r) => ({ student_id: r.student_id })), error: null };
        }
        if (table === 'profiles') {
          profilesReads++;
          // The staff read filters role in ('sales','admin'); the roster read
          // filters role = 'student'. Both name `role`, so the VALUE decides.
          const roleIn = ins.find(([k]) => k === 'role');
          const roleEq = eqs.find(([k]) => k === 'role');
          if (roleIn || (roleEq && roleEq[1] !== 'student')) return { data: staff, error: null };
          return { data: page(roster, rng), error: null };
        }
        if (table === 'sales_rep_config') return { data: configs, error: null };
        if (table === 'lead_outreach') return { data: page(book, rng), error: null };
        return { data: [], error: null };
      };
      const chain: Record<string, unknown> = {};
      for (const k of ['select', 'gte', 'lte', 'order', 'is', 'not']) chain[k] = () => chain;
      chain.eq = (k: string, v: unknown) => { eqs.push([k, v]); return chain; };
      chain.in = (k: string, v: unknown) => { ins.push([k, v]); return chain; };
      chain.range = (from: number, to: number) => { rng = [from, to]; return chain; };
      chain.upsert = (rows: any[], opts: any) => { pendingUpsert = { rows, opts }; return chain; };
      chain.insert = (rows: any[]) => { pendingInsert = rows; return chain; };
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        try { return Promise.resolve(answer()).then(res, rej); }
        catch (e) { return Promise.reject(e).catch(rej); }
      };
      return chain;
    },
  }),
}));

async function run() {
  const { GET } = await import('./route');
  return GET(new Request('https://x/api/cron/lead-intake', { method: 'GET' }) as never);
}

const cfg = (rep_id: string, over: Record<string, unknown> = {}) => ({
  rep_id, active: true, unavailable_until: null, max_new_per_day: 50, max_capacity_units: 150, ...over,
});
const student = (id: string, hoursAgo: number, over: Record<string, unknown> = {}) => ({
  id, created_at: new Date(Date.now() - hoursAgo * HOUR).toISOString(), phone: '+919000000001', is_premium: false, ...over,
});

beforeEach(() => {
  vi.resetModules();
  mode = {};
  flag = null;
  staff = [{ id: A, full_name: 'Anshul Yadav' }, { id: B, full_name: 'Neelam Singh' }];
  configs = [cfg(A), cfg(B)];
  // r1, r2: new arrivals. r3: backlog. r4 premium, r5 no phone, r6 already owned.
  roster = [
    student('r1', 1), student('r2', 2), student('r3', 10 * 24),
    student('r4', 3, { is_premium: true }), student('r5', 4, { phone: null }), student('r6', 5),
  ];
  book = [{ student_id: 'r6', owner_id: A, enrolled_at: new Date(Date.now() - 5 * DAY).toISOString() }];
  owned = new Set(['r6']);
  profilesReads = 0;
  upserts.length = 0;
  activity.length = 0;
  audit.mockClear();
});

const FAILURES: [string, Mode][] = [
  ['an explicit error', 'error'],
  ['data: null with NO error — the incident shape', 'null-no-error'],
  ['a thrown exception', 'throw'],
];

describe('any source unavailable → nobody is enrolled', () => {
  for (const table of ['profiles', 'sales_rep_config', 'lead_outreach']) {
    for (const [name, m] of FAILURES) {
      it(`${table}: ${name} → zero writes, 503, and the run says why`, async () => {
        mode = { [table]: m };
        const res = await run();
        const body = await res.json();
        expect(upserts, `${table} failed and ownership was still written`).toEqual([]);
        expect(activity).toEqual([]);
        expect(audit).not.toHaveBeenCalled();
        expect(res.status).toBe(503);
        expect(body.state).toBe('SOURCE_UNAVAILABLE');
        expect(body.ok).toBe(false);
        expect(String(body.error)).toContain(table);
      });
    }
  }
});

describe('the kill switch', () => {
  for (const v of ['false', '0', 'off', ' FALSE ']) {
    it(`SALES_INTAKE_ENABLED=${JSON.stringify(v)} → ENGINE_DISABLED before a single read`, async () => {
      flag = v;
      const res = await run();
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.state).toBe('ENGINE_DISABLED');
      expect(profilesReads).toBe(0);
      expect(upserts).toEqual([]);
    });
  }
  it('absent means ON', async () => {
    flag = null;
    const body = await (await run()).json();
    expect(body.state).toBe('ALLOCATED');
  });
});

describe('a correct run — the positive controls', () => {
  it('enrols the eligible pool newest-first, alternating between the two seats', async () => {
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.state).toBe('ALLOCATED');
    // r4 (premium), r5 (no phone) and r6 (already owned) never enter the pool.
    expect(body.poolSize).toBe(3);
    expect(body.waiting).toBe(0);
    const byRep = Object.fromEntries(body.enrolled.map((e: any) => [e.repId, e]));
    expect(byRep[A].landed).toBe(2);   // r1, r3 — the odd one to the lower rep id
    expect(byRep[B].landed).toBe(1);   // r2
    const rows = upserts.flatMap((u) => u.rows);
    expect(rows.filter((r) => r.owner_id === A).map((r) => r.student_id)).toEqual(['r1', 'r3']);
    expect(rows.filter((r) => r.owner_id === B).map((r) => r.student_id)).toEqual(['r2']);
  });

  it('writes with ON CONFLICT DO NOTHING — the idempotency key is the row itself', async () => {
    await run();
    expect(upserts.length).toBeGreaterThan(0);
    for (const u of upserts) {
      expect(u.opts).toEqual({ onConflict: 'student_id', ignoreDuplicates: true });
      for (const r of u.rows) {
        expect(r.status).toBe('not_contacted');
        expect(typeof r.enrolled_at).toBe('string');
      }
    }
  });

  it('starts the SLA clock ONLY for a new arrival; a backlog signup gets no clock', async () => {
    const body = await (await run()).json();
    const rows = upserts.flatMap((u) => u.rows);
    const by = Object.fromEntries(rows.map((r) => [r.student_id, r]));
    expect(by.r1.assigned_at).toBeTruthy();
    expect(by.r2.assigned_at).toBeTruthy();
    expect(by.r3.assigned_at).toBeNull();
    expect(body.arrivals).toBe(2);
  });

  it('records history per student and one audit row per run, with the platform as actor', async () => {
    await run();
    expect(activity).toHaveLength(3);
    for (const a of activity) {
      expect(a.actor_id).toBeNull();
      expect(a.provenance).toBe('system_generated');
      expect(a.activity_type).toBe('assigned');
      expect(a.note).toMatch(/Daily intake → (Anshul|Neelam)/);
    }
    expect(activity.find((a) => a.student_id === 'r3').note).toContain('SLA not started');
    expect(activity.find((a) => a.student_id === 'r1').note).toContain('SLA started');
    expect(audit).toHaveBeenCalledTimes(1);
    const [actor, action, targetType] = audit.mock.calls[0] as unknown[];
    expect(actor).toBeNull();
    expect(action).toBe('sales_book_enrolled');
    expect(targetType).toBe('system');
  });

  it('a second run in the same day finds nobody waiting and writes nothing', async () => {
    await run();
    upserts.length = 0; activity.length = 0; audit.mockClear();
    const body = await (await run()).json();
    expect(body.state).toBe('POOL_EMPTY');
    expect(upserts).toEqual([]);
    expect(activity).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it('a concurrent enrolment that got there first is reported honestly, never overwritten', async () => {
    // r1 was claimed between this run's read and its write (the fake read did
    // not show it owned, but the database refuses the insert).
    owned.add('r1');
    const body = await (await run()).json();
    const byRep = Object.fromEntries(body.enrolled.map((e: any) => [e.repId, e]));
    expect(byRep[A].requested).toBe(2);
    expect(byRep[A].landed).toBe(1);
    expect(activity.map((a) => a.student_id).sort()).toEqual(['r2', 'r3']);
  });

  it('a seat whose new-per-day cap is spent takes nothing; both spent → ALL_SEATS_FUSED', async () => {
    const today = new Date().toISOString();
    for (let i = 0; i < 50; i++) book.push({ student_id: `old-a${i}`, owner_id: A, enrolled_at: today });
    let body = await (await run()).json();
    expect(body.enrolled.find((e: any) => e.repId === A).landed).toBe(0);
    expect(body.enrolled.find((e: any) => e.repId === B).landed).toBe(3);

    upserts.length = 0;
    for (let i = 0; i < 50; i++) book.push({ student_id: `old-b${i}`, owner_id: B, enrolled_at: today });
    roster.push(student('r7', 1));
    body = await (await run()).json();
    expect(body.state).toBe('ALL_SEATS_FUSED');
    expect(body.waiting).toBe(1);
    expect(upserts).toEqual([]);
  });

  it('at 2,500 students the roster is read in pages and the fuse still holds (gate 7)', async () => {
    roster = Array.from({ length: 2500 }, (_, i) => student(`p${i}`, i + 1));
    const body = await (await run()).json();
    expect(body.state).toBe('ALLOCATED');
    expect(body.poolSize).toBe(2500);
    const landed = body.enrolled.reduce((s: number, e: any) => s + e.landed, 0);
    expect(landed).toBe(100);           // 50 + 50, never more
    expect(body.waiting).toBe(2400);
    expect(upserts.flatMap((u) => u.rows)).toHaveLength(100);
    // The newest 100 — the backlog drains from the most recent backwards.
    const ids = new Set(upserts.flatMap((u) => u.rows).map((r) => r.student_id));
    expect(ids.has('p0')).toBe(true);
    expect(ids.has('p99')).toBe(true);
    expect(ids.has('p100')).toBe(false);
  });
});
