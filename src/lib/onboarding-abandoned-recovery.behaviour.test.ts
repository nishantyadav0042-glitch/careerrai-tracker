import { describe, it, expect } from 'vitest';

/**
 * ── THE INTERRUPTED STUDENT MUST BE ABLE TO COME BACK ───────────────────────
 *
 * 1 Sep. /api/auth/verify-phone-otp decided whether to apply a student's
 * /start answers with `(isStub || !existing)`, where isStub means the profile
 * still carries the auth trigger's 'New User' placeholder.
 *
 * That is a proxy for "brand new", and the route overwrites full_name with a
 * real name — or the literal 'Student' — on the FIRST verification. So isStub
 * is false from the second verification onward, and the draft could only ever
 * be applied once.
 *
 * applyOnboarding deliberately leaves onboarding_completed FALSE when the
 * coverage upsert fails, and a dropped connection or a closed tab does the
 * same. Such a student then had:
 *
 *   · onboarding_completed = false  → the student layout sends them to /start
 *   · full_name = real              → isStub false, so the draft is skipped
 *
 * They answer everything again, verify again, land on the same false branch,
 * and are sent back to /start again. An infinite loop with no way out, on the
 * only door students have. 23 students were sitting in that state in
 * production when this was found; none had returned yet, which is the only
 * reason it had not fired.
 *
 * These tests exercise the DECISION, not the route's I/O — the gate is one
 * boolean expression and the failure was entirely in that expression. The
 * shape of the real condition is pinned separately, against the route source,
 * by onboarding-authority.guard.test.ts.
 */

/** Profile shape the gate reads, as selected by the route. */
interface ProfileRow {
  full_name: string | null;
  onboarding_completed: boolean | null;
}

/** The OLD gate, kept so the regression is demonstrated rather than asserted. */
function oldGate(existing: ProfileRow | null, role: string, onboarding: unknown): boolean {
  const isStub = !!existing && (!existing.full_name || existing.full_name === 'New User');
  return (isStub || !existing) && role === 'student' && !!onboarding;
}

/** The gate as it now stands in verify-phone-otp. */
function currentGate(existing: ProfileRow | null, role: string, onboarding: unknown): boolean {
  return existing?.onboarding_completed !== true && role === 'student' && !!onboarding;
}

const DRAFT = { target_percentile: 95, topic_matrix: [{ section: 'QA', topic: 'Algebra', status: 'learning' }] };

const BRAND_NEW = null;
const TRIGGER_STUB: ProfileRow = { full_name: 'New User', onboarding_completed: false };
/** Interrupted mid-signup: real name written, onboarding never completed. */
const INTERRUPTED: ProfileRow = { full_name: 'Aditya Rao', onboarding_completed: false };
/** Same, for a student who gave no name — the route writes the literal 'Student'. */
const INTERRUPTED_NONAME: ProfileRow = { full_name: 'Student', onboarding_completed: false };
const FINISHED: ProfileRow = { full_name: 'Aditya Rao', onboarding_completed: true };

describe('the interrupted student is no longer trapped', () => {
  it('REGRESSION: the old gate refused to re-apply, which is what caused the loop', () => {
    // Demonstrating the defect rather than describing it. If someone restores
    // the old condition, this documents precisely what they are restoring.
    expect(oldGate(INTERRUPTED, 'student', DRAFT)).toBe(false);
    expect(oldGate(INTERRUPTED_NONAME, 'student', DRAFT)).toBe(false);
  });

  it('an interrupted student CAN now have their answers applied on return', () => {
    expect(currentGate(INTERRUPTED, 'student', DRAFT)).toBe(true);
    expect(currentGate(INTERRUPTED_NONAME, 'student', DRAFT)).toBe(true);
  });

  it('still applies for a brand-new student and for the trigger stub', () => {
    // The cases the old gate got right must keep working.
    expect(currentGate(BRAND_NEW, 'student', DRAFT)).toBe(true);
    expect(currentGate(TRIGGER_STUB, 'student', DRAFT)).toBe(true);
  });

  it('NEVER applies to a student who has completed onboarding', () => {
    // The rule the old gate also protected, and the more dangerous direction:
    // replaying a stale funnel answer over months of real progress.
    expect(currentGate(FINISHED, 'student', DRAFT)).toBe(false);
    expect(oldGate(FINISHED, 'student', DRAFT)).toBe(false);
  });

  it('never applies to a buddy or an admin, however incomplete their profile', () => {
    for (const role of ['buddy', 'admin']) {
      expect(currentGate(BRAND_NEW, role, DRAFT)).toBe(false);
      expect(currentGate(INTERRUPTED, role, DRAFT)).toBe(false);
    }
  });

  it('does nothing when the browser carried no answers', () => {
    // A returning student on a different device sends no draft. The gate opens
    // but there is nothing to apply — which is the remaining gap: the OTP door
    // has no server-side draft (only the Google door stashes one), so a
    // cross-device return still cannot be recovered. Pinned so the limit is
    // recorded rather than mistaken for a fix.
    expect(currentGate(INTERRUPTED, 'student', undefined)).toBe(false);
    expect(currentGate(INTERRUPTED, 'student', null)).toBe(false);
  });

  it('treats a null onboarding_completed as not completed', () => {
    // The column is nullable. Null must read as "unfinished", never as done —
    // failing the other way would lock a student out exactly as before.
    expect(currentGate({ full_name: 'A', onboarding_completed: null }, 'student', DRAFT)).toBe(true);
  });
});
