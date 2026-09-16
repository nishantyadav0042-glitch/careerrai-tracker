/**
 * ── A counsellor's absence must not strand her students ────────────────────
 *
 * Neelam was away 12, 13 and 14 September. Her 583 students got nothing for
 * three days and Anshul could not have reached them: ownership is exclusive.
 * No leave was ever recorded, so a config flag alone would have caught none of
 * those days.
 */
import { describe, it, expect } from 'vitest';
import {
  isAbsentToday, coveringFor, istClock, COVER_AFTER_SHIFT_HOURS, type SeatDay,
} from './sales-absence-cover';
import { unclaimedDealtTo } from './sales-unclaimed-owner';

const A = 'a1111111-1111-4111-8111-111111111111';
const N = 'b2222222-2222-4222-8222-222222222222';
const TODAY = '2026-09-16';                       // a Wednesday
const ist = (hhmm: string) => Date.parse(`${TODAY}T${hhmm}:00+05:30`);

const seat = (over: Partial<SeatDay>): SeatDay => ({
  repId: A, active: true, workStartIst: '15:00:00', unavailableUntil: null,
  workedToday: 0, workDays: [1, 2, 3, 4, 5, 6], ...over,
});

describe('who is absent today', () => {
  it('a shift that has barely started is not an absence', () => {
    // She logs in at four and works till nine. At 15:20 she is not absent.
    expect(isAbsentToday(seat({}), ist('15:20'), TODAY)).toBe(false);
  });

  it('but silence deep into the shift is', () => {
    // THE THREE DAYS THIS EXISTS FOR: no leave was recorded, she simply did
    // not come in, and 583 students waited.
    expect(isAbsentToday(seat({}), ist('17:45'), TODAY)).toBe(true);
    expect(COVER_AFTER_SHIFT_HOURS).toBe(2.5);
  });

  it('one marked card proves she is working, whatever the hour', () => {
    expect(isAbsentToday(seat({ workedToday: 1 }), ist('20:30'), TODAY)).toBe(false);
  });

  it('declared leave counts from the first minute', () => {
    expect(isAbsentToday(seat({ unavailableUntil: '2026-09-18' }), ist('15:05'), TODAY)).toBe(true);
  });

  it('an expired leave date is not leave — it is a date, not a flag', () => {
    expect(isAbsentToday(seat({ unavailableUntil: '2026-09-15' }), ist('15:05'), TODAY)).toBe(false);
  });

  it('a day off is not an absence', () => {
    // Sunday. Covering a scheduled day off would hand one rep both books every
    // single week.
    const sunday = Date.parse('2026-09-20T18:00:00+05:30');
    expect(istClock(sunday).weekday).toBe(7);
    expect(isAbsentToday(seat({}), sunday, '2026-09-20')).toBe(false);
  });

  it('an inactive seat is never "absent" — it has no book to cover', () => {
    expect(isAbsentToday(seat({ active: false }), ist('19:00'), TODAY)).toBe(false);
  });

  it('never guesses when the shift start is unknown', () => {
    expect(isAbsentToday(seat({ workStartIst: null }), ist('20:00'), TODAY)).toBe(false);
  });
});

describe('who covers, and for whom', () => {
  const pick = (absentId: string, present: readonly string[]) => unclaimedDealtTo(absentId, present);
  const both = (over: Partial<SeatDay> = {}) => [
    seat({ repId: A, workedToday: 3 }), seat({ repId: N, ...over }),
  ];

  it('the present rep covers the absent one', () => {
    const seats = both();
    expect(coveringFor(A, seats, ist('18:00'), TODAY, pick)).toEqual([N]);
  });

  it('an absent rep covers nobody', () => {
    // Somebody who is not working today does not pick up another book.
    const seats = [seat({ repId: A }), seat({ repId: N })];
    expect(coveringFor(A, seats, ist('18:00'), TODAY, pick)).toEqual([]);
    expect(coveringFor(N, seats, ist('18:00'), TODAY, pick)).toEqual([]);
  });

  it('nobody covers while everyone is still working', () => {
    const seats = [seat({ repId: A, workedToday: 2 }), seat({ repId: N, workedToday: 5 })];
    expect(coveringFor(A, seats, ist('19:00'), TODAY, pick)).toEqual([]);
  });

  it('an absent book goes to exactly ONE cover, never to every seat', () => {
    // "Zero mixup between reps" must not be undone on precisely the days
    // nobody is watching.
    const C = 'c3333333-3333-4333-8333-333333333333';
    const seats = [
      seat({ repId: A, workedToday: 1 }), seat({ repId: C, workedToday: 1 }), seat({ repId: N }),
    ];
    const covers = [A, C].map((v) => coveringFor(v, seats, ist('18:00'), TODAY, pick));
    expect(covers.flat()).toEqual([N]);
  });

  it('gives the same answer all day', () => {
    const seats = both();
    const at18 = coveringFor(A, seats, ist('18:00'), TODAY, pick);
    const at20 = coveringFor(A, seats, ist('20:30'), TODAY, pick);
    expect(at18).toEqual(at20);
  });
});
