import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from './test-support/code-only';
import { MAX_ACTIVE_SALES_SEATS, checkSeatCap, repAllocationLimit } from './sales-rep-provisioning';
import { activeSeat, salesPrincipal } from './sales-authz';
import type { RepCapacity } from './sales-capacity';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── THE SALES TEAM IS TWO SEATS, AND A RETIRED SEAT IS OFF THE TEAM ─────────
//
// Founder decision, 29 Aug 2026: the active sales team is exactly two
// part-time counsellors — Neelam and Anshul — and no old account may receive
// new work of any kind. Four mechanisms carry that rule, and this suite pins
// each one to the failure it exists to prevent:
//
//   1. MAX_ACTIVE_SALES_SEATS + checkSeatCap  — no third concurrent seat
//      through create-sales-rep or rep-config. (The DB trigger in
//      20260829b_two_seat_sales_team.sql enforces the same cap against every
//      other client; its behaviour was proven with live INSERT probes on the
//      test project: third seat → check_violation, swap after deactivation →
//      accepted, re-saving an active row → accepted.)
//   2. salesPrincipal / activeSeat — a 'sales' role WITHOUT an active seat
//      resolves to NO principal, so a deactivated rep loses the queue, the
//      board, and the self-claim path in one authority.
//   3. repAllocationLimit — INACTIVE answers 0 to every allocation question,
//      which distribute-leads enforces with a 409.
//   4. reassign-lead — the named-target override no longer overrides
//      deactivation: INACTIVE refuses where over-capacity merely warns.
//
// WHY A CAP, NOT A NAME LIST: which two people hold the seats is data at
// /admin/sales/capacity, not code. See sales-rep-provisioning.ts.

const ROOT = join(__dirname, '..');
const read = (rel: string) => codeOnly(readFileSync(join(ROOT, rel), 'utf8'));

// A Supabase-shaped double for sales_rep_config reads.
function seatAdmin(rows: Array<{ rep_id: string; active: boolean }>, failRead = false) {
  return {
    from: (table: string) => ({
      select: () => {
        const chain: any = {
          eq: (col: string, v: unknown) => {
            if (col === 'active') {
              const filtered = rows.filter((r) => r.active === v);
              return {
                neq: (_c: string, id: unknown) => failRead
                  ? Promise.resolve({ data: null, error: { message: 'boom' } })
                  : Promise.resolve({ data: filtered.filter((r) => r.rep_id !== id), error: null }),
              };
            }
            // activeSeat's shape: .eq('rep_id', id).maybeSingle()
            return {
              maybeSingle: async () => failRead
                ? { data: null, error: { message: 'boom' } }
                : { data: rows.find((r) => r.rep_id === v) ?? null, error: null },
            };
          },
        };
        return chain;
      },
      _table: table,
    }),
  };
}

