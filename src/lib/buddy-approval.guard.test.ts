import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── AN UNAPPROVED MENTOR IS NEVER HANDED TO A STUDENT ──────────────────────
//
// Until 5 Sep 2026 a buddy became recommendable by finishing their OWN
// onboarding form — the same form where they type their percentile, their IIM
// and their employer. Nobody verified any of it, and THREE separate surfaces
// read that state:
//
//   1. fetchEligibleBuddies  — the "Top buddies for you" showcase
//   2. mentor-doors          — free auto-assignment
//   3. session-credit        — PAID session assignment (₹299 already taken),
//                              which did not even exclude test accounts
//
// Incident #66 made it concrete: a phone-OTP fork arrived already holding
// role='buddy', one completed wizard away from a student's mentor list.
//
// Each of the three is a hand-out, so each needs the gate. This test pins all
// three, because fixing one and forgetting the others is exactly how Incident
// #62's lesson failed to reach the phone door.

const SURFACES: Array<{ file: string; what: string }> = [
  { file: 'src/lib/buddy-match.ts',    what: 'the "Top buddies for you" showcase' },
  { file: 'src/lib/mentor-doors.ts',   what: 'free mentor auto-assignment' },
  { file: 'src/lib/session-credit.ts', what: 'PAID session assignment' },
];

describe('every student-facing mentor surface requires admin approval', () => {
  it.each(SURFACES)('$what checks buddy_approved_at', ({ file, what }) => {
    const src = readFileSync(file, 'utf8');
    // The buddy selection must reject NULL approval. `.not(...,'is',null)` is
    // the shape the three queries use; a surface that stops asking has removed
    // the gate.
    expect(
      src.includes("buddy_approved_at"),
      `${file} selects mentors for ${what} without checking buddy_approved_at`,
    ).toBe(true);
    expect(src).toMatch(/\.not\('buddy_approved_at',\s*'is',\s*null\)/);
  });

  it('paid-session assignment also excludes test accounts', () => {
    // It was the only one of the three that did not, while being the surface
    // where money has already changed hands.
    const src = readFileSync('src/lib/session-credit.ts', 'utf8');
    expect(src).toMatch(/\.not\('is_test_account',\s*'is',\s*true\)/);
  });

  it('approval is a timestamp, never a boolean', () => {
    // A boolean can be flipped by any future upsert with no trace of who or
    // when. The column is the audit record.
    const route = readFileSync('src/app/api/admin/approve-buddy/route.ts', 'utf8');
    expect(route).toContain('buddy_approved_at');
    expect(route).toContain('buddy_approved_by');
    expect(route).toMatch(/new Date\(\)\.toISOString\(\)/);
  });

  it('the approve route is admin-only and refuses a non-buddy target', () => {
    const route = readFileSync('src/app/api/admin/approve-buddy/route.ts', 'utf8');
    expect(route).toMatch(/role !== 'admin'/);
    expect(route).toMatch(/status:\s*403/);
    // Never write approval onto a student or admin profile.
    expect(route).toMatch(/target\?\.role !== 'buddy'/);
  });

  it('approval cannot be granted by a missing or garbled field', () => {
    // `approved` must be an explicit boolean — a dropped field must never read
    // as "approve". Approval is deliberate or it is nothing.
    const route = readFileSync('src/app/api/admin/approve-buddy/route.ts', 'utf8');
    expect(route).toMatch(/typeof body\.approved !== 'boolean'/);
  });
});
