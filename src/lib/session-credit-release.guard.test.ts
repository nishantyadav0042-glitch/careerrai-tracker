import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ── The ONE permitted release, and nothing wider ───────────────────────────
//
// session_credit_coherent() rule (5) forbids a credit from ever changing the
// session it is linked to. That was right, and it stranded money: when a
// mentor cancelled, the ₹299 stayed welded to a session that would never
// happen — rule (5) blocked the relink, rules (5)+(8) blocked the fallback to
// booking_blocked, sessions/schedule read the stale link and answered "already
// booked", and hasOpenSessionCredit() counted it as open so the student could
// not even buy another. A silent refund they had to notice and ask for.
//
// 20260827a opens exactly one door: a credit whose linked session actually
// FAILED to deliver may drop the link, and only while landing in
// booking_blocked, which rule (6) then forces to carry an owner, a next_action
// and a failure reason. The danger is that this door gets widened later by
// someone deleting one of its three preconditions. This guard is the door
// frame.
//
// PROVEN ON careerrai-test, 27 Aug 2026, against the migration applied there,
// with fixtures created and rolled back in the same transaction (both tables
// verified back to 0 rows afterwards):
//
//   A  release after CANCELLED session ........ ALLOWED -> booking_blocked, link NULL, owner ops
//   B  release after EXPIRED session .......... ALLOWED -> booking_blocked, link NULL, owner ops
//   A2 rebook the released credit ............. ALLOWED -> scheduled, linked to the NEW session
//   C  relink to another session .............. REFUSED  already linked to a session
//   D  release while session still SCHEDULED .. REFUSED  already linked to a session
//   E  release after session COMPLETED ........ REFUSED  already linked to a session
//   F  unlink into 'paid' not booking_blocked . REFUSED  already linked to a session
//   G  release without an owner (rule 6) ...... REFUSED  requires an owner and a next_action
//   H  booking_blocked still holding the link .. REFUSED  cannot hold a linked session
//   I  relink live -> live (the original point) REFUSED  already linked to a session
//
// NON-VACUITY: the same case A, run against production's current rule 5
// restored into the test DB, was REFUSED ("already linked to a session").
// The migration is what unlocks it, not the harness.
//
// SCHEMA PARITY: comment-stripped, whitespace-normalised pg_get_functiondef()
// of session_credit_coherent() with the rule-5 block excised hashes to
// 69c4e5877914907e1a4f4499c17ad5f9 on BOTH careerrai (production) and
// careerrai-test after the migration. Rule 5 is the only thing that changed.

const MIGRATIONS = 'supabase/migrations';

/** The newest migration that (re)defines the coherence trigger IS the authority. */
function currentDefinition(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort().reverse();
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (/create or replace function public\.session_credit_coherent/.test(sql)) return { file: f, sql };
  }
  throw new Error('No migration defines session_credit_coherent()');
}

const { file, sql } = currentDefinition();
/** Comments cannot be allowed to satisfy any assertion below (five prior recurrences). */
const code = sql.replace(/--[^\n]*/g, '');

/** Rule (5): from the tg_op test up to where rule (6) begins. */
function ruleFive(): string {
  const start = code.indexOf("if tg_op = 'UPDATE'");
  const end = code.indexOf("if new.status in ('assignment_failed'");
  expect(start, `Rule 5 not found in ${file}`).toBeGreaterThan(-1);
  expect(end, `Rule 6 not found in ${file} — cannot bound rule 5`).toBeGreaterThan(start);
  return code.slice(start, end);
}

