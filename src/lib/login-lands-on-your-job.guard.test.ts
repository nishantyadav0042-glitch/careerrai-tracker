import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { homeForRole } from './admin-auth';

// ── EVERY DOOR MUST LEAD TO YOUR OWN WORKSPACE (30 Aug 2026) ───────────────
//
// There are two ways into this product and they disagreed.
//
// The password route mapped `sales` to /sales correctly. The OAuth callback
// derived its role from the ALLOWLIST ENTRY (`entry?.person_type`), a field
// that can only be 'student' or 'buddy' — so a signed-in counsellor arriving
// through the Google button was typed as a student and dropped on
// /student/tracker, the study tracker, with no path to their queue and nothing
// to suggest one existed.
//
// It mattered because of who it would hit: Anshul had never signed in once,
// and the Google button is the one on the login screen. He would have met this
// on his first morning and concluded the product had nothing for him.
//
// The underlying cause is duplication. This decision was written by hand in
// three places; the sales case was simply missing from one. These tests hold
// the copies to the same answer.

const callback = readFileSync('src/app/auth/callback/route.ts', 'utf8');
const passwordLogin = readFileSync('src/app/api/auth/login/route.ts', 'utf8');

describe('homeForRole is the one map', () => {
  it.each([
    ['sales', '/sales'],
    ['admin', '/admin'],
    ['student', '/student/tracker'],
  ])('%s belongs at %s', (role, dest) => {
    expect(homeForRole(role)).toBe(dest);
  });

  it('an unknown role goes to login, never to somebody else\'s workspace', () => {
    expect(homeForRole(null)).toBe('/login');
    expect(homeForRole('nonsense')).toBe('/login');
  });
});

describe('the OAuth callback lands people by their real role', () => {
  it('uses the profile role, not the allowlist entry, to choose the destination', () => {
    // `effectiveRole` is `existing?.role` — what the person actually IS.
    // `role` is entry?.person_type and can never say 'sales'.
    expect(callback, 'the landing decision must read the profile role')
      .toMatch(/const roleDest = next \?\? \(effectiveRole === 'buddy'/);
  });

  it('routes through homeForRole instead of a fourth hand-written ternary', () => {
    expect(callback).toMatch(/homeForRole\(effectiveRole\)/);
    expect(callback).toMatch(/from '@\/lib\/admin-auth'/);
  });

  // Incident #62: the role-correct destination is computed first and then
  // OVERRIDDEN by the anchor gate. Both facts matter — a rename that dropped
  // the gate would still satisfy the role assertion below.
  it('an unanchored account cannot reach its role destination', () => {
    expect(callback).toMatch(/arrival\.kind === 'gate_link_phone'/);
    expect(callback).toMatch(/LINK_PHONE_PATH/);
  });

  it('the set-password wall also respects the real role', () => {
    // Using the entry-derived role here sent a counsellor through a wall meant
    // for staff, or past one meant for them, depending on the entry.
    expect(callback).toMatch(/const normalRoleDest = \(effectiveRole === 'student' \|\| hasPassword\)/);
  });

  it('a buddy still lands on their student list, not the generic home', () => {
    // Deliberately NOT homeForRole('buddy') — this route has always sent
    // buddies to /buddy/students and that is a different, correct answer.
    expect(callback).toMatch(/effectiveRole === 'buddy' \? '\/buddy\/students'/);
  });

  it('the old entry-derived landing is gone', () => {
    expect(
      callback.includes("const dest = (role === 'student' || hasPassword)"),
      'the destination must not be chosen from the allowlist entry any more',
    ).toBe(false);
  });
});

describe('both doors agree about a counsellor', () => {
  it('the password route sends sales to /sales', () => {
    expect(passwordLogin).toMatch(/role === 'sales' \? '\/sales'/);
  });

  it('so neither door can strand a counsellor on a student page', () => {
    for (const [name, src] of [['callback', callback], ['password login', passwordLogin]] as const) {
      expect(src, `${name} must be able to produce /sales`).toMatch(/'\/sales'|homeForRole/);
    }
  });
});
