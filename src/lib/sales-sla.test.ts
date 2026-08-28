import { describe, it, expect } from 'vitest';
import { workingMinutesBetween, firstContactDueAt, firstContactSla, tallySla } from './sales-sla';
import type { RepConfig } from './sales-capacity';

// ── Anshul and Neelam's actual week ─────────────────────────────────────────
//
// Five hours a day, six days a week, evenings, one weekly off of their own
// choosing. Their engagement letters make Saturday and Sunday WORKING days —
// peak student activity — so the off day is a weekday. Anshul takes Tuesday.
const anshul: RepConfig = {
  repId: 'anshul', active: true, employmentType: 'part_time',
  workDays: [1, 3, 4, 5, 6, 7],          // Mon, Wed–Sun. Tuesday off.
  workStartIst: '17:00', workEndIst: '22:00',
  maxCapacityUnits: 40, maxNewPerDay: 8, firstContactSlaMinutes: 120,
  unavailableUntil: null, capacityOverride: null, overrideUntil: null,
};

/** An IST wall-clock string → UTC ms. */
const ist = (s: string) => Date.parse(s + '+05:30');

describe('working minutes only count inside the counsellor’s own window', () => {
  it('an hour inside the shift is an hour', () => {
    expect(workingMinutesBetween(anshul, ist('2026-09-02T18:00'), ist('2026-09-02T19:00'))).toBe(60);
  });

  it('overnight counts nothing — nobody is working', () => {
    // 22:00 Wed → 09:00 Thu. The whole span is outside the window.
    expect(workingMinutesBetween(anshul, ist('2026-09-02T22:00'), ist('2026-09-03T09:00'))).toBe(0);
  });

  it('a span straddling a shift counts only the shift part', () => {
    // 16:00 → 18:00, window opens 17:00. One hour counts.
    expect(workingMinutesBetween(anshul, ist('2026-09-02T16:00'), ist('2026-09-02T18:00'))).toBe(60);
  });

  it('the weekly off contributes nothing', () => {
    // Tue 8 Sep is Anshul's off day: Mon 21:00 → Wed 18:00 crosses it.
    // Mon 21:00-22:00 = 60, Tue = 0, Wed 17:00-18:00 = 60.
    expect(workingMinutesBetween(anshul, ist('2026-09-07T21:00'), ist('2026-09-09T18:00'))).toBe(120);
  });

  it('a full working day is exactly the shift length', () => {
    expect(workingMinutesBetween(anshul, ist('2026-09-02T00:00'), ist('2026-09-03T00:00'))).toBe(300);
  });

  it('Saturday and Sunday DO count — they are working days here', () => {
    // Sat 5 Sep and Sun 6 Sep 2026.
    expect(workingMinutesBetween(anshul, ist('2026-09-05T00:00'), ist('2026-09-07T00:00'))).toBe(600);
  });

  it('a backwards or zero interval is zero, not negative', () => {
    expect(workingMinutesBetween(anshul, ist('2026-09-02T19:00'), ist('2026-09-02T18:00'))).toBe(0);
    expect(workingMinutesBetween(anshul, ist('2026-09-02T18:00'), ist('2026-09-02T18:00'))).toBe(0);
  });

  it('a rep with no working days accrues nothing rather than everything', () => {
    const nobody = { ...anshul, workDays: [] };
    expect(workingMinutesBetween(nobody, ist('2026-09-01T00:00'), ist('2026-09-30T00:00'))).toBe(0);
  });
});

describe('the SLA is due in working time — W6, stated in the column comment', () => {
  it('a lead handed over at 21:30 is due next working evening, not at 23:30', () => {
    // 30 min left on Wed, so 90 min of Thursday's shift: 17:00 + 90 = 18:30.
    const due = firstContactDueAt(anshul, ist('2026-09-02T21:30'));
    expect(new Date(due!).toISOString()).toBe(new Date(ist('2026-09-03T18:30')).toISOString());
  });

  it('a lead handed over mid-shift is due two hours later the same evening', () => {
    const due = firstContactDueAt(anshul, ist('2026-09-02T18:00'));
    expect(new Date(due!).toISOString()).toBe(new Date(ist('2026-09-02T20:00')).toISOString());
  });

  it('a lead handed over on the off day waits for the next working day', () => {
    // Tue 8 Sep is off; Wed opens 17:00, +120 = 19:00.
    const due = firstContactDueAt(anshul, ist('2026-09-08T11:00'));
    expect(new Date(due!).toISOString()).toBe(new Date(ist('2026-09-09T19:00')).toISOString());
  });

  it('a rep with no workable week has no due time rather than a false one', () => {
    expect(firstContactDueAt({ ...anshul, workDays: [] }, ist('2026-09-02T18:00'))).toBeNull();
  });
});

