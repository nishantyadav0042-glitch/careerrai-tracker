import { describe, it, expect } from 'vitest';
import {
  checkEmploymentStatement,
  repAllocationLimit,
  checkNewRep,
  PART_TIME_REQUIRED_FIELDS,
} from '@/lib/sales-rep-provisioning';
import type { RepCapacity, RepConfig } from '@/lib/sales-capacity';

const cfg = (over: Partial<RepConfig> = {}): RepConfig => ({
  repId: 'rep-1', active: true, employmentType: 'part_time',
  workDays: [2, 4], workStartIst: '18:00', workEndIst: '21:00',
  maxCapacityUnits: 12, maxNewPerDay: 4, firstContactSlaMinutes: 120,
  unavailableUntil: null, capacityOverride: null, overrideUntil: null, ...over,
});

const cap = (over: Partial<RepCapacity> = {}): RepCapacity => ({
  repId: 'rep-1', name: 'Part time', configured: true, config: cfg(),
  capacity: 12, activeNow: 0, available: 12, newToday: null, overflow: 0,
  inWindow: true, binding: 'ASSIGNABLE', readFailed: false, workItems: [], dormantCount: 0, ...over,
});

const FULL_STATEMENT = {
  employment_type: 'part_time',
  work_days: [2, 4], work_start_ist: '18:00', work_end_ist: '21:00',
  max_capacity_units: 12, max_new_per_day: 4,
};

describe('part-time is described, never inherited', () => {
  it('refuses a seat that becomes part-time with no numbers, and names every one', () => {
    const r = checkEmploymentStatement({ employment_type: 'part_time' }, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing.sort()).toEqual([...PART_TIME_REQUIRED_FIELDS].sort());
  });

  it('refuses a PARTIAL statement — half a description is the same silent inheritance', () => {
    const r = checkEmploymentStatement({ employment_type: 'part_time', work_days: [2, 4], max_capacity_units: 12 }, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing.sort()).toEqual(['max_new_per_day', 'work_end_ist', 'work_start_ist']);
  });

  it('accepts a fully described part-time seat', () => {
    expect(checkEmploymentStatement(FULL_STATEMENT, null).ok).toBe(true);
  });

  it('catches the transition, not just creation: full_time → part_time bare is refused', () => {
    const existing = { employment_type: 'full_time' };
    expect(checkEmploymentStatement({ employment_type: 'part_time' }, existing).ok).toBe(false);
    expect(checkEmploymentStatement(FULL_STATEMENT, existing).ok).toBe(true);
  });

  it('lets an established part-timer be edited one field at a time', () => {
    // The statement was made when they became part-time. Requiring all five on
    // every later tweak would make the rule an obstacle rather than a check.
    expect(checkEmploymentStatement({ max_new_per_day: 6 }, { employment_type: 'part_time' }).ok).toBe(true);
  });

  it('never blocks full-time — the table defaults ARE the full-time week', () => {
    expect(checkEmploymentStatement({ employment_type: 'full_time' }, null).ok).toBe(true);
    expect(checkEmploymentStatement({ max_capacity_units: 60 }, { employment_type: 'full_time' }).ok).toBe(true);
    expect(checkEmploymentStatement({}, null).ok).toBe(true);
  });

  it('treats an explicit null as unstated — a null work_days is not a statement', () => {
    expect(checkEmploymentStatement({ ...FULL_STATEMENT, work_days: null }, null).ok).toBe(false);
  });
});

describe('a configured ceiling actually binds', () => {
  it('allows up to the free capacity', () => {
    const r = repAllocationLimit(cap({ available: 3, config: cfg({ maxNewPerDay: 15 }) }));
    expect(r).toMatchObject({ ok: true, max: 3, boundBy: 'capacity' });
  });

  it('applies the daily fuse when it is the smaller number', () => {
    const r = repAllocationLimit(cap({ available: 12, config: cfg({ maxNewPerDay: 4 }) }));
    expect(r).toMatchObject({ ok: true, max: 4, boundBy: 'daily_fuse' });
  });

  it('refuses an unconfigured account instead of treating it as a full-time one', () => {
    const r = repAllocationLimit(cap({ configured: false, config: null, capacity: null }));
    expect(r).toEqual({ ok: false, max: 0, reason: 'NOT_CONFIGURED' });
  });

  it('refuses when the read failed — "we could not look" is not "they have room"', () => {
    const r = repAllocationLimit(cap({ readFailed: true, available: 12 }));
    expect(r).toEqual({ ok: false, max: 0, reason: 'READ_FAILED' });
  });

  it('refuses an inactive rep, a rep on leave, and a rep already over their ceiling', () => {
    expect(repAllocationLimit(cap({ config: cfg({ active: false }) }))).toMatchObject({ reason: 'INACTIVE' });
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(repAllocationLimit(cap({ config: cfg({ unavailableUntil: future }) }))).toMatchObject({ reason: 'UNAVAILABLE' });
    expect(repAllocationLimit(cap({ overflow: 4 }))).toMatchObject({ reason: 'OVERFLOW' });
    expect(repAllocationLimit(cap({ available: 0 }))).toMatchObject({ reason: 'CAPACITY_BINDING' });
  });

  it('lets an expired leave date pass — unavailable_until is a date, not a flag', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(repAllocationLimit(cap({ config: cfg({ unavailableUntil: past }) })).ok).toBe(true);
  });

  it('does NOT withhold leads from a part-timer outside their working hours', () => {
    // Deliberate: hours govern the SLA clock and when contact is expected, not
    // who a student belongs to. Gating ownership on the clock would make
    // "part-time" mean "gets less work than configured", which is the exact
    // second-class treatment this build exists to prevent.
    const r = repAllocationLimit(cap({ inWindow: false, binding: 'OUT_OF_HOURS' }));
    expect(r).toMatchObject({ ok: true, max: 4 });
  });

  it('gives a part-timer their full configured share, not a fraction of a full-timer', () => {
    const partTime = repAllocationLimit(cap({ available: 12, config: cfg({ maxNewPerDay: 12 }) }));
    const fullTime = repAllocationLimit(cap({
      available: 12, config: cfg({ employmentType: 'full_time', maxNewPerDay: 12 }),
    }));
    // Same numbers → same headroom. employment_type is never a multiplier.
    expect(partTime).toEqual(fullTime);
  });
});

describe('the human half of provisioning', () => {
  it('requires a real email, a real name and a password we immediately forget', () => {
    expect(checkNewRep({ email: 'nope', fullName: 'A B', password: 'x'.repeat(12) }).ok).toBe(false);
    expect(checkNewRep({ email: 'a@b.in', fullName: 'A', password: 'x'.repeat(12) }).ok).toBe(false);
    expect(checkNewRep({ email: 'a@b.in', fullName: 'A B', password: 'short' }).ok).toBe(false);
    const ok = checkNewRep({ email: '  Part@CareerRai.in ', fullName: ' Part Time ', password: 'x'.repeat(12) });
    expect(ok).toMatchObject({ ok: true, email: 'part@careerrai.in', fullName: 'Part Time', phone: null });
  });

  it('never returns the password in its result', () => {
    const r = checkNewRep({ email: 'a@b.in', fullName: 'A B', password: 'sup3rsecret!' });
    expect(JSON.stringify(r)).not.toContain('sup3rsecret');
  });
});
