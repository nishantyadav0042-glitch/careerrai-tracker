import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  canAccessLead, resolveOwnerToken, salesPrincipal, ownerToken,
  type SalesPrincipal, type StaffDirectory,
} from './sales-authz';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── R2 + R3 regression suite ────────────────────────────────────────────────
//
// Two P1s are pinned here:
//
//   SEC-S2  /sales/student/[id] authenticated but not authorized — any rep
//           could open any real student by editing the URL, including another
//           rep's lead and that rep's private call notes.
//   SEC-S2b a `sales` profile with a NULL email produced `repEmail = null`,
//           and `leadVisibleTo(owner, null)` returned true for every lead, so
//           the absence of a column granted the founder's oversight frame.
//
// The rule under test is unchanged (SA-1D shared book). What changed is the KEY
// it is evaluated on and the DIRECTION it fails in.

const REP_A = '11111111-1111-4111-8111-111111111111';
const REP_B = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';

const repA: SalesPrincipal = { id: REP_A, role: 'sales' };
const repB: SalesPrincipal = { id: REP_B, role: 'sales' };
const admin: SalesPrincipal = { id: ADMIN, role: 'admin' };

// Deliberately models the production shape that caused SEC-S2b: the ADMIN row
// has no email at all, and REP_B has one. Nothing below may depend on that.
const dir: StaffDirectory = {
  byToken: new Map([
    [REP_A, REP_A],
    [REP_B, REP_B], ['b@careerrai.in', REP_B],
    [ADMIN, ADMIN],
  ]),
  labelById: new Map([[REP_A, 'Rep A'], [REP_B, 'Rep B'], [ADMIN, 'Founder']]),
};
const own = (t: string | null) => resolveOwnerToken(t, dir);

function fakeDb(profile: any, opts: { error?: string; seatActive?: boolean } = {}) {
  // Since the 29 Aug team reset, a 'sales' principal also requires an ACTIVE
  // seat in sales_rep_config (salesPrincipal → activeSeat). This harness
  // models that seat as active by default so every pre-existing assertion in
  // this file keeps testing what it always tested: the ROLE and EMAIL rules,
  // not the seat rule — sales-team-seats.guard.test.ts owns the seat rule.
  return {
    from() { return this; },
    select() { return this; },
    eq() { return this; },
    in() { return this; },
    async single() { return opts.error ? { data: null, error: { message: opts.error } } : { data: profile, error: null }; },
    async maybeSingle() {
      return opts.error
        ? { data: null, error: { message: opts.error } }
        : { data: { active: opts.seatActive ?? true }, error: null };
    },
  } as any;
}

describe('R2/R3 — ownership decision', () => {
  it('1. rep + own lead → ACCESS', () => {
    expect(canAccessLead(own(REP_A), repA)).toBe(true);
  });

  it('2. rep + another rep’s lead → DENY  (SEC-S2)', () => {
    expect(canAccessLead(own(REP_B), repA)).toBe(false);
    expect(canAccessLead(own(REP_A), repB)).toBe(false);
  });

  it('3. rep + unassigned lead → ACCESS (SA-1D shared book, the existing product contract)', () => {
    // Not an assumption: stated in lib/sales-authz, lib/call-queue, app/sales,
    // api/sales/log, and structurally required by claim_lead — a rep must be
    // able to act on an unclaimed lead in order to claim it on first contact.
    expect(canAccessLead(own(null), repA)).toBe(true);
  });

  it('4+5. a rep with NO email behaves EXACTLY like one with an email  (SEC-S2b)', () => {
    // REP_A has no email token in the directory at all; REP_B does.
    expect(canAccessLead(own(REP_A), repA)).toBe(true);   // own → access
    expect(canAccessLead(own(REP_B), repA)).toBe(false);  // other's → deny
    // The decisive assertion: having an email changes NOTHING. REP_A has no
    // email token, REP_B does — and each sees exactly its own book.
    expect(canAccessLead(own(REP_A), repA)).toBe(canAccessLead(own(REP_B), repB)); // both true
    expect(canAccessLead(own(REP_B), repA)).toBe(canAccessLead(own(REP_A), repB)); // both false
    // And neither of them is ever handed the oversight frame.
    expect(canAccessLead(own(REP_B), repA)).toBe(false);
  });

  it('6. an admin with NO email keeps explicit oversight', () => {
    expect(canAccessLead(own(REP_A), admin)).toBe(true);
    expect(canAccessLead(own(REP_B), admin)).toBe(true);
    expect(canAccessLead(own(null), admin)).toBe(true);
  });

  it('9+10. missing principal / unknown role → DENY, never oversight', () => {
    expect(canAccessLead(own(REP_B), null)).toBe(false);
    expect(canAccessLead(own(null), null)).toBe(false);
  });

  it('an owner token we cannot attribute is withheld, not treated as unclaimed', () => {
    expect(canAccessLead(own('someone-who-left@careerrai.in'), repA)).toBe(false);
  });

  it('a failed read is not a business answer — unavailable denies a rep', () => {
    expect(canAccessLead({ kind: 'unavailable', reason: 'lead_read_failed' }, repA)).toBe(false);
  });

  it('a null staff directory denies rather than silently unclaiming', () => {
    expect(resolveOwnerToken(REP_B, null)).toEqual({ kind: 'unavailable', reason: 'staff_directory_unavailable' });
    expect(canAccessLead(resolveOwnerToken(REP_B, null), repA)).toBe(false);
  });

  it('the token we WRITE is the uuid, never an email', () => {
    expect(ownerToken(repA)).toBe(REP_A);
    expect(ownerToken(admin)).toBe(ADMIN);
  });
});

