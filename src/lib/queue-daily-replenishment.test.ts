import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pinMidShiftClock } from './test-support/mid-shift';

// ── THE QUEUE IS REBUILT, NOT CARRIED FORWARD ──────────────────────────────
//
// Founder, 30 Aug 2026: "If a counsellor has 60 opportunities today and works
// 20, those 20 should not simply disappear permanently... but do NOT implement
// '5 removed → exactly 5 replacements'. Replacement must be signal-driven, not
// quota-driven."
//
// The model these pin:
//
//   FULL OWNED BOOK → eligibility → suppression → signals → priority
//                   → available capacity → today's queue
//
// Nothing about yesterday's list survives into today except the STATE each
// student is in. There is no stored work list, no leftover carry-forward and
// no replacement counter — which is why "5 worked" does not mean "5 added".

const ROSTER: Record<string, unknown>[] = [];
vi.mock('@/lib/momentum', async (orig) => ({
  ...(await orig<typeof import('./momentum')>()),
  getRosterMomentum: vi.fn(async () => ROSTER),
}));

const REP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STAFF = [
  { id: REP, email: null, full_name: 'Anshul', role: 'sales' },
  { id: OTHER, email: null, full_name: 'Neelam', role: 'sales' },
];
const asRep = { id: REP, role: 'sales' as const };

function db(outreach: Record<string, unknown>[] = [], paidIds: string[] = []) {
  const chain = (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    let ids: string[] | null = null;
    let statusFilter: ((s: string) => boolean) | null = null;
    for (const m of ['select', 'gte', 'lt', 'gt', 'not', 'order', 'limit']) c[m] = () => c;
    c.eq = (col: string, v: unknown) => { if (col === 'status') statusFilter = (s) => s === v; return c; };
    c.neq = () => c;
    c.in = (col: string, vals: unknown[]) => {
      if (col === 'student_id' || col === 'id') ids = vals as string[];
      if (col === 'status') statusFilter = (s) => (vals as string[]).includes(s);
      return c;
    };
    c.then = (ok: (r: unknown) => unknown) => {
      const set = new Set(ids ?? []);
      if (table === 'profiles' && ids === null) return Promise.resolve({ data: STAFF, error: null }).then(ok);
      if (table === 'lead_outreach') {
        return Promise.resolve({ data: outreach.filter((o) => set.has(o.student_id as string)), error: null }).then(ok);
      }
      if (table === 'student_payments') {
        const rows = paidIds.filter((i) => set.has(i)).map((student_id) => ({ student_id, status: 'paid', created_at: new Date().toISOString(), plan: 'monthly' }));
        const f = statusFilter as ((s: string) => boolean) | null;
        return Promise.resolve({ data: f ? rows.filter((r) => f(r.status)) : rows, error: null }).then(ok);
      }
      return Promise.resolve({ data: [], error: null }).then(ok);
    };
    return c;
  };
  return { from: (t: string) => chain(t) };
}

const HOUR = 3600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const student = (i: number) => ({
  id: `s${i}`, full_name: `Student ${i}`, phone: `98${String(i).padStart(8, '0')}`,
  score: 50, band: 'at_risk', reachable: true, isPremium: false, hasBuddy: false,
  daysSinceLastLog: 5, buddyCtaClicks: 0,
});
/** Owned by our rep, never contacted — the day-one shape of the whole book. */
const untouched = (i: number) => ({
  student_id: `s${i}`, status: 'not_contacted', next_action_at: null, last_attempt_at: null,
  no_answer_count: 0, callback_at: null, owner: null, owner_id: REP,
});
/** Worked yesterday, follow-up scheduled ahead — on cooldown, not today's work. */
const workedCooldown = (i: number, hoursAhead = 48) => ({
  student_id: `s${i}`, status: 'interested',
  next_action_at: iso(Date.now() + hoursAhead * HOUR),
  last_attempt_at: iso(Date.now() - 24 * HOUR),
  no_answer_count: 0, callback_at: null, owner: null, owner_id: REP,
});
/** Cooldown has expired — due again now. */
const dueAgain = (i: number) => ({
  student_id: `s${i}`, status: 'interested',
  next_action_at: iso(Date.now() - HOUR),
  last_attempt_at: iso(Date.now() - 50 * HOUR),
  no_answer_count: 0, callback_at: null, owner: null, owner_id: REP,
});
const terminal = (i: number, status: string) => ({
  student_id: `s${i}`, status, next_action_at: null,
  last_attempt_at: iso(Date.now() - 30 * HOUR),
  no_answer_count: 0, callback_at: null, owner: null, owner_id: REP,
});

