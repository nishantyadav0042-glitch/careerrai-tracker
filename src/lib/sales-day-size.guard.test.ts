/**
 * ── A band built to its bottom is a cap wearing a range's clothes ──────────
 *
 * Founder, 2 Sep 2026: "keep a range 50-70 daily."
 * Founder, 15 Sep 2026: "I want ki dono reps ko daily 70 relevant students
 * milne chahiye... naye students ko bhi daily add karte jao jinko touch hi
 * nahi kiya, unki quantity bhi badhate jao."
 *
 * Between those two sentences the rotation target read `DAY_FLOOR -
 * signalsToday`, and it decided two things nobody chose.
 *
 * The deck a counsellor OPENS was always exactly DAY_FLOOR — the first build
 * of that rep's day was 50 cards on 10, 11, 13, 14, 15 and 16 Sep (53 on the
 * 12th). Days later ended at 59-73, but only because signals arriving through
 * the day were added on top, never bound by this target. His morning was fifty
 * cards, every morning, and on 14 Sep he WORKED 65.
 *
 * Worse, the never-contacted share was frozen at whatever signals existed when
 * the page was FIRST opened, because `usedRotation` has spent the target by
 * then and rotation never tops up again. Same rep, same book, same week:
 * 06:50 → 47 fresh · 00:07 with the retry lane full → 27 · 02:16 → 15. The
 * number of introductions a student cohort got was set by the clock time
 * somebody happened to load a page, while 319 never-contacted students sat in
 * that book with phone numbers.
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
    // Anshul's FIRST BUILD of 16 Sep, 00:07 IST: retry at its own ceiling,
    // attention 2, callback 1 — and a book with 319 never-contacted students
    // behind it. This is the deck he would have opened in the morning.
    //
    // The signal count moves with RETRY_CEILING, which fell 20 -> 12 on 16 Sep
    // after the retry lane was measured taking 41% of all calling effort at
    // 1.4% interested. Derived rather than typed, so the case keeps meaning
    // what it says when that ceiling moves again.
    const signals = 1 + RETRY_CEILING + 2;
    const day = assembleDay([
      ...c('callback', 1), ...c('retry', 30), ...c('attention', 2), ...c('fresh', 319),
    ]);
    expect(day.queue.length, 'this was 50 before 15 Sep 2026').toBe(DAY_CEILING);
    // `intro + rotation`: since 16 Sep the never-contacted cards lifted to the
    // top of the screen are counted under `intro`. The share of the day that
    // came out of the silent book is what this case is about, and that is the
    // sum — the split is which of them the counsellor sees first.
    expect(day.counts.given.intro + day.counts.given.rotation,
      'the never-contacted share was 27 that morning').toBe(DAY_CEILING - signals);
  });

  it('a quiet day is a full day of rotation, not a half day', () => {
    const day = assembleDay(c('fresh', 500));
    expect(day.queue.length).toBe(DAY_CEILING);
  });

  it('the silent book still gets its floor on a loud day', () => {
    const day = assembleDay([...c('going_cold', DAY_CEILING - ROTATION_FLOOR), ...c('fresh', 100)]);
    expect(day.counts.given.intro + day.counts.given.rotation).toBe(ROTATION_FLOOR);
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
