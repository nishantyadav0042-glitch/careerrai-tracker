import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { assignBuddyToCredit, mentorBookability, UNBOOKABLE_COPY } from './session-assignment';
import { FINDING_TO_SPECIALITY } from './session-credit';
import { SESSION_INTENTS } from './session-intent';

const MIGRATION = readFileSync('supabase/migrations/20260824l_session_assignment.sql', 'utf8');
const ROUTE = readFileSync('src/app/api/sessions/schedule/route.ts', 'utf8');
const ACTIVATE = readFileSync('src/lib/activate-payment.ts', 'utf8');

// A faithful fake. readMentorRoster awaits TWO thenable query chains in a
// Promise.all, so a fake whose chain is not thenable does not exercise the
// real code path at all — it just throws somewhere else and the test passes
// for the wrong reason.
function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'not', 'in', 'gte', 'order', 'limit', 'is', 'update']) {
    c[m] = () => c;
  }
  c.maybeSingle = async () => result;
  c.single = async () => result;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (c as any).then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
}

const admin = (opts: {
  roster?: unknown[]; rosterFails?: boolean; rpc?: unknown;
  avail?: unknown; profile?: unknown;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}): any => ({
  from(table: string) {
    if (table === 'profiles') {
      // readMentorRoster and mentorBookability both read profiles; the roster
      // read is the one that ends in .not(), the other in .maybeSingle().
      if (opts.rosterFails) return chain({ data: null, error: { message: 'down' } });
      const rosterResult = { data: opts.roster ?? [], error: null };
      const c = chain(rosterResult) as Record<string, unknown>;
      c.maybeSingle = async () => ({ data: opts.profile ?? null, error: null });
      return c;
    }
    if (table === 'buddy_availability') return chain({ data: opts.avail ?? null, error: null });
    if (table === 'session_credits') return chain({ data: [], error: null });
    if (table === 'mentor_grants') return chain({ data: null, error: null });
    return chain({ data: null, error: null });
  },
  rpc: async () => ({ data: opts.rpc ?? [{ assigned: true, buddy_id: 'b1', already: false }], error: null }),
});

describe('the matcher was REUSED, not replaced', () => {
  it('every student intent resolves through the ONE speciality map', () => {
    // matchMentor reads FINDING_TO_SPECIALITY. If an intent were missing, that
    // student would silently lose the heaviest matching signal.
    for (const k of SESSION_INTENTS) {
      expect(FINDING_TO_SPECIALITY[k], `${k} has no speciality — matchMentor cannot use it`).toBeTruthy();
    }
  });

  it('there is no second matcher', () => {
    const lib = readFileSync('src/lib/session-assignment.ts', 'utf8');
    expect(lib).toMatch(/import \{ readMentorRoster, matchMentor \}/);
    // No local scoring: a rival ranker would drift from the one the booking
    // card already explains to the student.
    expect(lib).not.toMatch(/score \+=/);
    expect(lib).not.toMatch(/function match[A-Z]/);
  });

  it('the student’s stated intent outranks the product diagnosis', () => {
    const lib = readFileSync('src/lib/session-assignment.ts', 'utf8');
    expect(lib).toMatch(/input\.sessionIntent \?\? input\.findingKind/);
  });
});

describe('a failed read is never "sold out"', () => {
  it('a failing roster read reports read_failed, not no_mentor_available', async () => {
    // The distinction that matters: refusing a paying student because of a
    // database blip, versus because nobody genuinely has capacity.
    const r = await assignBuddyToCredit(admin({ rosterFails: true }), { creditId: 'c1', studentId: 's1' });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.failure).toBe('read_failed');
  });

  it('an empty roster is no_mentor_available and the credit is untouched', async () => {
    const r = await assignBuddyToCredit(admin({ roster: [] }), { creditId: 'c1', studentId: 's1' });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.failure).toBe('no_mentor_available');
  });

  it('the assignment never voids or consumes the credit', () => {
    const lib = readFileSync('src/lib/session-assignment.ts', 'utf8');
    for (const banned of [/\.delete\(/, /status: 'refunded'/, /status: 'void/]) {
      expect(lib, `assignment can destroy an entitlement: ${banned}`).not.toMatch(banned);
    }
  });
});

describe('assignment is atomic and never silently reassigns', () => {
  it('it is ONE guarded UPDATE', () => {
    expect(MIGRATION).toMatch(/update public\.session_credits c[\s\S]*?where[\s\S]*?c\.buddy_id is null[\s\S]*?c\.status = 'paid'/);
  });

  it('a different mentor is refused rather than swapped in', async () => {
    const r = await assignBuddyToCredit(
      admin({ roster: [{ id: 'b1', full_name: 'B', weekly_session_cap: 5, specialities: [] }],
        rpc: [{ assigned: false, buddy_id: 'someone_else', already: true }] }),
      { creditId: 'c1', studentId: 's1' });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.failure).toBe('already_assigned');
  });
});

