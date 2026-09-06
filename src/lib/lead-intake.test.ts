import { describe, it, expect } from 'vitest';
import { planIntake, seatAllowance, assignmentReason, type IntakeSeat, type IntakeCandidate } from './lead-intake';
import { MAX_PORTFOLIO_PER_SEAT } from './sales-rep-provisioning';

// ── The intake plan is a pure function, and these pin the rule ──────────────
//
// Founder, 2 Sep 2026: new students must enter the counsellors' books daily.
// The 2A architecture (§5) requires the allocation to be deterministic and
// explainable: same inputs ⇒ same output, no randomness, every ceiling named.
// Nothing here touches a database — that is the point.

const NOW = Date.parse('2026-09-02T09:00:00Z');   // 14:30 IST
const HOUR = 3600_000;

const seat = (over: Partial<IntakeSeat> = {}): IntakeSeat => ({
  repId: 'a', name: 'Anshul', active: true, unavailableUntil: null,
  maxNewPerDay: 50, newToday: 0, bookSize: 62, ...over,
});
/** n students, newest first: s0 joined an hour ago, s1 two hours ago, … */
const pool = (n: number, hoursApart = 1): IntakeCandidate[] =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, createdAt: new Date(NOW - (i + 1) * hoursApart * HOUR).toISOString() }));

describe('seatAllowance — how many a seat may take today, and why', () => {
  it('the daily fuse binds: cap minus what already arrived today', () => {
    expect(seatAllowance(seat({ maxNewPerDay: 50, newToday: 45 }), NOW)).toEqual({ allowance: 5, boundBy: 'daily_fuse' });
  });
  it('a spent fuse is zero, never negative', () => {
    expect(seatAllowance(seat({ newToday: 60 }), NOW).allowance).toBe(0);
  });
  it('the portfolio ceiling binds when the book is nearly full', () => {
    expect(seatAllowance(seat({ bookSize: MAX_PORTFOLIO_PER_SEAT - 10 }), NOW)).toEqual({ allowance: 10, boundBy: 'portfolio' });
  });
  it('an inactive or unavailable seat takes nothing, and says which', () => {
    expect(seatAllowance(seat({ active: false }), NOW)).toEqual({ allowance: 0, boundBy: 'inactive' });
    expect(seatAllowance(seat({ unavailableUntil: new Date(NOW + HOUR).toISOString() }), NOW)).toEqual({ allowance: 0, boundBy: 'unavailable' });
    // Leave that ENDED is not leave.
    expect(seatAllowance(seat({ unavailableUntil: new Date(NOW - HOUR).toISOString() }), NOW).allowance).toBe(50);
  });
});

describe('planIntake — deterministic, proportional, newest first', () => {
  const two = [seat(), seat({ repId: 'b', name: 'Neelam' })];

  it('same inputs ⇒ same output, regardless of the order seats and students arrive in', () => {
    const p = pool(21);
    const one = planIntake(two, p, NOW);
    const again = planIntake([...two].reverse(), [...p].reverse(), NOW);
    expect(again).toEqual(one);
  });

  it('two equal seats split a day evenly and ALTERNATE, so neither gets the older half', () => {
    const plan = planIntake(two, pool(21), NOW);
    expect(plan.reason).toBe('ALLOCATED');
    expect(plan.total).toBe(21);
    expect(plan.waiting).toBe(0);
    const [a, b] = plan.seats;
    expect([a.studentIds.length, b.studentIds.length]).toEqual([11, 10]);   // the odd one goes to the lower rep id
    expect(a.studentIds.slice(0, 3)).toEqual(['s0', 's2', 's4']);
    expect(b.studentIds.slice(0, 3)).toEqual(['s1', 's3', 's5']);
  });

  it('is proportional to allowance (largest remainder), not equal by default', () => {
    const seats = [seat({ maxNewPerDay: 30 }), seat({ repId: 'b', name: 'Neelam', maxNewPerDay: 10 })];
    const plan = planIntake(seats, pool(20), NOW);
    expect(plan.seats.map((s) => s.studentIds.length)).toEqual([15, 5]);
  });

  it('never exceeds a seat allowance; the rest WAIT and are counted', () => {
    const seats = [seat({ newToday: 48 }), seat({ repId: 'b', name: 'Neelam', newToday: 47 })];   // 2 + 3 = 5
    const plan = planIntake(seats, pool(40), NOW);
    expect(plan.total).toBe(5);
    expect(plan.waiting).toBe(35);
    expect(plan.seats.map((s) => s.studentIds.length)).toEqual([2, 3]);
  });

  it('the newest students are dealt first — the backlog drains from the most recent backwards', () => {
    const plan = planIntake([seat({ newToday: 47 })], pool(10), NOW);   // allowance 3
    expect(plan.seats[0].studentIds).toEqual(['s0', 's1', 's2']);
  });

  it('an empty pool is POOL_EMPTY with nothing waiting', () => {
    const plan = planIntake(two, [], NOW);
    expect(plan.reason).toBe('POOL_EMPTY');
    expect(plan.total).toBe(0);
    expect(plan.waiting).toBe(0);
  });

  it('no active seat is NO_ELIGIBLE_SEAT — the whole pool waits, nothing is invented', () => {
    const plan = planIntake([seat({ active: false })], pool(7), NOW);
    expect(plan.reason).toBe('NO_ELIGIBLE_SEAT');
    expect(plan.waiting).toBe(7);
  });

  it('every seat fused is ALL_SEATS_FUSED, distinct from having no seats', () => {
    const plan = planIntake([seat({ newToday: 50 }), seat({ repId: 'b', name: 'Neelam', newToday: 50 })], pool(7), NOW);
    expect(plan.reason).toBe('ALL_SEATS_FUSED');
    expect(plan.waiting).toBe(7);
    expect(plan.seats.every((s) => s.boundBy === 'daily_fuse')).toBe(true);
  });

  it('an inactive seat alongside an active one receives nothing', () => {
    const plan = planIntake([seat(), seat({ repId: 'b', name: 'Neelam', active: false })], pool(6), NOW);
    expect(plan.seats.find((s) => s.repId === 'b')!.studentIds).toEqual([]);
    expect(plan.seats.find((s) => s.repId === 'a')!.studentIds.length).toBe(6);
  });
});

describe('assignmentReason — every row explains itself', () => {
  const a = seat({ newToday: 3, bookSize: 62 });
  const plan = { repId: 'a', name: 'Anshul', allowance: 47, boundBy: 'daily_fuse' as const, studentIds: ['x', 'y'] };
  it('names the seat, the fuse arithmetic, the book, and whether the SLA clock started', () => {
    const r = assignmentReason({ seatName: 'Anshul', seat: a, plan, joinedIso: '2026-09-02T05:00:00Z', arrival: true });
    expect(r).toContain('Anshul');
    expect(r).toContain('5 of 50 new-per-day used');
    expect(r).toContain(`book 64 of ${MAX_PORTFOLIO_PER_SEAT}`);
    expect(r).toContain('first-contact SLA started');
  });
  it('a backlog signup says the clock did NOT start', () => {
    const r = assignmentReason({ seatName: 'Anshul', seat: a, plan, joinedIso: '2026-07-10T05:00:00Z', arrival: false });
    expect(r).toContain('backlog signup');
    expect(r).toContain('SLA not started');
  });
});
