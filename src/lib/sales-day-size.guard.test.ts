/**
 * ── A band built to its bottom is a cap wearing a range's clothes ──────────
 *
 * Founder, 2 Sep 2026: "keep a range 50-70 daily."
 * Founder, 15 Sep 2026: "I want ki dono reps ko daily 70 relevant students
 * milne chahiye... naye students ko bhi daily add karte jao jinko touch hi
 * nahi kiya, unki quantity bhi badhate jao."
 *
 * Between those two sentences the rotation target read `DAY_FLOOR -
 * signalsToday`. With 23 signal cards it came out at 27, so 27 rotation cards
 * were dealt and the day ended at exactly 50 — while 319 never-contacted
 * students sat in that same rep's book, dealable, with phone numbers. The
 * number was not a capacity limit. It was the bottom of a band, reached on
 * purpose, every day.
 *
 * The measurable cost: on 14 Sep that rep WORKED 65 cards. A fifty-card day
 * takes fifteen conversations off him for no reason but arithmetic.
 *
 * What must NOT change, and is asserted here beside it: the ceiling still
 * binds, and a short book still reports short. Filling a day with real
 * rotation candidates is not padding — padding is dealing a student with no
 * reason to be dealt, and there is still no lane that invents one
 * (SALES-OS §5).
 */
import { describe, it, expect } from 'vitest';
import { assembleDay } from './sales-day';
import { DAY_FLOOR, DAY_CEILING, ROTATION_FLOOR, RETRY_CEILING } from './os/scale-config';
import type { DueReason } from './call-queue';

let seq = 0;
const c = (dueReason: DueReason, n = 1) =>
  Array.from({ length: n }, () => ({ studentId: `s${++seq}`, dueReason }));

describe('the day is built to the ceiling when the book can supply it', () => {
  it('reproduces the exact production shape that came out at fifty', () => {
    // Anshul, 16 Sep 01:00 IST: retry 20 (at its own ceiling), attention 2,
    // callback 1 — and a book with 319 never-contacted students behind it.
    const day = assembleDay([
      ...c('callback', 1), ...c('retry', 20), ...c('attention', 2), ...c('fresh', 319),
    ]);
    expect(day.queue.length, 'this was 50 before 15 Sep 2026').toBe(DAY_CEILING);
    expect(day.counts.given.rotation, 'and the never-contacted share was 27').toBe(DAY_CEILING - 23);
  });

  it('a quiet day is a full day of rotation, not a half day', () => {
    const day = assembleDay(c('fresh', 500));
    expect(day.queue.length).toBe(DAY_CEILING);
  });

  it('the silent book still gets its floor on a loud day', () => {
    const day = assembleDay([...c('going_cold', DAY_CEILING - ROTATION_FLOOR), ...c('fresh', 100)]);
    expect(day.counts.given.rotation).toBe(ROTATION_FLOOR);
    expect(day.queue.length).toBe(DAY_CEILING);
  });

  it('signals still fill first when they alone reach the ceiling', () => {
    // Unchanged by the 15 Sep target change and asserted so it stays visible:
    // seventy real signals leave no room, and rotation waits. This is the one
    // shape where the silent book does not move, and it is the right one — a
    // going-cold student outranks an introduction.
    const day = assembleDay([...c('going_cold', DAY_CEILING), ...c('fresh', 100)]);
    expect(day.counts.given.rotation).toBe(0);
    expect(day.queue.length).toBe(DAY_CEILING);
  });
});

describe('and the things that must not change, did not', () => {
  it('the ceiling still binds — 500 candidates are a day, not a list', () => {
    expect(assembleDay(c('fresh', 500)).queue.length).toBeLessThanOrEqual(DAY_CEILING);
    expect(assembleDay([...c('going_cold', 200), ...c('fresh', 500)]).queue.length)
      .toBeLessThanOrEqual(DAY_CEILING);
  });

  it('a book that cannot fill the day is reported short, never padded', () => {
    // SALES-OS §5. The only thing that changed is the target; nothing invents
    // a candidate, so eleven real opportunities are still eleven cards.
    const day = assembleDay(c('fresh', 11));
    expect(day.queue.length).toBe(11);
    expect(day.queue.length).toBeLessThan(DAY_FLOOR);
  });

  it('a worked card still frees no slot (Incident #72)', () => {
    // The day's ledger counts what was DEALT. Raising the target must not have
    // reopened the hole where a rebuild replaced every card the rep finished.
    const day = assembleDay(c('fresh', 200), { openToday: new Set(), usedToday: { fresh: DAY_CEILING } });
    expect(day.counts.given.rotation).toBe(0);
  });

  it('a lane ceiling is still a lane ceiling', () => {
    const day = assembleDay([...c('retry', 83), ...c('fresh', 200)]);
    expect(day.queue.filter((x) => x.dueReason === 'retry').length).toBe(RETRY_CEILING);
    expect(day.queue.length).toBe(DAY_CEILING);
  });
});
