import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ACTIVITY_STATUSES, leadVisibleTo } from './sales-disposition';

// ── SA-1D: one shared book, atomic claim, auditable reassignment ───────────
//
// The failure this guards against is the classic CRM race: two reps read an
// unowned lead, both write their name, last write wins, both dial the same
// student. The claim must be ONE conditional DB statement — never a
// read-then-write in application code — and ownership must never be settable
// by free text.

const MIGRATION = 'supabase/migrations/20260820c_sales_claim.sql';
const LOG_ROUTE = 'src/app/api/sales/log/route.ts';
const OUTREACH_ROUTE = 'src/app/api/admin/outreach/route.ts';
const REASSIGN_ROUTE = 'src/app/api/admin/reassign-lead/route.ts';

describe('the claim is one atomic conditional statement', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('claims via INSERT .. ON CONFLICT DO UPDATE, not read-then-write', () => {
    expect(sql).toMatch(/insert into public\.lead_outreach[\s\S]*?on conflict \(student_id\) do update/);
  });

  it('the update only fires when unowned or re-claimed by the same owner', () => {
    expect(sql).toMatch(/where lead_outreach\.owner is null or lead_outreach\.owner = excluded\.owner/);
  });

  it('clients can never call the claim directly', () => {
    expect(sql).toMatch(/revoke execute on function public\.claim_lead[\s\S]*?from public, anon, authenticated/);
  });
});

describe('activity vocabulary: code and DB CHECK stay one list', () => {
  it('the sales_activity CHECK lists exactly ACTIVITY_STATUSES', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const m = sql.match(/sales_activity_status_check\s*\n?\s*check \(status in \(([^)]+)\)\)/);
    expect(m, 'CHECK constraint not found in migration').toBeTruthy();
    const dbList = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    expect(dbList).toEqual([...ACTIVITY_STATUSES].sort());
  });

  it("'reassigned' is an activity value, never a lead status or call outcome", async () => {
    const { LEAD_STATUSES, CALL_OUTCOMES } = await import('./sales-disposition');
    expect(LEAD_STATUSES).not.toContain('reassigned');
    expect(CALL_OUTCOMES).not.toContain('reassigned');
  });
});

describe('ownership is written only by claim and reassign', () => {
  it('the disposition route claims BEFORE writing state', () => {
    const s = readFileSync(LOG_ROUTE, 'utf8');
    const claimAt = s.indexOf("rpc('claim_lead'");
    const stateAt = s.indexOf(".from('lead_outreach').upsert(");
    expect(claimAt).toBeGreaterThan(-1);
    expect(stateAt).toBeGreaterThan(claimAt);
  });

  it('a lost claim is a 409, and the disposition upsert no longer writes owner', () => {
    const s = readFileSync(LOG_ROUTE, 'utf8');
    expect(s).toContain('status: 409');
    expect(s).not.toMatch(/(?<!p_)owner:\s*actor/); // p_owner: actor (the claim RPC arg) is the one legal spelling
  });

  it('the admin outreach form cannot set ownership any more', () => {
    const s = readFileSync(OUTREACH_ROUTE, 'utf8');
    expect(s).not.toMatch(/owner\s*:\s*typeof/);
    expect(s).not.toMatch(/\bowner\b\s*[,}]\s*=?\s*body/);
  });

  it('reassignment validates a canonical rep record and appends history', () => {
    const s = readFileSync(REASSIGN_ROUTE, 'utf8');
    expect(s).toMatch(/role !== 'sales' && target\.role !== 'admin'/);
    expect(s).toContain("status: 'reassigned'");
    // History failure surfaces — a reassign must never silently lose its trail.
    expect(s).toMatch(/historyError/);
  });
});

describe('queue visibility (one shared book)', () => {
  it('unclaimed leads are available to every rep', () => {
    expect(leadVisibleTo(null, 'priya@careerrai.in')).toBe(true);
    expect(leadVisibleTo(undefined, 'priya@careerrai.in')).toBe(true);
  });

  it('a claimed lead is actionable only for its owner', () => {
    expect(leadVisibleTo('priya@careerrai.in', 'priya@careerrai.in')).toBe(true);
    expect(leadVisibleTo('nishant@careerrai.in', 'priya@careerrai.in')).toBe(false);
  });

  it('the admin oversight frame (no rep context) sees everything', () => {
    expect(leadVisibleTo('priya@careerrai.in', undefined)).toBe(true);
    expect(leadVisibleTo('priya@careerrai.in', null)).toBe(true);
  });

  it('the canonical queue actually applies the rule', () => {
    const s = readFileSync('src/lib/call-queue.ts', 'utf8');
    expect(s).toMatch(/leadVisibleTo\(/);
    expect(s).toMatch(/select\('student_id, status, callback_at, next_action_at, last_attempt_at, no_answer_count, owner'\)/);
  });
});
