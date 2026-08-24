import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ACTIVITY_STATUSES } from './sales-disposition';
import { canAccessLead, resolveOwnerToken, type SalesPrincipal, type StaffDirectory } from './sales-authz';

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
    // 20260824b supersedes 20260820c's CHECK: same constraint, 'dnd' added.
    // The guard always reads the NEWEST definition.
    const sql = readFileSync('supabase/migrations/20260824b_dnd_status.sql', 'utf8');
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

describe('queue visibility (one shared book), keyed on profiles.id', () => {
  const REP_A = '11111111-1111-4111-8111-111111111111';
  const REP_B = '22222222-2222-4222-8222-222222222222';
  const ADMIN = '33333333-3333-4333-8333-333333333333';
  const repA: SalesPrincipal = { id: REP_A, role: 'sales' };
  const admin: SalesPrincipal = { id: ADMIN, role: 'admin' };
  const dir: StaffDirectory = {
    byToken: new Map([
      [REP_A, REP_A], ['a@careerrai.in', REP_A],
      [REP_B, REP_B], ['b@careerrai.in', REP_B],
    ]),
    labelById: new Map(),
  };
  const own = (t: string | null) => resolveOwnerToken(t, dir);

  it('unclaimed leads are available to every rep', () => {
    expect(canAccessLead(own(null), repA)).toBe(true);
    expect(canAccessLead(own(''), repA)).toBe(true);
  });

  it('a claimed lead is actionable only for its owner', () => {
    expect(canAccessLead(own(REP_A), repA)).toBe(true);
    expect(canAccessLead(own(REP_B), repA)).toBe(false);
  });

  it('a legacy email token still resolves to the right person', () => {
    // The bridge: lead_outreach.owner is TEXT and historically held an email.
    expect(canAccessLead(own('a@careerrai.in'), repA)).toBe(true);
    expect(canAccessLead(own('b@careerrai.in'), repA)).toBe(false);
  });

  it('admin oversight is granted by ROLE, never by an absent value', () => {
    expect(canAccessLead(own(REP_B), admin)).toBe(true);
  });

  // THE regression this phase exists for. Before R3 a rep with no email was
  // passed `repEmail = null`, and `leadVisibleTo(owner, null)` returned true
  // for every lead — a missing column granted the founder's oversight frame.
  it('an unidentifiable viewer is DENIED, never given oversight', () => {
    expect(canAccessLead(own(REP_B), null)).toBe(false);
    expect(canAccessLead(own(REP_A), null)).toBe(false);
    // ...and an unclaimed lead is withheld too: no identity, no book.
    expect(canAccessLead(own(null), null)).toBe(false);
  });

  it('an owner we cannot attribute is withheld, not treated as unclaimed', () => {
    expect(canAccessLead(own('someone-who-left@careerrai.in'), repA)).toBe(false);
    expect(canAccessLead({ kind: 'unavailable', reason: 'x' }, repA)).toBe(false);
    // A failed read must never become a business answer.
    expect(canAccessLead({ kind: 'unavailable', reason: 'x' }, admin)).toBe(true); // admin is role-based
  });

  it('the canonical queue actually applies the rule', () => {
    const s = readFileSync('src/lib/call-queue.ts', 'utf8');
    expect(s).toMatch(/canAccessLead\(/);
    expect(s).toMatch(/resolveOwnerToken\(/);
    // The queue must read BOTH ownership encodings: owner_id is the authority,
    // `owner` is the legacy text still resolved for pre-migration rows.
    expect(s).toMatch(/owner_id, owner/);
  });
});
