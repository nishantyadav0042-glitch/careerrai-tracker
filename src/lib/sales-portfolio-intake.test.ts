import { describe, it, expect } from 'vitest';
import {
  portfolioIntakeLimit,
  repAllocationLimit,
  MAX_PORTFOLIO_PER_SEAT,
  MAX_INTAKE_PER_CALL,
} from './sales-rep-provisioning';
import type { RepCapacity, RepConfig } from './sales-capacity';

// ── The conflation this file exists to keep fixed ───────────────────────────
//
// Before 29 Aug 2026 there was one gate for two different questions, and the
// consequence was invisible: a rep could never be given more than ~200 students
// because 'never_contacted' consumes a capacity unit and max_capacity_units is
// CHECKed at 200 — while the founder's operating model is ~1,000 per seat.
//
// These tests pin the two questions apart. If someone later routes portfolio
// enrolment back through repAllocationLimit, the last test here fails.

const cfg = (over: Partial<RepConfig> = {}): RepConfig => ({
  repId: 'r1',
  active: true,
  employmentType: 'part_time',
  workDays: [1, 2, 3, 4, 5, 6],
  workStartIst: '15:00',
  workEndIst: '21:00',
  maxCapacityUnits: 150,
  maxNewPerDay: 50,
  firstContactSlaMinutes: 120,
  unavailableUntil: null,
  capacityOverride: null,
  overrideUntil: null,
  ...over,
} as RepConfig);

describe('portfolioIntakeLimit', () => {
  it('lets a seat take a full 1,000-student book, which capacity units never could', () => {
    // 150 capacity units, and yet the book may grow far past it: owning is not
    // working. This is the founder's "the system manages the 1,000-student
    // portfolio, the salesman manages today's opportunities".
    const r = portfolioIntakeLimit({ active: true }, 0, 500);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.max).toBe(MAX_INTAKE_PER_CALL);

    // …and repeated calls get it to 1,000 with room to spare.
    const atThousand = portfolioIntakeLimit({ active: true }, 1000, 100);
    expect(atThousand.ok).toBe(true);
  });

  it('refuses a seat with no capacity row', () => {
    const r = portfolioIntakeLimit(null, 0, 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('NOT_CONFIGURED');
  });

  it('refuses an inactive seat — a book there is invisible, not safe', () => {
    const r = portfolioIntakeLimit({ active: false }, 0, 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INACTIVE');
  });

  it('bounds one request even when the seat has plenty of headroom', () => {
    const r = portfolioIntakeLimit({ active: true }, 0, MAX_INTAKE_PER_CALL + 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('CALL_TOO_LARGE');
  });

  it('refuses once the seat is at the portfolio ceiling', () => {
    const r = portfolioIntakeLimit({ active: true }, MAX_PORTFOLIO_PER_SEAT, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('PORTFOLIO_FULL');
  });

  it('clamps to the remaining headroom near the ceiling', () => {
    const r = portfolioIntakeLimit({ active: true }, MAX_PORTFOLIO_PER_SEAT - 7, 100);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.max).toBe(7);
  });

  it('never returns negative headroom for a seat already over the ceiling', () => {
    const r = portfolioIntakeLimit({ active: true }, MAX_PORTFOLIO_PER_SEAT + 50, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.max).toBe(0);
  });

  it('is a fuse well above the founder’s stated ~1,000 per seat, so it never shapes a decision', () => {
    expect(MAX_PORTFOLIO_PER_SEAT).toBeGreaterThan(2000);
  });
});

describe('the two gates stay separate', () => {
  const capacity = (over: Partial<RepCapacity> = {}): RepCapacity => ({
    repId: 'r1',
    name: 'Anshul',
    configured: true,
    config: cfg(),
    capacity: 150,
    activeNow: 150,
    available: 0,
    newToday: null,
    overflow: 0,
    inWindow: true,
    binding: 'capacity',
    readFailed: false,
    workItems: [],
    dormantCount: 0,
    ...over,
  } as RepCapacity);

  // THE REGRESSION GUARD. A rep whose live-work capacity is completely full may
  // still be made responsible for more people. If these two ever collapse back
  // into one gate, this fails.
  it('a rep at their work ceiling may still take students into their book', () => {
    const work = repAllocationLimit(capacity());
    expect(work.ok).toBe(false);          // no room for live work
    if (!work.ok) expect(work.reason).toBe('CAPACITY_BINDING');

    const book = portfolioIntakeLimit({ active: true }, 400, 200);
    expect(book.ok).toBe(true);           // plenty of room for responsibility
  });

  it('both gates still refuse an inactive seat', () => {
    expect(repAllocationLimit(capacity({ config: cfg({ active: false }) }))).toMatchObject({ ok: false, reason: 'INACTIVE' });
    expect(portfolioIntakeLimit({ active: false }, 0, 10)).toMatchObject({ ok: false, reason: 'INACTIVE' });
  });
});
