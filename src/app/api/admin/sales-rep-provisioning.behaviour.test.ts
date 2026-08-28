import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import type { RepCapacity } from '@/lib/sales-capacity';

// ── The three privileged routes, EXECUTED ───────────────────────────────────
//
// Everything here is a behaviour: a request goes in, and the assertion is what
// the route DID — which rows it wrote, which it refused to write, and whether
// an auth user was minted. No test in this file reads source text, because the
// failures worth catching are all of the form "it returned 200 and wrote the
// wrong thing", which a string search cannot see.

/* eslint-disable @typescript-eslint/no-explicit-any */

let currentAdmin: any;
let currentUser: { id: string } | null = { id: 'admin-1' };

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => currentAdmin }));
// The routes use the shared server client now (it persists rotated refresh
// tokens), so mock that rather than the vendor module — the test stays
// independent of Next's request-scoped cookie storage.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: currentUser } }) } }),
}));
vi.mock('@/lib/sales-audit', () => ({ auditSales: vi.fn(async () => {}) }));

const capacityMock = vi.hoisted(() => ({ getTeamCapacity: vi.fn(async () => [] as RepCapacity[]) }));
vi.mock('@/lib/sales-capacity', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getTeamCapacity: capacityMock.getTeamCapacity,
}));

import { POST as createRep } from '@/app/api/admin/create-sales-rep/route';
import { POST as repConfig } from '@/app/api/admin/rep-config/route';
import { POST as distribute } from '@/app/api/admin/distribute-leads/route';

type Res = { data: unknown; error: { message: string } | null };
type Handler = (call: number) => Res;

/** Records every write so a test can assert on what did NOT happen. */
function makeAdmin(handlers: Record<string, Handler>) {
  const writes: { table: string; op: string; payload: unknown }[] = [];
  const counts: Record<string, number> = {};
  const chain = (table: string) => {
    const state = { op: 'select', payload: undefined as unknown };
    const c: any = {};
    for (const op of ['insert', 'update', 'upsert', 'delete']) {
      c[op] = (payload: unknown) => { state.op = op; state.payload = payload; writes.push({ table, op, payload }); return c; };
    }
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'lt', 'gte', 'order', 'limit', 'maybeSingle', 'single']) c[m] = () => c;
    c.then = (ok: (r: Res) => unknown) => {
      const key = `${table}.${state.op}`;
      const call = (counts[key] = (counts[key] ?? 0) + 1);
      return Promise.resolve(handlers[key] ? handlers[key](call) : { data: null, error: null }).then(ok);
    };
    return c;
  };
  const createUser = vi.fn(async () => ({ data: { user: { id: 'new-user-1', email: 'part@careerrai.in' } }, error: null }));
  // attach mode looks the id up in Supabase Auth first; `existingAuthUser`
  // makes that id resolve, so the test can then say who owns it in profiles.
  const getUserById = vi.fn(async () => ({ data: { user: existingAuthUser }, error: null }));
  return {
    from: (t: string) => chain(t),
    auth: { admin: { createUser, getUserById } },
    writes, counts, createUser, getUserById,
  };
}

/** The auth user that attach mode will find, if any. */
let existingAuthUser: { id: string; email: string } | null = null;
const ATTACH_ID = '33333333-3333-4333-8333-333333333333';

const post = (body: unknown): NextRequest => ({ json: async () => body, cookies: { getAll: () => [] } } as unknown as NextRequest);

const ADMIN_IS_ADMIN: Handler = () => ({ data: { id: 'admin-1', role: 'admin' }, error: null });

/**
 * Every one of these routes reads `profiles` twice through the same shape:
 * first salesPrincipal() resolving the CALLER, then the target/staff check.
 * This helper answers call 1 as the admin caller and every later call with
 * whatever the test actually cares about.
 */
function principalThen(rest: Handler): Handler {
  return (call) => (call === 1 ? { data: { id: 'admin-1', role: 'admin' }, error: null } : rest(call));
}

const PART_TIME_TERMS = {
  work_days: [2, 4], work_start_ist: '18:00', work_end_ist: '21:00',
  max_capacity_units: 12, max_new_per_day: 4,
  // Pay joined the required statement on 28 Aug 2026 (see
  // sales-rep-provisioning.ts). Without these two, every part-time fixture
  // below is refused before it reaches the behaviour it means to test.
  monthly_fixed_paise: 800_000, incentive_percent: 10,
};

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = { id: 'admin-1' };
  existingAuthUser = null;
  capacityMock.getTeamCapacity.mockResolvedValue([]);
});