async function build(outreach: Record<string, unknown>[] = [], paid: string[] = []) {
  const { buildCallQueue } = await import('./call-queue');
  return buildCallQueue(db(outreach, paid), asRep);
}
const ids = (q: { studentId: string }[]) => q.map((l) => l.studentId);

beforeEach(() => { vi.clearAllMocks(); ROSTER.length = 0; });
pinMidShiftClock();

describe('worked students leave, unworked students stay', () => {
  it('THE SCENARIO: 60 owned, 20 worked — the other 40 are still there tomorrow', async () => {
    for (let i = 0; i < 60; i++) ROSTER.push(student(i));
    // 20 worked yesterday and now sit on a scheduled follow-up.
    const state = [
      ...Array.from({ length: 20 }, (_, k) => workedCooldown(k)),
      ...Array.from({ length: 40 }, (_, k) => untouched(k + 20)),
    ];
    const { queue } = await build(state);
    const got = ids(queue);
    expect(got, 'the 20 on cooldown must not be re-dealt').not.toContain('s0');
    expect(got).not.toContain('s19');
    expect(got, 'an unworked student is not lost — still owned, still eligible').toContain('s20');
    expect(got).toContain('s59');
    expect(queue.length, 'exactly the 40 that are actually eligible').toBe(40);
  });

  it('an unworked student keeps their owner — nothing is released by not calling them', async () => {
    for (let i = 0; i < 5; i++) ROSTER.push(student(i));
    const state = Array.from({ length: 5 }, (_, k) => untouched(k));
    const { totalOpen } = await build(state);
    expect(totalOpen, 'the whole owned book is still open work').toBe(5);
    // A second rep must still not see them.
    const { buildCallQueue } = await import('./call-queue');
    const otherView = await buildCallQueue(db(state), { id: OTHER, role: 'sales' as const });
    expect(otherView.queue.length, "another rep's book is not visible").toBe(0);
  });
});