describe('the ₹299 relationship never becomes the premium one', () => {
  it('assignment writes session_credits.buddy_id, never profiles.buddy_id', () => {
    const lib = readFileSync('src/lib/session-assignment.ts', 'utf8');
    expect(lib).not.toMatch(/from\(['"]profiles['"]\)[\s\S]{0,120}update/);
    expect(MIGRATION).not.toMatch(/update public\.profiles/);
  });

  it('activation still grants no premium', () => {
    const fn = ACTIVATE.slice(ACTIVATE.indexOf('async function activateSessionCredit'),
      ACTIVATE.indexOf('export async function activatePaidOrder'));
    expect(fn).not.toMatch(/is_premium/);
    expect(fn).not.toMatch(/grantPremiumAndQueueBuddy/);
  });

  it('the three messages become spendable only once a mentor exists', () => {
    // The grant is minted with no buddy and an un-buddied grant is unspendable,
    // so chat cannot open before there is somebody to chat with.
    expect(ACTIVATE).toMatch(/from\('mentor_grants'\)[\s\S]{0,200}buddy_id: assigned\.buddyId/);
    expect(ACTIVATE).toMatch(/\.is\('buddy_id', null\)/);
  });
});

describe('a student is never offered a slot nobody can hold', () => {
  it('bookability requires availability AND a meeting room', async () => {
    const noAvail = await mentorBookability(admin({ avail: null, profile: { buddy_meet_url: 'x' } }), 'b1');
    expect(noAvail.bookable).toBe(false);

    const noRoom = await mentorBookability(
      admin({ avail: { active: true, timezone: 'Asia/Kolkata' },
        profile: { buddy_meet_url: null, google_calendar_connected: false } }), 'b1');
    expect(noRoom.bookable).toBe(false);
    expect(noRoom.bookable === false && noRoom.reason).toBe('no_meeting_room');

    const ok = await mentorBookability(
      admin({ avail: { active: true, timezone: 'Asia/Kolkata' },
        profile: { buddy_meet_url: 'https://meet.google.com/x' } }), 'b1');
    expect(ok.bookable).toBe(true);
  });

  it('a switched-off calendar is not bookable', async () => {
    const r = await mentorBookability(
      admin({ avail: { active: false, timezone: 'Asia/Kolkata' }, profile: { buddy_meet_url: 'x' } }), 'b1');
    expect(r.bookable === false && r.reason).toBe('not_taking_bookings');
  });

  it('every unbookable reason has copy that blames nobody and promises no date', () => {
    for (const [reason, copy] of Object.entries(UNBOOKABLE_COPY)) {
      expect(copy, `${reason} has no copy`).toBeTruthy();
      expect(copy).not.toMatch(/\byou (did|failed|forgot)/i);
      expect(copy, 'never invent an SLA').not.toMatch(/\b\d+\s*(hours?|days?|minutes?)\b/i);
    }
  });

  it('the route gates the picker on bookability BEFORE computing slots', () => {
    const gateAt = ROUTE.indexOf('mentorBookability');
    const slotsAt = ROUTE.indexOf('generateSlots(');
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(slotsAt);
  });

  it('the room is secured BEFORE the session row exists', () => {
    // A session with no link is the failure this product already lived through.
    const roomAt = ROUTE.indexOf('ensureBuddyRoom(');
    const insertAt = ROUTE.indexOf(".from('video_sessions')\n    .insert(");
    expect(roomAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(-1);
    expect(roomAt).toBeLessThan(insertAt);
  });
});

describe('booking is idempotent and loses races cleanly', () => {
  it('a credit already linked returns its session, not a second one', () => {
    expect(ROUTE).toMatch(/if \(credit\.video_session_id\)[\s\S]{0,200}already: true/);
  });

  it('the credit link is conditional on still being unlinked', () => {
    expect(ROUTE).toMatch(/\.is\('video_session_id', null\)/);
  });

  it('a taken slot is a clean 409, and the credit survives', () => {
    expect(ROUTE).toMatch(/That time was just taken/);
    const block = ROUTE.slice(ROUTE.indexOf('That time was just taken') - 400, ROUTE.indexOf('That time was just taken') + 200);
    expect(block).not.toMatch(/session_credits/);
  });

  it('an orphaned session is cancelled rather than left unpaid-for', () => {
    expect(ROUTE).toMatch(/session_status: 'cancelled'/);
  });

  it('the DATABASE validates the slot — the client list is never trusted', () => {
    // generateSlots only OFFERS. The availability trigger and the exclusion
    // constraint decide.
    expect(ROUTE).toMatch(/constraintFailure\(/);
  });
});

describe('cross-state invariants keep money and delivery honest', () => {
  it.each([
    ['assigned/scheduled/completed need a buddy', /status % requires an assigned buddy/],
    ['scheduled/completed need a session', /status % requires a linked session/],
    ['a credit cannot complete before its session does', /cannot complete while the session is/],
    ['the link is permanent', /already linked to a session/],
    ['participants must match', /different mentor|different student/],
  ])('%s', (_label, pattern) => {
    expect(MIGRATION).toMatch(pattern);
  });

  it('one session can back only one credit', () => {
    expect(MIGRATION).toMatch(/create unique index if not exists session_credits_one_session/);
  });

  it('the two state machines are NOT merged', () => {
    // Different questions: "what did they buy" and "did it happen".
    expect(MIGRATION).not.toMatch(/alter table public\.video_sessions[\s\S]{0,80}status/);
  });
});
