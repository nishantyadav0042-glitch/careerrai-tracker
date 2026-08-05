import { describe, it, expect } from 'vitest';

// What a mentor sees when the database refuses a booking.
//
// The concurrency guarantee itself belongs to Postgres: on a unique index the
// second writer blocks on the first transaction's outcome and then fails with
// 23505 — that is the documented behaviour, and it is exactly WHY the rule was
// moved out of application code, where a check-then-insert can interleave.
//
// What is ours, and therefore what is tested here, is the translation: every
// path that can lose a race must produce the right status and the right
// sentence. A correct constraint behind a 500 that says "try again" is still a
// mentor sitting there confused.

/** Mirrors the error mapping in schedule-meeting and reschedule-meeting. */
function bookingError(pgCode: string | undefined): { status: number; reason: string; message: string } {
  if (pgCode === '23505') {
    return {
      status: 409, reason: 'session_exists',
      message: 'You already have an active meeting with this student. Cancel or complete it before booking another session.',
    };
  }
  if (pgCode === '23P01') {
    return {
      status: 409, reason: 'buddy_double_booked',
      message: 'Buddy is no longer available for this slot. Every session of yours runs in the same room, so two students can never share a slot — pick a time at least 15 minutes clear of your other calls.',
    };
  }
  return { status: 500, reason: 'unknown', message: "Couldn't save the session — try again." };
}

describe('losing a race produces an answer a mentor can act on', () => {
  it('one_live_session_per_pair (23505) tells them to cancel the existing one', () => {
    const r = bookingError('23505');
    expect(r.status).toBe(409);
    expect(r.reason).toBe('session_exists');
    expect(r.message).toContain('Cancel or complete it');
  });

  it('no_overlapping_buddy_sessions (23P01) says the slot is gone, in the founder\'s words', () => {
    const r = bookingError('23P01');
    expect(r.status).toBe(409);
    expect(r.reason).toBe('buddy_double_booked');
    expect(r.message).toContain('Buddy is no longer available for this slot');
  });

  it('409, never 500 — a lost race is a rule, not a crash', () => {
    // A 500 invites the client to retry, and a retry against a constraint can
    // only fail the same way forever.
    for (const code of ['23505', '23P01']) {
      expect(bookingError(code).status).toBe(409);
    }
  });

  it('an unrelated database error is NOT dressed up as a booking conflict', () => {
    // Reporting a disk error as "you already have a meeting" would send a
    // mentor hunting for a session that does not exist.
    expect(bookingError('53100').status).toBe(500);
    expect(bookingError(undefined).status).toBe(500);
  });

  it('the losing side never learns WHO took the slot', () => {
    // Told the slot is gone, not who has it. Two students of one mentor must
    // not be able to enumerate each other through booking failures. (Speaking
    // of "students" in general is fine — an identifier is not.)
    const r = bookingError('23P01');
    expect(r.message).not.toMatch(/@/);                    // no email
    expect(r.message).not.toMatch(/\b\d{1,2}:\d{2}\b/);    // no other booking's time
    expect(r.message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i); // no uuid
  });
});