const NEELAM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ANSHUL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LEGACY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('the seat cap', () => {
  it('is exactly two', () => {
    expect(MAX_ACTIVE_SALES_SEATS).toBe(2);
  });

  it('refuses a third seat while two are active', async () => {
    const admin = seatAdmin([
      { rep_id: NEELAM, active: true },
      { rep_id: ANSHUL, active: true },
    ]);
    const res = await checkSeatCap(admin, LEGACY);
    expect(res.ok).toBe(false);
    expect(res.activeNow).toBe(2);
  });

  it('re-activating one of the two is idempotent, not a third seat', async () => {
    const admin = seatAdmin([
      { rep_id: NEELAM, active: true },
      { rep_id: ANSHUL, active: true },
    ]);
    const res = await checkSeatCap(admin, ANSHUL);
    expect(res.ok).toBe(true);
  });

  it('allows the second seat while only one is active', async () => {
    const admin = seatAdmin([{ rep_id: NEELAM, active: true }]);
    expect((await checkSeatCap(admin, ANSHUL)).ok).toBe(true);
  });

  it('fails CLOSED when the team cannot be read', async () => {
    const admin = seatAdmin([], true);
    const res = await checkSeatCap(admin, ANSHUL);
    expect(res.ok).toBe(false);
  });

  it('both write routes consult it, and the migration carries the trigger', () => {
    for (const rel of ['app/api/admin/create-sales-rep/route.ts', 'app/api/admin/rep-config/route.ts']) {
      expect(read(rel), `${rel} must enforce the seat cap`).toMatch(/\bcheckSeatCap\s*\(/);
    }
    const sql = readFileSync(join(ROOT, '..', 'supabase/migrations/20260829b_two_seat_sales_team.sql'), 'utf8');
    expect(sql).toMatch(/create trigger sales_seat_cap/);
    expect(sql).toMatch(/v_cap constant int := 2;/);
    expect(sql).toMatch(/pg_advisory_xact_lock/);
  });
});

describe('a deactivated seat is off the team', () => {
  const profiles = (role: string) => ({
    from: (table: string) => table === 'profiles'
      ? { select: () => ({ eq: () => ({ single: async () => ({ data: { id: LEGACY, role }, error: null }) }) }) }
      : seatAdmin([{ rep_id: LEGACY, active: false }]).from(table),
  });

  it('activeSeat: false for an inactive row, false for NO row, false on read error', async () => {
    expect(await activeSeat(seatAdmin([{ rep_id: LEGACY, active: false }]), LEGACY)).toBe(false);
    expect(await activeSeat(seatAdmin([]), LEGACY)).toBe(false);
    expect(await activeSeat(seatAdmin([], true), LEGACY)).toBe(false);
    expect(await activeSeat(seatAdmin([{ rep_id: NEELAM, active: true }]), NEELAM)).toBe(true);
  });

  it('salesPrincipal: a sales role with a dead seat gets NO principal', async () => {
    expect(await salesPrincipal(profiles('sales'), LEGACY)).toBeNull();
  });

  it('salesPrincipal: an admin needs no seat', async () => {
    const p = await salesPrincipal(profiles('admin'), LEGACY);
    expect(p?.role).toBe('admin');
  });

  it('salesPrincipal: an ACTIVE sales seat still resolves', async () => {
    const admin = {
      from: (table: string) => table === 'profiles'
        ? { select: () => ({ eq: () => ({ single: async () => ({ data: { id: NEELAM, role: 'sales' }, error: null }) }) }) }
        : seatAdmin([{ rep_id: NEELAM, active: true }]).from(table),
    };
    const p = await salesPrincipal(admin, NEELAM);
    expect(p?.id).toBe(NEELAM);
  });

  it('the PAGE gate uses the same authority as the API gate', () => {
    // requireSales and salesPrincipal disagreeing about who is on the team is
    // the split-brain this line prevents: a rep who can SEE the workspace but
    // whose every action 403s, or worse, the reverse.
    expect(read('lib/admin-auth.ts')).toMatch(/\bactiveSeat\s*\(/);
  });
});

describe('no assignment path reaches an inactive rep', () => {
  const inactiveCap = {
    repId: LEGACY, name: 'Legacy', configured: true,
    config: { repId: LEGACY, active: false, employmentType: 'full_time', workDays: [1, 2, 3, 4, 5, 6], workStartIst: '10:00:00', workEndIst: '19:00:00', maxCapacityUnits: 50, maxNewPerDay: 15, unavailableUntil: null, capacityOverride: null, overrideUntil: null },
    capacity: 0, activeNow: 0, available: 0, overflow: 0, newToday: 0, readFailed: false,
  } as unknown as RepCapacity;

  it('allocation answers 0 for INACTIVE', () => {
    const limit = repAllocationLimit(inactiveCap);
    expect(limit.ok).toBe(false);
    if (!limit.ok) expect(limit.reason).toBe('INACTIVE');
  });

  it('the named-target override in reassign-lead does NOT override deactivation', () => {
    const code = read('app/api/admin/reassign-lead/route.ts');
    // The refusal must sit BEFORE the upsert that hands over the leads.
    const refusalAt = code.search(/reason === ['"]INACTIVE['"]/);
    const upsertAt = code.indexOf(".upsert(");
    expect(refusalAt, 'reassign-lead no longer refuses an INACTIVE target').toBeGreaterThan(-1);
    expect(upsertAt).toBeGreaterThan(-1);
    expect(refusalAt).toBeLessThan(upsertAt);
    expect(code.slice(refusalAt - 400, refusalAt + 400)).toMatch(/409/);
  });

  it('pool distribution refuses rather than reroutes', () => {
    // distribute-leads: any rejected allocation fails the WHOLE request with
    // 409 — leads stay queued rather than silently flowing to whoever has
    // room, and never to an inactive account (allowed=0 via repAllocationLimit).
    const code = read('app/api/admin/distribute-leads/route.ts');
    expect(code).toMatch(/repAllocationLimit\s*\(/);
    expect(code).toMatch(/status:\s*409/);
  });
});