describe('a lead we never recorded is UNKNOWN, never "on time"', () => {
  it('no assigned_at → unknown', () => {
    // Rows predating 28 Aug 2026 have no assignment time and cannot be
    // back-filled. Calling them compliant would invent a history we never had.
    expect(firstContactSla(anshul, { assignedAt: null, firstContactAt: null }, ist('2026-09-02T20:00')))
      .toEqual({ state: 'unknown' });
  });

  it('an unparseable timestamp is unknown, not zero minutes', () => {
    expect(firstContactSla(anshul, { assignedAt: 'not-a-date', firstContactAt: null }, Date.now()))
      .toEqual({ state: 'unknown' });
  });
});

describe('awaiting and contacted', () => {
  it('uncalled and inside the SLA is awaiting, not breached', () => {
    const s = firstContactSla(anshul,
      { assignedAt: new Date(ist('2026-09-02T18:00')).toISOString(), firstContactAt: null },
      ist('2026-09-02T19:00'));
    expect(s).toMatchObject({ state: 'awaiting', workingMinutesElapsed: 60, breached: false });
  });

  it('uncalled overnight is STILL not breached — the clock stopped', () => {
    // Assigned 21:30 Wed, checked 09:00 Thu. Wall clock says 11.5 hours; the
    // counsellor has had 30 working minutes. Breaching here is what makes an
    // SLA something a part-timer learns to ignore.
    const s = firstContactSla(anshul,
      { assignedAt: new Date(ist('2026-09-02T21:30')).toISOString(), firstContactAt: null },
      ist('2026-09-03T09:00'));
    expect(s).toMatchObject({ state: 'awaiting', workingMinutesElapsed: 30, breached: false });
  });

  it('uncalled past two working hours IS breached', () => {
    const s = firstContactSla(anshul,
      { assignedAt: new Date(ist('2026-09-02T17:30')).toISOString(), firstContactAt: null },
      ist('2026-09-02T20:30'));
    expect(s).toMatchObject({ state: 'awaiting', workingMinutesElapsed: 180, breached: true });
  });

  it('called inside the window records how long it took', () => {
    const s = firstContactSla(anshul, {
      assignedAt: new Date(ist('2026-09-02T17:30')).toISOString(),
      firstContactAt: new Date(ist('2026-09-02T18:15')).toISOString(),
    }, ist('2026-09-05T00:00'));
    expect(s).toMatchObject({ state: 'contacted', workingMinutesTaken: 45, breached: false });
  });

  it('called at the START of the next shift is ON TIME, not 20 hours late', () => {
    // THE CASE THAT SEPARATES THE TWO CLOCKS, and the one this module exists
    // for. Assigned 21:30 Wednesday, called 17:15 Thursday — fifteen minutes
    // into the next shift, which is as fast as a part-time counsellor can
    // physically be. Wall clock calls that a 20-hour breach; working minutes
    // call it 45. A system that punishes the fastest possible response is one
    // Anshul and Neelam would correctly learn to ignore.
    const s = firstContactSla(anshul, {
      assignedAt: new Date(ist('2026-09-02T21:30')).toISOString(),
      firstContactAt: new Date(ist('2026-09-03T17:15')).toISOString(),
    }, ist('2026-09-05T00:00'));
    expect(s).toMatchObject({ state: 'contacted', workingMinutesTaken: 45, breached: false });
  });

  it('called late is recorded as late even though it was called', () => {
    const s = firstContactSla(anshul, {
      assignedAt: new Date(ist('2026-09-02T17:00')).toISOString(),
      firstContactAt: new Date(ist('2026-09-03T18:00')).toISOString(),
    }, ist('2026-09-05T00:00'));
    expect(s.state).toBe('contacted');
    expect(s).toMatchObject({ breached: true });
  });
});

describe('the tally separates unknown from compliant', () => {
  it('counts each state once and never folds unknown into on-time', () => {
    const t = tallySla(anshul, [
      { assignedAt: null, firstContactAt: null },
      { assignedAt: new Date(ist('2026-09-02T17:30')).toISOString(), firstContactAt: null },
      { assignedAt: new Date(ist('2026-09-02T17:00')).toISOString(), firstContactAt: null },
      { assignedAt: new Date(ist('2026-09-02T17:30')).toISOString(),
        firstContactAt: new Date(ist('2026-09-02T18:15')).toISOString() },
      { assignedAt: new Date(ist('2026-09-02T17:00')).toISOString(),
        firstContactAt: new Date(ist('2026-09-03T18:00')).toISOString() },
    ], ist('2026-09-02T20:30'));
    expect(t).toEqual({ awaiting: 2, breached: 2, contactedInTime: 1, contactedLate: 1, unknown: 1 });
  });
});