describe('R3 — principal resolution', () => {
  it('7. a student is not a sales principal', async () => {
    expect(await salesPrincipal(fakeDb({ id: 'x', role: 'student' }), 'x')).toBeNull();
  });
  it('8. a buddy is not a sales principal', async () => {
    expect(await salesPrincipal(fakeDb({ id: 'x', role: 'buddy' }), 'x')).toBeNull();
  });
  it('10. a null role is not a sales principal', async () => {
    expect(await salesPrincipal(fakeDb({ id: 'x', role: null }), 'x')).toBeNull();
  });
  it('9. an unreadable profile yields NO principal (fail closed)', async () => {
    expect(await salesPrincipal(fakeDb(null, { error: 'boom' }), 'x')).toBeNull();
  });
  it('a sales row with a NULL email still yields a valid principal', async () => {
    // salesPrincipal does not even SELECT email — that is the point.
    expect(await salesPrincipal(fakeDb({ id: REP_A, role: 'sales' }), REP_A)).toEqual(repA);
  });
});

describe('R2 — the route actually enforces it', () => {
  const page = readFileSync('src/app/sales/student/[id]/page.tsx', 'utf8');

  it('authorizes BEFORE loading the student view', () => {
    const authAt = page.indexOf('canAccessLead(');
    const loadAt = page.indexOf('getSalesConversionView(');
    expect(authAt).toBeGreaterThan(-1);
    expect(loadAt).toBeGreaterThan(-1);
    expect(authAt).toBeLessThan(loadAt);
  });

  it('11+12+13. every denial renders the same surface — no existence oracle', () => {
    // Unauthorized, nonexistent, malformed and not-a-student must be
    // indistinguishable. One `if (!v)` branch is what guarantees that.
    expect(page.match(/Student not found/g)?.length).toBe(1);
    expect(page).toMatch(/allowed \? await getSalesConversionView/);
  });

  it('does not re-derive identity from an email anywhere on the page', () => {
    expect(page).not.toMatch(/\.email/);
  });
});

describe('R3 — request data can never become identity', () => {
  const log = readFileSync('src/app/api/sales/log/route.ts', 'utf8');
  const reassign = readFileSync('src/app/api/admin/reassign-lead/route.ts', 'utf8');

  it('14. the actor comes from the session, never from the body', () => {
    // The idea, not one line: the actor written to history is the authenticated
    // principal, and nothing else in the file may supply it.
    expect(log).toMatch(/actor_id: principal\.id/);
    expect(log).not.toMatch(/actor_id:\s*(body|req|request)/);
    // The body destructure must not contain any identity field.
    const destructure = log.match(/const \{[^}]*\} = body \?\? \{\};/)?.[0] ?? '';
    expect(destructure).not.toMatch(/actor|owner|repId|email|phone/);
  });

  it('15. no query parameter participates in authorization', () => {
    expect(log).not.toMatch(/searchParams/);
    expect(reassign).not.toMatch(/searchParams/);
  });

  it('ownership is written as a uuid, and the founder is no longer excluded', () => {
    expect(reassign).toMatch(/owner: target\.id/);
    // The old gate `|| !target.email` locked out the admin account, which has
    // no email — the one account that must always be able to own a lead.
    expect(reassign).not.toMatch(/!target\.email/);
  });

  it('a 409 does not leak another rep’s identity key', () => {
    expect(log).not.toMatch(/owned by \$\{claim/);
  });
});

describe('architecture guard — email/phone/name may never be the principal', () => {
  const src = readFileSync('src/lib/sales-authz.ts', 'utf8');

  // Encode the IDEA, not the characters: extract the two functions that make
  // an authorization decision and assert THEY never touch an attribute field.
  // A blanket file-wide grep would be wrong — loadStaffDirectory must read
  // email to build the legacy bridge.
  function body(fn: string): string {
    const start = src.indexOf(`export function ${fn}`) >= 0
      ? src.indexOf(`export function ${fn}`)
      : src.indexOf(`export async function ${fn}`);
    expect(start).toBeGreaterThan(-1);
    const rest = src.slice(start);
    const end = rest.indexOf('\n}\n');
    return rest.slice(0, end === -1 ? rest.length : end);
  }

  it('canAccessLead decides on ids and roles only', () => {
    const b = body('canAccessLead');
    expect(b).not.toMatch(/email|phone|full_name/);
    expect(b).toMatch(/principal\.id/);
    expect(b).toMatch(/principal\.role === 'admin'/);
  });

  it('salesPrincipal does not even select an email', () => {
    const b = body('salesPrincipal');
    expect(b).not.toMatch(/email|phone|full_name/);
    expect(b).toMatch(/select\('id, role'\)/);
  });

  it('the guard is not vacuous — a planted violation is caught', () => {
    const planted = "export function canAccessLead(a, b) {\n  return a.email === b.email;\n}\n";
    expect(planted).toMatch(/email/); // the check above would fail on this shape
  });

  it('no sales surface derives a viewer from an email fallback any more', () => {
    for (const f of [
      'src/app/sales/page.tsx',
      'src/app/sales/leads/page.tsx',
      'src/app/sales/summary/page.tsx',
      'src/app/sales/student/[id]/page.tsx',
    ]) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).not.toMatch(/__none__/);
      expect(s, f).not.toMatch(/email as string/);
    }
  });
});
