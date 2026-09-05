import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pinMidShiftClock } from './test-support/mid-shift';

// ── THE QUEUE IS AN OPPORTUNITY LIST, NOT A QUOTA ───────────────────────────
//
// Founder, 30 Aug 2026: "Counsellor ko 60 students dena hamara lakshya nahi
// hai. Agar aaj 23 genuinely important opportunities hain, to use 23 milni
// chahiye. Aur agar koi student aaj phir se call karne layak nahi hai, to sirf
// quota poora karne ke liye use queue mein daalna system failure hai."
//
// call-queue.ts says the same thing in a comment and nothing proved it. A
// property that is only asserted in prose is one refactor away from being
// false, and the failure would be invisible: a counsellor handed 60 cards has
// no way to know that 37 of them were padding, and the coverage number would
// look WORSE for working the real ones. CAP is a ceiling, never a target.

const ROSTER: Record<string, unknown>[] = [];
vi.mock('@/lib/momentum', async (orig) => ({
  ...(await orig<typeof import('./momentum')>()),
  getRosterMomentum: vi.fn(async () => ROSTER),
}));

const BOSS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const asAdmin = { id: BOSS, role: 'admin' as const };
const STAFF = [{ id: BOSS, email: null, full_name: 'Founder', role: 'admin' }];

function db(outreach: Record<string, unknown>[]) {
  const chain = (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const m of ['select', 'gte', 'lt', 'gt', 'not', 'order', 'limit', 'eq', 'neq', 'in']) c[m] = () => c;
    c.then = (ok: (r: unknown) => unknown) => {
      if (table === 'profiles') return Promise.resolve({ data: STAFF, error: null }).then(ok);
      if (table === 'lead_outreach') return Promise.resolve({ data: outreach, error: null }).then(ok);
      return Promise.resolve({ data: [], error: null }).then(ok);
    };
    return c;
  };
  return { from: (t: string) => chain(t) };
}

const HOUR = 3600_000;
/** A student the roster knows about. Never contacted unless given a row below. */
const student = (i: number) => ({
  id: `s${i}`, full_name: `Student ${i}`, phone: `98000${String(i).padStart(5, '0')}`,
  score: 50, band: 'at_risk', reachable: true, isPremium: false, hasBuddy: false,
  daysSinceLastLog: 5, buddyCtaClicks: 0,
});
/** Contacted, with a follow-up scheduled in the future — NOT today's work. */
const scheduledLater = (i: number) => ({
  student_id: `s${i}`, status: 'interested',
  next_action_at: new Date(Date.now() + 48 * HOUR).toISOString(),
  last_attempt_at: new Date(Date.now() - 24 * HOUR).toISOString(),
  no_answer_count: 0, callback_at: null, owner: null,
});

async function queueSize(outreach: Record<string, unknown>[]) {
  const { buildCallQueue } = await import('./call-queue');
  return (await buildCallQueue(db(outreach), asAdmin)).queue.length;
}

beforeEach(() => { vi.clearAllMocks(); ROSTER.length = 0; });
pinMidShiftClock();

describe('the queue returns the work that exists, not a quota', () => {
  it('23 genuine opportunities produce a queue of 23, not 60', async () => {
    for (let i = 0; i < 23; i++) ROSTER.push(student(i));
    expect(await queueSize([]), 'the counsellor gets the real number').toBe(23);
  });

  it('a smaller day is smaller, not topped up', async () => {
    for (let i = 0; i < 7; i++) ROSTER.push(student(i));
    expect(await queueSize([])).toBe(7);
  });

  // The failure the founder named: students who are not worth calling today
  // being added because there is room left in the deck.
  it('students already scheduled for later are NEVER used as filler', async () => {
    for (let i = 0; i < 40; i++) ROSTER.push(student(i));
    // Only 5 are genuinely available; the other 35 have a future follow-up.
    const scheduled = Array.from({ length: 35 }, (_, k) => scheduledLater(k + 5));
    expect(
      await queueSize(scheduled),
      'a deck with room left must stay short rather than resurface scheduled students',
    ).toBe(5);
  });

  it('a day with nothing due is empty, not padded', async () => {
    for (let i = 0; i < 30; i++) ROSTER.push(student(i));
    const allScheduled = Array.from({ length: 30 }, (_, k) => scheduledLater(k));
    expect(await queueSize(allScheduled), 'an empty day is information, not a bug to hide').toBe(0);
  });
});

describe('the cap is a ceiling, not a target', () => {
  it('more opportunities than the cap are prioritised, never all shown', async () => {
    for (let i = 0; i < 200; i++) ROSTER.push(student(i));
    const n = await queueSize([]);
    expect(n, 'a 200-card deck is not a working day').toBeLessThanOrEqual(60);
    expect(n, 'but it must still be a full day of real work').toBeGreaterThan(0);
  });

  // Non-vacuity for the tests above: the roster CAN produce more than 23, so
  // "23 in, 23 out" is the queue respecting reality rather than a coincidence
  // of the fixture being small.
  it('the same fixture yields more when there is more to do', async () => {
    for (let i = 0; i < 23; i++) ROSTER.push(student(i));
    const small = await queueSize([]);
    for (let i = 23; i < 45; i++) ROSTER.push(student(i));
    const larger = await queueSize([]);
    expect(larger).toBeGreaterThan(small);
  });
});

// ── The ceiling must still do its actual job ───────────────────────────────
//
// Backfilling held-back candidates would be a bad trade if it let one lane
// drown the others — that is the exact reason LANE_CAPS exists. Protected
// lanes are filled FIRST and the backfill only ever uses room nobody claimed,
// so a promise made to a student still outranks 200 introduction calls.

const dueCallback = (i: number) => ({
  student_id: `s${i}`, status: 'follow_up',
  next_action_at: new Date(Date.now() - HOUR).toISOString(),
  callback_at: new Date(Date.now() - HOUR).toISOString(),
  last_attempt_at: new Date(Date.now() - 30 * HOUR).toISOString(),
  no_answer_count: 0, owner: null,
});

describe('backfilling never starves a protected lane', () => {
  it('a promised callback still leads a deck of 200 fresh students', async () => {
    for (let i = 0; i < 200; i++) ROSTER.push(student(i));
    const { buildCallQueue } = await import('./call-queue');
    const { queue } = await buildCallQueue(db([dueCallback(150)]), asAdmin);
    expect(queue[0].studentId, 'a promise to a student outranks every cold card').toBe('s150');
    expect(queue[0].dueReason).toBe('callback');
  });

  it('the deck still respects the overall ceiling after backfill', async () => {
    for (let i = 0; i < 300; i++) ROSTER.push(student(i));
    expect(await queueSize([]), 'backfill fills the day, it does not remove the limit')
      .toBeLessThanOrEqual(60);
  });

  it('backfill only ever adds students who passed every filter', async () => {
    // A student with no phone can never be dealt, backfill or not.
    for (let i = 0; i < 30; i++) ROSTER.push(student(i));
    (ROSTER[0] as { phone: string | null }).phone = null;
    const { buildCallQueue } = await import('./call-queue');
    const { queue } = await buildCallQueue(db([]), asAdmin);
    expect(queue.find((l) => l.studentId === 's0'), 'an uncallable student is not filler')
      .toBeFalsy();
  });
});
