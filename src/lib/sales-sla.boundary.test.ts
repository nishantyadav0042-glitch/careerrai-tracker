import { describe, it, expect } from 'vitest';
import { workingMinutesBetween, firstContactDueAt, firstContactSla } from '@/lib/sales-sla';
import type { RepConfig } from '@/lib/sales-capacity';

// ── Adversarial boundary suite, written to BREAK the working-minute model ────
//
// Added in the 84c2be3 release audit. sales-sla.test.ts proves the model is
// right in ordinary use; this one attacks its edges, because an SLA that is
// subtly wrong at a boundary is worse than none — it teaches a counsellor that
// the number is noise.
//
// KNOWN LIMITATION, stated rather than silently assumed: a rep has ONE working
// window per day (work_start_ist / work_end_ist). Split shifts — say 07:00–09:00
// and 18:00–21:00 — cannot be expressed, and this suite does not pretend
// otherwise. If a counsellor ever needs one, that is a schema change, not a
// tweak, and inventing it here would be inventing a business rule.

const cfg = (o: Partial<RepConfig> = {}): RepConfig => ({
  repId: 'r', active: true, employmentType: 'part_time',
  workDays: [1, 3, 4, 5, 6, 7], workStartIst: '17:00', workEndIst: '22:00',
  maxCapacityUnits: 40, maxNewPerDay: 8, firstContactSlaMinutes: 120,
  unavailableUntil: null, capacityOverride: null, overrideUntil: null, ...o,
});
const ist = (s: string) => Date.parse(s + '+05:30');

describe('ADVERSARIAL: exact SLA boundary', () => {
  it('exactly at the SLA is NOT a breach; one minute past is', () => {
    const a = ist('2026-09-02T17:00');
    const at120 = firstContactSla(cfg(), { assignedAt: new Date(a).toISOString(), firstContactAt: null }, ist('2026-09-02T19:00'));
    const at121 = firstContactSla(cfg(), { assignedAt: new Date(a).toISOString(), firstContactAt: null }, ist('2026-09-02T19:01'));
    expect(at120).toMatchObject({ workingMinutesElapsed: 120, breached: false });
    expect(at121).toMatchObject({ workingMinutesElapsed: 121, breached: true });
  });
  it('one minute BEFORE the SLA is not a breach', () => {
    const s = firstContactSla(cfg(), { assignedAt: new Date(ist('2026-09-02T17:00')).toISOString(), firstContactAt: null }, ist('2026-09-02T18:59'));
    expect(s).toMatchObject({ workingMinutesElapsed: 119, breached: false });
  });
});

describe('ADVERSARIAL: shift-edge assignments', () => {
  it('assigned exactly AT shift start', () => {
    expect(workingMinutesBetween(cfg(), ist('2026-09-02T17:00'), ist('2026-09-02T18:00'))).toBe(60);
  });
  it('assigned exactly AT shift end accrues nothing that day', () => {
    expect(workingMinutesBetween(cfg(), ist('2026-09-02T22:00'), ist('2026-09-02T23:59'))).toBe(0);
  });
  it('assigned one minute before shift end accrues exactly one minute', () => {
    expect(workingMinutesBetween(cfg(), ist('2026-09-02T21:59'), ist('2026-09-02T23:00'))).toBe(1);
  });
  it('due time for a 21:59 assignment lands on the next working day', () => {
    // 1 min Wed + 119 min Thu → 17:00 + 119 = 18:59
    const due = firstContactDueAt(cfg(), ist('2026-09-02T21:59'));
    expect(new Date(due!).toISOString()).toBe(new Date(ist('2026-09-03T18:59')).toISOString());
  });
});

describe('ADVERSARIAL: off-day and multi-day spans', () => {
  it('assigned Monday 21:00, off Tuesday → due Wednesday', () => {
    const due = firstContactDueAt(cfg(), ist('2026-09-07T21:00'));
    // 60 min Mon, Tue off, 60 min Wed → 17:00 + 60 = 18:00
    expect(new Date(due!).toISOString()).toBe(new Date(ist('2026-09-09T18:00')).toISOString());
  });
  it('a whole off-day contributes zero even across a week', () => {
    // 7 days from Mon 00:00; Tue off → 6 working days × 300
    expect(workingMinutesBetween(cfg(), ist('2026-09-07T00:00'), ist('2026-09-14T00:00'))).toBe(1800);
  });
  it('a rep who works ONLY the off-day-free weekend', () => {
    const weekend = cfg({ workDays: [6, 7] });
    expect(workingMinutesBetween(weekend, ist('2026-09-07T00:00'), ist('2026-09-14T00:00'))).toBe(600);
  });
});

describe('ADVERSARIAL: DST-free IST and UTC-day boundaries', () => {
  it('a span crossing UTC midnight inside one IST shift counts continuously', () => {
    // 22:00 IST = 16:30 UTC, so an 17:00–22:00 IST shift never crosses UTC
    // midnight. Use a late shift that does: 23:00–23:59 IST = 17:30–18:29 UTC.
    const late = cfg({ workStartIst: '23:00', workEndIst: '23:59' });
    expect(workingMinutesBetween(late, ist('2026-09-02T23:00'), ist('2026-09-02T23:59'))).toBe(59);
  });
  it('an IST calendar day that starts on the previous UTC day is one day', () => {
    // 00:00 IST 3 Sep = 18:30 UTC 2 Sep. A 00:00–06:00 IST shift lives
    // entirely on the previous UTC date.
    const night = cfg({ workStartIst: '00:00', workEndIst: '06:00', workDays: [1,2,3,4,5,6,7] });
    expect(workingMinutesBetween(night, ist('2026-09-03T00:00'), ist('2026-09-03T06:00'))).toBe(360);
  });
});

describe('ADVERSARIAL: degenerate configs must not lie', () => {
  it('end before start accrues nothing rather than negative time', () => {
    expect(workingMinutesBetween(cfg({ workStartIst: '22:00', workEndIst: '17:00' }), ist('2026-09-02T00:00'), ist('2026-09-09T00:00'))).toBe(0);
  });
  it('a zero-length window accrues nothing', () => {
    expect(workingMinutesBetween(cfg({ workStartIst: '17:00', workEndIst: '17:00' }), ist('2026-09-02T00:00'), ist('2026-09-09T00:00'))).toBe(0);
  });
  it('a due time is never invented for an unworkable week', () => {
    expect(firstContactDueAt(cfg({ workDays: [] }), ist('2026-09-02T18:00'))).toBeNull();
    expect(firstContactDueAt(cfg({ workStartIst: '22:00', workEndIst: '17:00' }), ist('2026-09-02T18:00'))).toBeNull();
  });
  it('a 24h window is 1440 minutes, not 1441', () => {
    const allday = cfg({ workStartIst: '00:00', workEndIst: '23:59', workDays: [1,2,3,4,5,6,7] });
    expect(workingMinutesBetween(allday, ist('2026-09-02T00:00'), ist('2026-09-03T00:00'))).toBe(1439);
  });
});

describe('ADVERSARIAL: the walk cannot run away', () => {
  it('a year-long span terminates and stays bounded', () => {
    const n = workingMinutesBetween(cfg(), ist('2026-01-01T00:00'), ist('2026-12-31T00:00'));
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(370 * 300 + 1);
  });
  it('a span beyond the 370-day guard does not hang', () => {
    const t0 = Date.now();
    workingMinutesBetween(cfg(), ist('2020-01-01T00:00'), ist('2030-01-01T00:00'));
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