describe('POST /api/admin/create-sales-rep', () => {
  it('refuses a non-admin, and mints nothing', async () => {
    currentAdmin = makeAdmin({ 'profiles.select': () => ({ data: { id: 'rep-9', role: 'sales' }, error: null }) });
    const res = await createRep(post({ mode: 'create', employment_type: 'full_time', email: 'x@y.in', fullName: 'X Y', password: 'x'.repeat(12) }));
    expect(res.status).toBe(403);
    expect(currentAdmin.createUser).not.toHaveBeenCalled();
    expect(currentAdmin.writes).toHaveLength(0);
  });

  it('refuses a part-time seat with no terms BEFORE creating the login', async () => {
    // Ordering is the point: a refusal after createUser would leave an orphan
    // auth user behind every time the founder mistyped a form.
    currentAdmin = makeAdmin({ 'profiles.select': ADMIN_IS_ADMIN });
    const res = await createRep(post({ mode: 'create', employment_type: 'part_time', email: 'part@careerrai.in', fullName: 'Part Time', password: 'x'.repeat(12) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('max_capacity_units') });
    expect(currentAdmin.createUser).not.toHaveBeenCalled();
  });

  it('never converts an existing student into staff', async () => {
    currentAdmin = makeAdmin({
      'profiles.select': principalThen(() => ({ data: { id: 'student-7', role: 'student', full_name: 'A Student' }, error: null })),
    });
    const res = await createRep(post({ mode: 'create', employment_type: 'part_time', email: 'taken@careerrai.in', fullName: 'Part Time', password: 'x'.repeat(12), ...PART_TIME_TERMS }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('student');
    expect(currentAdmin.createUser).not.toHaveBeenCalled();
    // The decisive assertion: the student's profile row was never touched.
    expect(currentAdmin.writes.filter((w: any) => w.table === 'profiles')).toHaveLength(0);
  });

  it('provisions a described part-time seat through Supabase Auth, with role sales', async () => {
    currentAdmin = makeAdmin({
      'profiles.select': principalThen(() => ({ data: null, error: null })),
      'sales_rep_config.upsert': () => ({ data: { rep_id: 'new-user-1', employment_type: 'part_time', ...PART_TIME_TERMS }, error: null }),
    });
    const res = await createRep(post({ mode: 'create', employment_type: 'part_time', email: 'part@careerrai.in', fullName: 'Part Time', phone: '9876543210', password: 'x'.repeat(12), ...PART_TIME_TERMS }));
    expect(res.status).toBe(200);
    expect(currentAdmin.createUser).toHaveBeenCalledOnce();

    const profileWrite = currentAdmin.writes.find((w: any) => w.table === 'profiles');
    expect(profileWrite.payload).toMatchObject({ id: 'new-user-1', role: 'sales', full_name: 'Part Time' });
    // Phone is normalised to the form the login door looks up by.
    expect(profileWrite.payload.phone).toBe('+919876543210');
    // No student privilege is granted along the way.
    expect(profileWrite.payload).not.toHaveProperty('is_premium');

    const cfgWrite = currentAdmin.writes.find((w: any) => w.table === 'sales_rep_config');
    expect(cfgWrite.payload).toMatchObject({ rep_id: 'new-user-1', employment_type: 'part_time', max_capacity_units: 12, max_new_per_day: 4 });
  });

  // ── attach mode ───────────────────────────────────────────────────────────
  //
  // The PR audit found create mode refused to promote an existing person and
  // attach mode did not. These four run the same rule down the other key.

  it('never converts a STUDENT whose auth uuid is pasted into attach mode', async () => {
    existingAuthUser = { id: ATTACH_ID, email: 'a.student@gmail.com' };
    currentAdmin = makeAdmin({
      'profiles.select': principalThen(() => ({ data: { id: ATTACH_ID, role: 'student', full_name: 'A Student' }, error: null })),
    });
    const res = await createRep(post({ mode: 'attach', userId: ATTACH_ID, employment_type: 'part_time', fullName: 'Part Time', ...PART_TIME_TERMS }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('student');
    // The student's row is untouched — no role rewrite, no config row.
    expect(currentAdmin.writes).toHaveLength(0);
  });

  it('refuses a buddy/mentor uuid too — the rule is "not already someone else"', async () => {
    existingAuthUser = { id: ATTACH_ID, email: 'mentor@careerrai.in' };
    currentAdmin = makeAdmin({
      'profiles.select': principalThen(() => ({ data: { id: ATTACH_ID, role: 'buddy', full_name: 'A Mentor' }, error: null })),
    });
    const res = await createRep(post({ mode: 'attach', userId: ATTACH_ID, employment_type: 'full_time', fullName: 'Part Time' }));
    expect(res.status).toBe(400);
    expect(currentAdmin.writes).toHaveLength(0);
  });

  it('still attaches and configures an EXISTING sales account', async () => {
    existingAuthUser = { id: ATTACH_ID, email: 'parttime@careerrai.in' };
    currentAdmin = makeAdmin({
      'profiles.select': principalThen(() => ({ data: { id: ATTACH_ID, role: 'sales', full_name: 'Part Time' }, error: null })),
      'sales_rep_config.upsert': () => ({ data: { rep_id: ATTACH_ID, employment_type: 'part_time', ...PART_TIME_TERMS }, error: null }),
    });
    const res = await createRep(post({ mode: 'attach', userId: ATTACH_ID, employment_type: 'part_time', fullName: 'Part Time', ...PART_TIME_TERMS }));
    expect(res.status).toBe(200);
    // No new login is minted for someone who already has one.
    expect(currentAdmin.createUser).not.toHaveBeenCalled();
    expect(currentAdmin.writes.find((w: any) => w.table === 'profiles').payload).toMatchObject({ id: ATTACH_ID, role: 'sales' });
    expect(currentAdmin.writes.find((w: any) => w.table === 'sales_rep_config').payload).toMatchObject({ rep_id: ATTACH_ID, employment_type: 'part_time', max_capacity_units: 12 });
  });

  it('attaches an auth user with no CareerRai profile yet', async () => {
    // The documented Supabase-Dashboard-first flow: the login exists, nobody
    // is on the other end of it in profiles.
    existingAuthUser = { id: ATTACH_ID, email: 'parttime@careerrai.in' };
    currentAdmin = makeAdmin({
      'profiles.select': principalThen(() => ({ data: null, error: null })),
      'sales_rep_config.upsert': () => ({ data: { rep_id: ATTACH_ID }, error: null }),
    });
    const res = await createRep(post({ mode: 'attach', userId: ATTACH_ID, employment_type: 'full_time', fullName: 'Part Time' }));
    expect(res.status).toBe(200);
    expect(currentAdmin.writes.find((w: any) => w.table === 'profiles').payload).toMatchObject({ role: 'sales' });
  });

  it('does not treat an unreadable profile as "nobody is there"', async () => {
    existingAuthUser = { id: ATTACH_ID, email: 'parttime@careerrai.in' };
    currentAdmin = makeAdmin({
      'profiles.select': principalThen(() => ({ data: null, error: { message: 'timeout' } })),
    });
    const res = await createRep(post({ mode: 'attach', userId: ATTACH_ID, employment_type: 'full_time', fullName: 'Part Time' }));
    expect(res.status).toBe(503);
    expect(currentAdmin.writes).toHaveLength(0);
  });

  it('never writes the password anywhere', async () => {
    currentAdmin = makeAdmin({
      'profiles.select': principalThen(() => ({ data: null, error: null })),
      'sales_rep_config.upsert': () => ({ data: { rep_id: 'new-user-1' }, error: null }),
    });
    await createRep(post({ mode: 'create', employment_type: 'full_time', email: 'ft@careerrai.in', fullName: 'F T', password: 'n0t-in-the-db!' }));
    expect(JSON.stringify(currentAdmin.writes)).not.toContain('n0t-in-the-db');
  });
});

describe('POST /api/admin/rep-config', () => {
  it('refuses to flip an existing full-timer to part-time without terms, and writes nothing', async () => {
    currentAdmin = makeAdmin({
      'profiles.select': principalThen(() => ({ data: { id: 'rep-1', role: 'sales' }, error: null })),
      'sales_rep_config.select': () => ({ data: { rep_id: 'rep-1', employment_type: 'full_time', max_capacity_units: 50 }, error: null }),
    });
    const res = await repConfig(post({ repId: '11111111-1111-4111-8111-111111111111', employment_type: 'part_time' }));
    expect(res.status).toBe(400);
    expect(currentAdmin.writes.filter((w: any) => w.table === 'sales_rep_config')).toHaveLength(0);
  });

  it('accepts the same flip when the terms come with it', async () => {
    currentAdmin = makeAdmin({
      'profiles.select': principalThen(() => ({ data: { id: 'rep-1', role: 'sales' }, error: null })),
      'sales_rep_config.select': () => ({ data: { rep_id: 'rep-1', employment_type: 'full_time' }, error: null }),
      'sales_rep_config.upsert': () => ({ data: { rep_id: 'rep-1', employment_type: 'part_time' }, error: null }),
    });
    const res = await repConfig(post({ repId: '11111111-1111-4111-8111-111111111111', employment_type: 'part_time', ...PART_TIME_TERMS }));
    expect(res.status).toBe(200);
    const w = currentAdmin.writes.find((x: any) => x.table === 'sales_rep_config');
    expect(w.payload).toMatchObject({ employment_type: 'part_time', max_capacity_units: 12, work_days: [2, 4] });
  });

  it('does not silently treat an unreadable current row as "no existing row"', async () => {
    currentAdmin = makeAdmin({
      'profiles.select': principalThen(() => ({ data: { id: 'rep-1', role: 'sales' }, error: null })),
      'sales_rep_config.select': () => ({ data: null, error: { message: 'timeout' } }),
    });
    const res = await repConfig(post({ repId: '11111111-1111-4111-8111-111111111111', max_new_per_day: 9 }));
    expect(res.status).toBe(503);
    expect(currentAdmin.writes).toHaveLength(0);
  });
});

describe('POST /api/admin/distribute-leads', () => {
  const cap = (over: Partial<RepCapacity>): RepCapacity => ({
    repId: 'rep-1', name: 'Part time', configured: true,
    config: {
      repId: 'rep-1', active: true, employmentType: 'part_time', workDays: [2, 4],
      workStartIst: '18:00', workEndIst: '21:00', maxCapacityUnits: 12, maxNewPerDay: 4,
      firstContactSlaMinutes: 120, unavailableUntil: null, capacityOverride: null, overrideUntil: null,
    },
    capacity: 12, activeNow: 0, available: 12, newToday: null, overflow: 0, inWindow: true,
    binding: 'ASSIGNABLE', readFailed: false, workItems: [], dormantCount: 0, ...over,
  });
  const REP = '22222222-2222-4222-8222-222222222222';

  it('refuses an allocation that exceeds the configured ceiling, and moves NOTHING', async () => {
    currentAdmin = makeAdmin({ 'profiles.select': principalThen(() => ({ data: [{ id: REP, role: 'sales' }], error: null })) });
    capacityMock.getTeamCapacity.mockResolvedValue([cap({ repId: REP })]);
    const res = await distribute(post({ pool: 'unassigned', allocation: [{ repId: REP, count: 50 }] }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.rejected[0]).toMatchObject({ requested: 50, allowed: 4 });
    expect(currentAdmin.writes.filter((w: any) => w.table === 'lead_outreach')).toHaveLength(0);
  });

  it('refuses an unconfigured rep rather than treating them as a full-time one', async () => {
    currentAdmin = makeAdmin({ 'profiles.select': principalThen(() => ({ data: [{ id: REP, role: 'sales' }], error: null })) });
    capacityMock.getTeamCapacity.mockResolvedValue([cap({ repId: REP, configured: false, config: null, capacity: null, available: 0 })]);
    const res = await distribute(post({ pool: 'unassigned', allocation: [{ repId: REP, count: 1 }] }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('no capacity row exists');
  });

  it('refuses a rep whose capacity could not be read — never as "they have room"', async () => {
    currentAdmin = makeAdmin({ 'profiles.select': principalThen(() => ({ data: [{ id: REP, role: 'sales' }], error: null })) });
    capacityMock.getTeamCapacity.mockResolvedValue([cap({ repId: REP, readFailed: true })]);
    const res = await distribute(post({ pool: 'unassigned', allocation: [{ repId: REP, count: 1 }] }));
    expect(res.status).toBe(409);
    expect(currentAdmin.writes.filter((w: any) => w.table === 'lead_outreach')).toHaveLength(0);
  });

  it('lets an allocation inside the ceiling through', async () => {
    currentAdmin = makeAdmin({
      'profiles.select': principalThen(() => ({ data: [{ id: REP, role: 'sales' }], error: null })),
      'lead_outreach.select': () => ({ data: [{ student_id: 's1' }, { student_id: 's2' }], error: null }),
    });
    capacityMock.getTeamCapacity.mockResolvedValue([cap({ repId: REP })]);
    const res = await distribute(post({ pool: 'unassigned', allocation: [{ repId: REP, count: 2 }] }));
    expect(res.status).toBe(200);
    expect(currentAdmin.writes.filter((w: any) => w.table === 'lead_outreach')).toHaveLength(1);
  });
});
