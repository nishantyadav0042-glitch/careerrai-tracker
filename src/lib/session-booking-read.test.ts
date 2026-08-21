import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readMentorRoster, hasOpenSessionCredit, rosterCapacity } from './session-credit';

// ── UNKNOWN can neither deny a session nor sell one (Boundary 2, change 3) ─
//
// /sessions/book held BOTH directions of the disease at once:
//   mentors read fails   → roster []  → "sold out"          (false DENIAL)
//   load read fails      → load empty → every mentor free    (OVERSELL)
//   open-credit fails    → null       → already-booked check
//                                       skipped → SECOND SALE (OVERSELL)
// The oversell direction is the expensive one: an infrastructure blip
// minting permission to consume a scarce human's week, or charging a
// student twice for one entitlement.
//
// The founder's eight cases, driven through the REAL primitives.

const MENTOR = {
  id: 'b1', full_name: 'Shreya M', specialities: ['mock_analysis'],
  strongest_section: 'QA', own_weakest_section: null, attempt_number: 1,
  weekly_session_cap: 3,
};

function rosterClient(answers: {
  mentors: Array<{ data: unknown; error: unknown }>;
  credits: Array<{ data: unknown; error: unknown }>;
}) {
  let mi = 0, ci = 0;
  return { from: (table: string) => {
    const isProfiles = table === 'profiles';
    const chain = {
      select: () => chain, eq: () => chain, not: () => chain, in: () => chain,
      gte: () => chain, limit: () => chain,
      then: (res: (v: { data: unknown; error: unknown }) => void) => {
        const a = isProfiles ? answers.mentors : answers.credits;
        const idx = isProfiles ? Math.min(mi++, a.length - 1) : Math.min(ci++, a.length - 1);
        return Promise.resolve(a[idx]).then(res);
      },
    };
    return chain;
  } };
}
const ok = (rows: unknown[]) => ({ data: rows, error: null });
const fail = { data: null, error: { message: 'connection reset' } };

describe('capacity side — the founder’s cases 5–8', () => {
  it('5: capacity available + successful reads → a real roster with real load', async () => {
    const roster = await readMentorRoster(rosterClient({
      mentors: [ok([MENTOR])], credits: [ok([{ buddy_id: 'b1' }])],
    }));
    expect(roster).toHaveLength(1);
    expect(roster[0].openThisWeek).toBe(1);      // the load actually counted
    expect(rosterCapacity(roster)).toBe(2);      // 3 cap − 1 open
  });

  it('6: genuinely full mentors stay full — legitimate unavailable survives', async () => {
    const roster = await readMentorRoster(rosterClient({
      mentors: [ok([MENTOR])],
      credits: [ok([{ buddy_id: 'b1' }, { buddy_id: 'b1' }, { buddy_id: 'b1' }])],
    }));
    expect(rosterCapacity(roster)).toBe(0);
  });

  it('7: capacity read fails twice → THROW — never an all-free roster (OVERSELL proof)', async () => {
    // The load read failing is the oversell direction: mentors arrive fine,
    // the load map would silently be empty, and every mentor looks free.
    await expect(readMentorRoster(rosterClient({
      mentors: [ok([MENTOR]), ok([MENTOR])], credits: [fail, fail],
    }))).rejects.toThrow(/availability/i);
  });

  it('7b: mentors read fails twice → THROW — never "sold out" (FALSE-DENIAL proof)', async () => {
    await expect(readMentorRoster(rosterClient({
      mentors: [fail, fail], credits: [ok([]), ok([])],
    }))).rejects.toThrow(/availability/i);
  });

  it('8: first pair fails, second succeeds → correct roster, exactly two rounds', async () => {
    const roster = await readMentorRoster(rosterClient({
      mentors: [fail, ok([MENTOR])], credits: [ok([]), ok([])],
    }));
    expect(rosterCapacity(roster)).toBe(3);
  });
});

describe('credit side — the founder’s cases 1–4', () => {
  function creditClient(answers: Array<{ data: unknown; error: unknown }>) {
    let i = 0;
    const chain = {
      select: () => chain, eq: () => chain, in: () => chain, limit: () => chain,
      then: (res: (v: { data: unknown; error: unknown }) => void) =>
        Promise.resolve(answers[Math.min(i++, answers.length - 1)]).then(res),
    };
    return { from: () => chain };
  }

  it('1: an open session + successful read → TRUE, the second sale is blocked', async () => {
    await expect(hasOpenSessionCredit(creditClient([ok([{ id: 'c1' }])]), 's1')).resolves.toBe(true);
  });

  it('2: no open session + successful read → FALSE, booking proceeds by the normal rules', async () => {
    await expect(hasOpenSessionCredit(creditClient([ok([])]), 's1')).resolves.toBe(false);
  });

  it('3: read fails twice → THROW — never "no open session" (DOUBLE-SALE proof)', async () => {
    await expect(hasOpenSessionCredit(creditClient([fail, fail]), 's1')).rejects.toThrow(/existing session/i);
  });

  it('4: first read fails, second succeeds → the real answer arrives', async () => {
    await expect(hasOpenSessionCredit(creditClient([fail, ok([{ id: 'c1' }])]), 's1')).resolves.toBe(true);
  });

  it('a student with TWO open credits is still TRUE — the maybeSingle landmine is gone', async () => {
    // maybeSingle ERRORED on two rows, and the ignored error waved exactly
    // that student through. limit(1) + length answers the actual question.
    await expect(hasOpenSessionCredit(creditClient([ok([{ id: 'c1' }])]), 's1')).resolves.toBe(true);
  });
});

describe('the route enforces the boundary (semantic guard)', () => {
  const raw = readFileSync('src/app/api/sessions/book/route.ts', 'utf8');
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('every availability/credit decision flows through the throwing primitives', () => {
    expect(code).toContain('readMentorRoster(admin)');
    expect(code).toContain('hasOpenSessionCredit(admin, user.id)');
    // No unchecked read may feed these decisions, whatever the variable name:
    expect(code, 'an unchecked session_credits read must not return')
      .not.toMatch(/\{ data[^}]*\} = await admin[\s\S]{0,120}from\('session_credits'\)/);
  });

  it('UNKNOWN answers 503 with a machine code, before any money', () => {
    expect(code).toContain("code: 'AVAILABILITY_READ_FAILED'");
    const stop = code.indexOf('AVAILABILITY_READ_FAILED');
    const order = code.indexOf('createRazorpayOrder(');
    expect(stop, 'the stop must sit before Razorpay order creation').toBeLessThan(order);
  });

  it('the GET gate refuses the same conversion — no available:false from a failed read', () => {
    const get = code.slice(code.indexOf('export async function GET'));
    expect(get).toContain('AVAILABILITY_READ_FAILED');
    expect(get).toContain('readMentorRoster');
  });

  it('legitimate refusals still exist — the fix did not delete the business rules', () => {
    expect(code).toContain('soldOut: true');
    expect(code).toContain('alreadyBooked: true');
  });
});