describe('replenishment is signal-driven, never quota-driven', () => {
  it('20 worked + 15 genuinely new students → the new ones enter on their own', async () => {
    for (let i = 0; i < 60; i++) ROSTER.push(student(i));
    // Overnight: 15 new signups join the roster and the book.
    for (let i = 100; i < 115; i++) ROSTER.push(student(i));
    const state = [
      ...Array.from({ length: 20 }, (_, k) => workedCooldown(k)),
      ...Array.from({ length: 40 }, (_, k) => untouched(k + 20)),
      ...Array.from({ length: 15 }, (_, k) => untouched(k + 100)),
    ];
    const { queue } = await build(state);
    const got = ids(queue);
    expect(got, 'a new student needs no cron to become eligible').toContain('s100');
    expect(got).toContain('s114');
    // CHANGED 2 Sep 2026 (SALES-OS.md §5, the 50–70 day). 55 never-contacted
    // students are all ROTATION — there is no signal among them — and a day
    // made only of rotation is the floor, fifty. The other five are not lost:
    // still owned, still eligible, dealt tomorrow. Signals earn the room above
    // the floor; rotation is steady.
    expect(queue.length).toBe(50);
    expect(new Set(got).size).toBe(50);
  });

  it('a follow-up coming due re-enters by itself', async () => {
    for (let i = 0; i < 3; i++) ROSTER.push(student(i));
    const notYet = await build([workedCooldown(0), untouched(1), untouched(2)]);
    expect(ids(notYet.queue), 'still on cooldown').not.toContain('s0');

    const nowDue = await build([dueAgain(0), untouched(1), untouched(2)]);
    expect(ids(nowDue.queue), 'the same student returns when the clock says so').toContain('s0');
    expect(nowDue.queue.find((l) => l.studentId === 's0')!.dueReason).toBe('followup');
  });

  // The founder's explicit instruction: NOT "5 removed → 5 added".
  it('working 5 does not summon 5 — only genuine opportunities appear', async () => {
    for (let i = 0; i < 10; i++) ROSTER.push(student(i));
    // 5 worked, and of the remaining 5 only 2 are actually eligible.
    const state = [
      ...Array.from({ length: 5 }, (_, k) => workedCooldown(k)),
      ...Array.from({ length: 3 }, (_, k) => workedCooldown(k + 5, 72)),
      untouched(8), untouched(9),
    ];
    const { queue } = await build(state);
    expect(queue.length, 'two eligible means two cards, not five replacements').toBe(2);
    expect(ids(queue).sort()).toEqual(['s8', 's9']);
  });

  it('a day with nothing eligible is empty, never topped up', async () => {
    for (let i = 0; i < 30; i++) ROSTER.push(student(i));
    const { queue } = await build(Array.from({ length: 30 }, (_, k) => workedCooldown(k)));
    expect(queue.length).toBe(0);
  });
});

describe('terminal states stay out, permanently', () => {
  it.each(['not_interested', 'dnd'])('%s is never re-dealt by a rebuild', async (status) => {
    for (let i = 0; i < 3; i++) ROSTER.push(student(i));
    const { queue } = await build([terminal(0, status), untouched(1), untouched(2)]);
    expect(ids(queue)).not.toContain('s0');
    expect(queue.length).toBe(2);
  });

  it('a paying student is excluded on the ledger, not on a typed status', async () => {
    for (let i = 0; i < 3; i++) ROSTER.push(student(i));
    const { queue } = await build([untouched(0), untouched(1), untouched(2)], ['s0']);
    expect(ids(queue), 'money closes a student, and a rebuild must honour it').not.toContain('s0');
  });

  it('a lead at the contact ceiling stays suppressed across rebuilds', async () => {
    for (let i = 0; i < 3; i++) ROSTER.push(student(i));
    const exhausted = {
      student_id: 's0', status: 'no_answer', next_action_at: null,
      last_attempt_at: iso(Date.now() - 30 * HOUR), no_answer_count: 6,
      callback_at: null, owner: null, owner_id: REP,
    };
    const { queue, totalOpen } = await build([exhausted, untouched(1), untouched(2)]);
    expect(ids(queue)).not.toContain('s0');
    expect(totalOpen, 'suppressed is not deleted — they still have an owner').toBe(3);
  });
});

describe('capacity, not a target', () => {
  it('more eligible than capacity → the highest priority, never all of them', async () => {
    for (let i = 0; i < 200; i++) ROSTER.push(student(i));
    const { queue } = await build(Array.from({ length: 200 }, (_, k) => untouched(k)));
    expect(queue.length).toBeLessThanOrEqual(60);
    expect(queue.length).toBeGreaterThan(0);
  });

  it('a due promise outranks every cold card in the rebuild', async () => {
    for (let i = 0; i < 100; i++) ROSTER.push(student(i));
    const promise = {
      student_id: 's50', status: 'follow_up',
      next_action_at: iso(Date.now() - HOUR), callback_at: iso(Date.now() - HOUR),
      last_attempt_at: iso(Date.now() - 30 * HOUR), no_answer_count: 0, owner: null, owner_id: REP,
    };
    const { queue } = await build([promise, ...Array.from({ length: 99 }, (_, k) => untouched(k < 50 ? k : k + 1))]);
    expect(queue[0].studentId).toBe('s50');
    expect(queue[0].dueReason).toBe('callback');
  });
});