describe(`the credit-release door frame (${file})`, () => {
  it('rule 5 still refuses relinking — the default is REFUSE', () => {
    expect(ruleFive()).toMatch(/raise exception 'session_credits: this credit is already linked to a session'/);
  });

  it('the exception is a NOT of a conjunction — refuse unless all three hold', () => {
    // `if not ( ... ) then raise` fails closed: adding a state nobody thought
    // about lands in the raise, not in the door.
    expect(
      ruleFive(),
      'Rule 5 must stay written as "refuse unless every precondition holds". An "if <allowed> then skip" shape fails OPEN for any case not enumerated.',
    ).toMatch(/if not \(/);
  });

  it.each([
    ['releasing, never relinking', /new\.video_session_id is null/],
    ['only into the owned recovery state', /new\.status = 'booking_blocked'/],
    ['only when the session really failed', /linked_status in \('cancelled', 'expired'\)/],
  ])('the door requires: %s', (_label, pattern) => {
    expect(
      ruleFive(),
      'One of the three preconditions on the credit-release exception is gone. Each removal opens a different hole: dropping the null check permits arbitrary relinking; dropping booking_blocked lets a credit slip out unowned; dropping the session-status check lets a LIVE or COMPLETED booking be silently unlinked.',
    ).toMatch(pattern);
  });

  it('the linked session status is read from video_sessions, not from the credit', () => {
    // video_sessions is the delivery authority. Trusting a column on the
    // credit would let the writer assert its own permission.
    expect(ruleFive()).toMatch(/select session_status into linked_status[\s\S]{0,120}from public\.video_sessions[\s\S]{0,80}old\.video_session_id/);
  });

  it('rule 8 is untouched: booking_blocked may never hold a session', () => {
    expect(code).toMatch(/raise exception 'session_credits: booking_blocked cannot hold a linked session'/);
  });

  it('rule 6 is untouched: the released credit lands OWNED', () => {
    expect(code).toMatch(/requires an owner and a next_action/);
    expect(code).toMatch(/requires failure_reason and failure_at/);
  });

  it('the writer asks for exactly the shape the database permits', () => {
    const writer = readFileSync('src/lib/session-credit.ts', 'utf8').replace(/\/\/[^\n]*/g, '');
    const release = writer.slice(writer.indexOf('// Cancelled or expired') >= 0 ? 0 : 0);
    expect(release).toMatch(/status: 'booking_blocked'/);
    expect(release).toMatch(/video_session_id: null/);
    expect(release).toMatch(/owner: 'ops'/);
    expect(release).toMatch(/failure_reason: `session_\$\{outcome\}`/);
    // The DB reads video_sessions for the CURRENT status, so the session must
    // already be cancelled/expired when this runs. Guarding on the credit's
    // own prior status is what keeps a double-settle from firing twice.
    expect(release).toMatch(/\.in\('status', \['scheduled', 'assigned'\]\)/);
  });
});

// ── A released credit must have a way BACK IN ──────────────────────────────
//
// The migration opens the door out of a dead session. This is the door back.
// They are worth guarding together, because closing one without the other is
// worse than neither: the release fires, cancel-meeting/session_expired tells
// the student "your booking is back — pick a new time", and then the booking
// route cannot see the credit. We would be making a promise the product
// cannot keep, to the exact student who has already been let down once.
//
// Found by the final gate on 27 Aug: sessions/schedule filtered credits to
// ('paid','assigned','scheduled'), and no admin surface reads session_credits
// at all — so ops could not see the recovery queue either. The ₹299 was still
// stranded, just in a newer state.

describe('the door back in', () => {
  const SCHEDULE = readFileSync('src/app/api/sessions/schedule/route.ts', 'utf8');
  const bookingRpc = (() => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort().reverse();
    for (const f of files) {
      const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
      if (/create or replace function public\.book_session_credit/.test(sql)) return sql;
    }
    throw new Error('book_session_credit() not found in any migration');
  })();

  it('the booking route can SEE a released credit', () => {
    expect(
      SCHEDULE.replace(/\/\/[^\n]*/g, ''),
      'sessions/schedule filters out booking_blocked, so a student whose mentor cancelled is told their booking is back and then told there is nothing to schedule.',
    ).toMatch(/\.in\('status', \['paid', 'assigned', 'scheduled', 'booking_blocked'\]\)/);
  });

  it('it does NOT try to book a credit that has no mentor', () => {
    // Rule 7: assignment_failed carries no mentor. Rule 1: scheduled requires
    // one. Including it here would just move the failure later.
    expect(SCHEDULE.replace(/\/\/[^\n]*/g, '')).not.toMatch(/'assignment_failed'/);
  });

  it('booking a released credit clears what ops was holding', () => {
    // Otherwise booking_blocked -> scheduled leaves owner/next_action behind
    // and the recovery queue keeps an entry for work that is already done.
    const upd = bookingRpc.slice(bookingRpc.indexOf('update public.session_credits'));
    expect(upd).toMatch(/status\s*=\s*'scheduled'/);
    expect(upd).toMatch(/owner\s*=\s*null/);
    expect(upd).toMatch(/next_action\s*=\s*null/);
  });

  it('the RPC does not re-filter on status — the route already decided', () => {
    // Two status filters would be two authorities on "which credit is
    // bookable", and the DB one would win silently.
    const lookup = bookingRpc.slice(
      bookingRpc.indexOf('select * into c'),
      bookingRpc.indexOf('if not found'),
    );
    expect(lookup).toMatch(/where id = p_credit_id and student_id = p_student_id/);
    expect(lookup).not.toMatch(/status\s*(=|in)/);
  });

  it('and the sale is still refused while that credit is open', () => {
    // The other half: a released credit must read as OPEN to hasOpenSessionCredit,
    // or we take a second ₹299 for a session we already owe.
    const credit = readFileSync('src/lib/session-credit.ts', 'utf8');
    expect(credit).toContain(`not('status', 'in', '("completed","refunded")')`);
  });
});
