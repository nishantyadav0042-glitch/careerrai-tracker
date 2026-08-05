import { describe, it, expect } from 'vitest';
import { constraintFailure } from './booking-constraints';

// What someone sees when the database refuses a booking.
//
// The concurrency guarantee belongs to Postgres: on a unique index the second
// writer blocks on the first transaction's outcome and then fails with 23505.
// That is exactly WHY the rule was moved out of application code, where a
// check-then-insert can interleave.
//
// What is ours — and so what is tested here — is the translation. A correct
// constraint behind a 500 that says "try again" is still a mentor sitting there
// confused, retrying something that can only fail the same way forever.

describe('a business rule is a 409, never a 500', () => {
  it('one_live_session_per_pair (23505) tells them to clear the existing one', () => {
    const r = constraintFailure({ code: '23505' }, 'buddy')!;
    expect(r.status).toBe(409);
    expect(r.reason).toBe('session_exists');
    expect(r.message).toContain('Cancel or complete it');
  });

  it('no_overlapping_buddy_sessions (23P01) says the slot is gone', () => {
    const r = constraintFailure({ code: '23P01' }, 'student')!;
    expect(r.status).toBe(409);
    expect(r.reason).toBe('buddy_double_booked');
    expect(r.message).toContain('no longer available for the selected time');
  });

  it('every rule violation is 409', () => {
    for (const code of ['23505', '23P01']) {
      for (const audience of ['buddy', 'student'] as const) {
        expect(constraintFailure({ code }, audience)!.status).toBe(409);
      }
    }
  });
});

describe('an unrelated failure is not dressed up as a booking conflict', () => {
  it('returns null for anything that is not one of the two rules', () => {
    // Reporting a disk-full error as "you already have a meeting" sends someone
    // hunting for a session that does not exist.
    for (const code of ['53100', '08006', '42P01', '', undefined]) {
      expect(constraintFailure({ code })).toBeNull();
    }
    expect(constraintFailure(null)).toBeNull();
    expect(constraintFailure(undefined)).toBeNull();
  });
});

describe('the same rule reads correctly from each side', () => {
  it('a buddy is told about their student, a student about their mentor', () => {
    expect(constraintFailure({ code: '23505' }, 'buddy')!.message).toContain('this student');
    expect(constraintFailure({ code: '23505' }, 'student')!.message).toContain('this mentor');
  });

  it('never tells a student about the mentor\'s other students', () => {
    // Two students of one mentor must not be able to enumerate each other
    // through booking failures.
    const m = constraintFailure({ code: '23P01' }, 'student')!.message;
    expect(m).not.toMatch(/@/);                       // no email
    expect(m).not.toMatch(/\b\d{1,2}:\d{2}\b/);       // no other booking's time
    expect(m).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i); // no uuid
    expect(m).not.toMatch(/student/i);                 // not even in the abstract
  });

  it('defaults to the buddy voice, since only buddies book today', () => {
    expect(constraintFailure({ code: '23505' })!.message)
      .toBe(constraintFailure({ code: '23505' }, 'buddy')!.message);
  });
});
