import { describe, it, expect } from 'vitest';
import { assembleDay, dayAnchorMs, istHour, SECTION_OF, SECTION_ORDER, type DaySection } from './sales-day';
import type { DueReason } from './call-queue';
import {
  DAY_FLOOR, DAY_CEILING, ROTATION_FLOOR, ATTENTION_CEILING, NEW_ARRIVAL_CEILING, ROTATION_CALL_EVERY,
  SHIFT_END_HOUR_IST, RETRY_CEILING, FRESH_PIN_PER_DAY,
} from './os/scale-config';

// ── THE DAY IS 50–70, AND EVERY RULE OF IT IS PROVEN HERE ───────────────────
//
// Founder, 2 Sep 2026: "keep a range 50–70 daily", "a mix of all variety",
// "the old students must rotate". assembleDay is the whole rule as a pure
// function; these cases are the contract, one property each.

let seq = 0;
const c = (dueReason: DueReason, n = 1) =>
  Array.from({ length: n }, () => ({ studentId: `s${++seq}`, dueReason }));

describe('the band', () => {
  // ── 15 Sep 2026: the band is built to the TOP, not the bottom ────────────
  //
  // These two cases asserted DAY_FLOOR until tonight, and that assertion was
  // the bug: with 23 signal cards a rep's day came out at exactly 50 while
  // 319 never-contacted students sat in his book with phone numbers. A band
  // built to its bottom every day is a cap, not a range. Founder: "dono reps
  // ko daily 70 relevant students milne chahiye."
  it('signals short of the ceiling: rotation fills the day to the ceiling', () => {
    const day = assembleDay([...c('going_cold', 5), ...c('conversion', 5), ...c('fresh', 100)]);
    expect(day.queue).toHaveLength(DAY_CEILING);
    expect(day.counts.given.rotation).toBe(DAY_CEILING - 10);
  });

  it('signals near the ceiling: rotation still gets its floor, up to the ceiling', () => {
    const signals = DAY_CEILING - ROTATION_FLOOR;
    const day = assembleDay([...c('going_cold', signals), ...c('fresh', 100)]);
    expect(day.queue).toHaveLength(DAY_CEILING);
    expect(day.counts.given.rotation, 'the silent book moves even on a loud day').toBe(ROTATION_FLOOR);
  });

  it('signals above the floor: rotation takes only the room left under the ceiling', () => {
    const day = assembleDay([...c('going_cold', 60), ...c('fresh', 100)]);
    expect(day.queue).toHaveLength(DAY_CEILING);
    expect(day.counts.given.rotation).toBe(DAY_CEILING - 60);
  });

  it('signals over the ceiling are trimmed from the bottom — never a promise or a money card', () => {
    const day = assembleDay([
      ...c('callback', 5), ...c('checkout_abandoned', 3), ...c('going_cold', 40), ...c('broken_streak', 40),
      ...c('fresh', 50),
    ]);
    expect(day.queue).toHaveLength(DAY_CEILING);
    expect(day.counts.given.promises).toBe(5);
    expect(day.counts.given.money).toBe(3);
    expect(day.counts.given.rotation).toBe(0);
  });

  it('promises are never bumped: 80 due callbacks make an 80-card day', () => {
    const day = assembleDay([...c('callback', 80), ...c('fresh', 50)]);
    expect(day.queue).toHaveLength(80);
    expect(day.counts.given.rotation).toBe(0);
  });

  it('an exhausted book gives a short day, honestly — nothing is invented', () => {
    const day = assembleDay([...c('going_cold', 12)]);
    expect(day.queue).toHaveLength(12);
    expect(day.counts.rotationPool).toBe(0);
  });

  it('an empty book gives an empty day', () => {
    const day = assembleDay([]);
    expect(day.queue).toEqual([]);
    expect(Object.values(day.counts.given).every((n) => n === 0)).toBe(true);
    expect(day.band).toEqual({ floor: DAY_FLOOR, ceiling: DAY_CEILING });
  });
});

describe('ceilings hold back, never discard', () => {
  it('attention stops at its ceiling when the day is full', () => {
    const day = assembleDay([...c('attention', 40), ...c('going_cold', 20), ...c('fresh', 100)]);
    expect(day.counts.given.attention).toBe(ATTENTION_CEILING);
    expect(day.counts.heldBack).toBe(40 - ATTENTION_CEILING);
  });

  it('new arrivals stop at their ceiling when the day is full', () => {
    const day = assembleDay([...c('new_never_logged', 30), ...c('going_cold', 20), ...c('fresh', 100)]);
    expect(day.counts.given.new).toBe(NEW_ARRIVAL_CEILING);
  });

  it('held-back signals return before the day ends short', () => {
    // 40 attention, nothing else: the ceiling would leave a 20-card day, and
    // the rotation pool is empty. Real signals beat ending short.
    const day = assembleDay([...c('attention', 40)]);
    expect(day.queue).toHaveLength(40);
    expect(day.counts.given.attention).toBe(40);
  });
});

describe('order and channel', () => {
  // ── THE ONE DELIBERATE EXCEPTION (founder, 15 Sep 2026) ───────────────────
  //
  // Fourteen days: 273 never-contacted cards DEALT across both books, 66
  // worked, while promise cards ran at 74-91%. The cold lane was never short
  // of cards — it was short of hours, because promises sort first, get worked
  // first, and the day ends. So FRESH_PIN_PER_DAY never-contacted students sit
  // above the promises, and everything below them keeps the queue's ranking
  // exactly. Nothing is dropped.
  //
  // CHANGED 16 Sep 2026 when the block went from five to twenty-five: the
  // promises keep the top and the pinned block sits straight after them. At
  // five, pinning above a promise cost a student minutes. At twenty-five it
  // would cost a rep who works ~28 cards EVERY promise in the day, and one
  // counsellor is carrying 35 callbacks. Promises are never bumped (2 Sep);
  // the block still starts near the top, because promises are few.
  it('puts the promises first, then pins the never-contacted block', () => {
    const day = assembleDay([...c('callback', 2), ...c('checkout_abandoned', 1), ...c('attention', 3), ...c('fresh', 60)]);
    const sections = day.queue.map((x) => x.section);
    expect(sections.slice(0, 2), 'a promise is never bumped').toEqual(['promises', 'promises']);
    const block = day.queue.slice(2, 2 + FRESH_PIN_PER_DAY);
    expect(block.every((x) => x.dueReason === 'fresh'), 'the pinned block follows the promises').toBe(true);
  });

  it('keeps the queue ranking for everything below the pinned block', () => {
    const day = assembleDay([...c('callback', 2), ...c('checkout_abandoned', 1), ...c('attention', 3), ...c('fresh', 60)]);
    const below = day.queue.map((x) => x.section).slice(2 + FRESH_PIN_PER_DAY);
    expect(below[0], 'money sorts above attention and rotation').toBe('money');
    const firstRotation = below.indexOf('rotation');
    expect(below.slice(firstRotation).every((s) => s === 'rotation')).toBe(true);
  });

  it('drops nothing and duplicates nothing when it pins', () => {
    // A re-order that loses a promise is a broken commitment, not a tweak.
    const day = assembleDay([...c('callback', 2), ...c('checkout_abandoned', 1), ...c('attention', 3), ...c('fresh', 60)]);
    const ids = day.queue.map((x) => x.studentId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(day.queue.filter((x) => x.section === 'promises')).toHaveLength(2);
  });

  it('pins nothing when the day holds no never-contacted student', () => {
    const day = assembleDay([...c('callback', 2), ...c('attention', 3), ...c('rotation', 20)]);
    expect(day.queue[0].section).toBe('promises');
  });

  it('only rotation is messaged, and there only every Nth card is a call', () => {
    const day = assembleDay([...c('callback', 1), ...c('attention', 2), ...c('going_cold', 1), ...c('fresh', 20)]);
    const by = (s: string) => day.queue.filter((x) => x.section === s);
    expect(by('promises').every((x) => x.channel === 'call')).toBe(true);
    expect(by('retention').every((x) => x.channel === 'call')).toBe(true);
    // Attention was a message from 2 Sep and is a CALL from 15 Sep (founder).
    // The student it goes to opened the app and stopped short of studying,
    // often having said so in their own words; a template is the wrong reply
    // to that. The cost was paid in ATTENTION_CEILING, not in the channel.
    expect(by('attention').every((x) => x.channel === 'call')).toBe(true);
    // The pinned never-contacted cards are CALLS, whatever the rotation cycle
    // would have given them: an introduction that arrives as a template
    // defeats the point of pinning it.
    const promiseCount = day.queue.filter((x) => x.section === 'promises').length;
    const pinned = day.queue.slice(promiseCount, promiseCount + FRESH_PIN_PER_DAY)
      .filter((x) => x.dueReason === 'fresh');
    expect(pinned.length, 'the block must exist to be worth asserting').toBeGreaterThan(0);
    expect(pinned.every((x) => x.channel === 'call')).toBe(true);
    // Below the pin the every-Nth-is-a-call cycle carries on from where the
    // pinned cards left it. They were rotation cards too, so they spent the
    // first FRESH_PIN_PER_DAY positions of the cycle before being lifted out
    // and made calls — the cycle is not restarted, which would quietly turn
    // extra rotation cards into calls the founder never asked for.
    const rot = by('rotation').slice(pinned.length);
    rot.forEach((x, i) => expect(x.channel)
      .toBe((i + FRESH_PIN_PER_DAY) % ROTATION_CALL_EVERY === 0 ? 'call' : 'message'));
  });

  it('never contacted comes before the long-silent, even when the queue ranked it lower', () => {
    // `rotation` is someone we HAVE spoken to; `fresh` is someone nobody ever
    // has. The pin is only ever spent on the second kind.
    const cands = [...c('rotation', 3), ...c('fresh', 3)];
    const day = assembleDay(cands);
    expect(day.queue.map((x) => x.dueReason).slice(0, 3)).toEqual(['fresh', 'fresh', 'fresh']);
  });

  it('the counts add up to the queue, section by section', () => {
    const day = assembleDay([...c('callback', 3), ...c('conversion', 2), ...c('new_never_logged', 4), ...c('attention', 5), ...c('fresh', 40)]);
    const total = SECTION_ORDER.reduce((s, k) => s + day.counts.given[k], 0);
    expect(total).toBe(day.queue.length);
    for (const k of SECTION_ORDER) expect(day.queue.filter((x) => x.section === k)).toHaveLength(day.counts.given[k]);
  });

  it('is deterministic — same input, same output', () => {
    const cands = [...c('going_cold', 7), ...c('attention', 30), ...c('fresh', 90)];
    const a = assembleDay(cands).queue.map((x) => `${x.studentId}:${x.channel}`);
    const b = assembleDay(cands).queue.map((x) => `${x.studentId}:${x.channel}`);
    expect(a).toEqual(b);
  });

  it('every lane maps to exactly one section', () => {
    const lanes: DueReason[] = ['callback', 'retry', 'followup', 'checkout_abandoned', 'going_cold', 'broken_streak', 'new_never_logged', 'conversion', 'attention', 'fresh', 'rotation'];
    for (const l of lanes) expect(SECTION_ORDER).toContain(SECTION_OF[l]);
  });
});

// ── THE DAY IS A FIXED SET (found in production 3 Sep 2026) ────────────────
//
// Each seat was offered 97 cards in one day against a ceiling of 70, because
// the queue is rebuilt on every page load: a worked card left, rotation
// backfilled to the floor, and the counsellor was handed fresh students. The
// list could never be finished — work ten, get ten more — and that is exactly
// the quota-driven replenishment the founder ruled out on 30 Aug.
describe('a rebuild continues today, it does not deal a second day', () => {
  it('rotation does not re-top after cards are worked', () => {
    // THE INCIDENT #72 INVARIANT, unchanged: morning deals 50 rotation cards,
    // by evening 30 are marked and 20 remain open. A rebuild must never treat
    // the 30 worked ones as free slots and deal 30 replacements.
    //
    // What the 15 Sep target change does alter is the arithmetic around it:
    // the day's target is DAY_CEILING now, so after 50 dealt there are 20 more
    // to give — and the rebuild gives exactly those 20, never 50 again. The
    // worked cards still free nothing.
    const remaining = c('rotation', 20);
    const openToday = new Set(remaining.map((x) => x.studentId));
    const day = assembleDay([...remaining, ...c('rotation', 200)], {
      openToday, usedToday: { rotation: 50 },
    });
    const newlyDealt = day.queue.filter((x) => !openToday.has(x.studentId)).length;
    expect(newlyDealt, 'only the room left under the ceiling').toBe(DAY_CEILING - 50);
    expect(50 + newlyDealt, 'the day still stops at the ceiling').toBe(DAY_CEILING);
    expect(day.queue.filter((x) => openToday.has(x.studentId)),
      'every open card survives the rebuild').toHaveLength(20);
  });

  it('rotation tops up only to the day-s target, counting what it already spent', () => {
    // 10 dealt this morning, 4 still open: the target is the ceiling, so at
    // most DAY_CEILING - 10 new. The invariant under test is unchanged — what
    // was already DEALT is subtracted, so a worked card never frees a slot
    // (Incident #72). Only the target moved.
    const remaining = c('rotation', 4);
    const openToday = new Set(remaining.map((x) => x.studentId));
    const day = assembleDay([...remaining, ...c('rotation', 200)], {
      openToday, usedToday: { rotation: 10 },
    });
    expect(day.counts.given.rotation).toBe(4 + (DAY_CEILING - 10));
  });

  it('a genuinely new SIGNAL still arrives mid-day — that is the point of the exception', () => {
    // A promise coming due at 6pm, on a rotation target already fully spent.
    const day = assembleDay([...c('callback', 1), ...c('rotation', 50)], {
      openToday: new Set(), usedToday: { rotation: DAY_CEILING },
    });
    expect(day.counts.given.promises, 'a promise is never withheld').toBe(1);
    expect(day.counts.given.rotation, 'but rotation is done for today').toBe(0);
  });

  it('with no context it behaves exactly as before — nothing else changes', () => {
    const cands = [...c('going_cold', 5), ...c('rotation', 100)];
    expect(assembleDay(cands).queue).toHaveLength(DAY_CEILING);
  });
});

describe('the 4 AM anchor', () => {
  it('before 4 AM IST the anchor is yesterday 4 AM; after, today 4 AM', () => {
    // 02:00 IST on 3 Sep = 20:30 UTC on 2 Sep.
    const early = Date.parse('2026-09-02T20:30:00Z');
    expect(new Date(dayAnchorMs(early)).toISOString()).toBe('2026-09-01T22:30:00.000Z'); // 2 Sep 04:00 IST
    // 15:00 IST on 3 Sep = 09:30 UTC.
    const later = Date.parse('2026-09-03T09:30:00Z');
    expect(new Date(dayAnchorMs(later)).toISOString()).toBe('2026-09-02T22:30:00.000Z'); // 3 Sep 04:00 IST
  });
});

// ── A CEILING COUNTS THE DAY, NOT THE SCREEN (production, 5 Sep 2026) ───────
//
// The first assembly of 5 Sep was exactly right: Anshul was dealt 65 cards
// with attention at 20 and new arrivals at 15, both precisely their ceilings.
// By 22:00 he had been dealt 111 and Neelam 174, against a ceiling of 70 —
// attention alone reached 45 and 64.
//
// Why: every ceiling was measured against the cards still ON SCREEN. Work a
// card and it leaves the queue, so the lane has "room" again and the next
// page load deals a fresh full allowance. Incident #68 found this exact defect
// and fixed it for rotation ALONE; the same hole stayed open in every other
// lane, and in the day ceiling itself.
//
// The ledger below (`usedToday`) is what a ceiling is measured against now:
// cards DEALT today, in every state — worked, skipped, still open.
describe('the day s ceilings count what was dealt today', () => {
  it('a lane at its ceiling admits nothing new, however many candidates wait', () => {
    // 20 attention cards already dealt and all of them worked, so none are on
    // screen. 40 more students have since opened the app without logging.
    const day = assembleDay([...c('attention', 40), ...c('rotation', 100)], {
      openToday: new Set(), usedToday: { attention: ATTENTION_CEILING },
    });
    expect(day.counts.given.attention, 'the lane is spent for the day').toBe(0);
  });

  it('a lane part-spent admits only the remainder', () => {
    const day = assembleDay([...c('attention', 40), ...c('rotation', 100)], {
      openToday: new Set(), usedToday: { attention: ATTENTION_CEILING - 5 },
    });
    expect(day.counts.given.attention).toBe(5);
  });

  it('new arrivals are capped by the day too, not by the screen', () => {
    const day = assembleDay([...c('new_never_logged', 30), ...c('rotation', 100)], {
      openToday: new Set(), usedToday: { new_never_logged: NEW_ARRIVAL_CEILING },
    });
    expect(day.counts.given.new).toBe(0);
  });

  it('the DAY ceiling counts the day: 65 dealt leaves room for 5', () => {
    const day = assembleDay([...c('going_cold', 40), ...c('rotation', 100)], {
      openToday: new Set(),
      usedToday: { attention: 20, new_never_logged: 15, going_cold: 10, rotation: 20 },
    });
    const dealt = 65 + day.queue.length;
    expect(dealt).toBeLessThanOrEqual(DAY_CEILING);
  });

  it('rotation s target counts signals DEALT today, not signals still open', () => {
    // Neelam, 5 Sep 20:00. 40 signals and 15 rotation cards dealt since
    // midnight; nearly all worked, so the screen looks empty and the old rule
    // read "few signals — deal 50 more rotation cards". It dealt 15 more, then
    // 14 more at 22:00: 44 never-contacted students in one day.
    const day = assembleDay([...c('fresh', 200)], {
      openToday: new Set(),
      // 40 signals dealt + rotation already at the day's remaining room.
      usedToday: { callback: 5, attention: 20, new_never_logged: 15, rotation: DAY_CEILING - 40 },
    });
    expect(day.counts.given.rotation, 'rotation is done for today').toBe(0);
  });

  it('carried cards always survive, even in a lane that is over its ceiling', () => {
    // The ceiling must never take back a card the counsellor can already see.
    const open = c('attention', 25);
    const day = assembleDay([...open, ...c('attention', 10), ...c('rotation', 100)], {
      openToday: new Set(open.map((x) => x.studentId)),
      usedToday: { attention: 25 },
    });
    expect(day.counts.given.attention, 'all 25 stay, none of the 10 new ones join').toBe(25);
    expect(open.every((o) => day.queue.some((x) => x.studentId === o.studentId))).toBe(true);
  });

  it('a promise still arrives mid-day, on a day already at its ceiling', () => {
    const day = assembleDay([...c('callback', 1), ...c('attention', 20)], {
      openToday: new Set(), usedToday: { attention: 20, new_never_logged: 15, going_cold: 15, rotation: 20 },
    });
    expect(day.counts.given.promises, 'never withheld').toBe(1);
    expect(day.counts.given.attention, 'but the lane is spent').toBe(0);
  });

  it('the backfill measures shortness on the whole day, not the screen', () => {
    // 60 cards dealt today, 55 of them worked. The day is not short; a
    // held-back card must not be pulled in to "fill" an empty-looking screen.
    const day = assembleDay([...c('attention', 40)], {
      openToday: new Set(), usedToday: { attention: ATTENTION_CEILING, new_never_logged: 15, going_cold: 10, rotation: 15 },
    });
    expect(day.queue).toHaveLength(0);
  });
});

// ── A CLOSED DAY IS NOT RE-DEALT (production, 5 Sep 2026) ───────────────────
//
// The sweep closed 5 Sep at 21:45 IST. At 22:00 Neelam's page dealt her 20
// MORE cards — 14 of them never-contacted students — into a day that was over.
// Nobody was going to work them, and tomorrow's sweep would file them as
// leakage. A card dealt after the shift is not work, it is noise in the count.
describe('after the shift ends', () => {
  it('deals nothing new', () => {
    const day = assembleDay([...c('attention', 30), ...c('callback', 2), ...c('rotation', 100)], {
      openToday: new Set(), usedToday: { attention: 5 }, shiftOver: true,
    });
    expect(day.queue).toHaveLength(0);
  });

  it('still shows the cards already dealt, so a late marking lands', () => {
    const open = c('attention', 6);
    const day = assembleDay([...open, ...c('rotation', 100)], {
      openToday: new Set(open.map((x) => x.studentId)),
      usedToday: { attention: 6 }, shiftOver: true,
    });
    expect(day.queue).toHaveLength(6);
    expect(day.counts.given.rotation).toBe(0);
  });
});

// ── THE PRODUCTION DAY, REPLAYED ───────────────────────────────────────────
describe('5 Sep 2026 replayed', () => {
  it('a day of rebuilds can never exceed the ceiling', () => {
    // Deal the morning, then rebuild twelve times, working five cards each
    // time — exactly what a counsellor's browser did all day.
    const pool = [...c('attention', 120), ...c('new_never_logged', 60), ...c('going_cold', 30), ...c('fresh', 400)];
    const used: Partial<Record<DueReason, number>> = {};
    const worked = new Set<string>();
    let open = new Set<string>();
    let dealt = 0;
    for (let round = 0; round < 12; round++) {
      const day = assembleDay(pool.filter((x) => !worked.has(x.studentId)), { openToday: open, usedToday: used });
      for (const card of day.queue) {
        if (!open.has(card.studentId)) {
          used[card.dueReason] = (used[card.dueReason] ?? 0) + 1;
          dealt++;
        }
      }
      open = new Set(day.queue.map((x) => x.studentId));
      for (const card of day.queue.slice(0, 5)) { worked.add(card.studentId); open.delete(card.studentId); }
    }
    expect(dealt, `a seat was offered ${dealt} cards`).toBeLessThanOrEqual(DAY_CEILING);
    expect(dealt).toBeGreaterThanOrEqual(DAY_FLOOR);
  });
});

describe('the IST hour', () => {
  it('midnight IST is hour 0, not 24 — the modulo is load-bearing', () => {
    // 00:30 IST on 5 Sep = 19:00 UTC on 4 Sep. en-GB renders this as "24",
    // and an unguarded compare would call it past the shift end (Incident #68).
    expect(istHour(new Date('2026-09-04T19:00:00Z'))).toBe(0);
    expect(istHour(new Date('2026-09-04T19:00:00Z')) >= SHIFT_END_HOUR_IST).toBe(false);
    expect(istHour(new Date('2026-09-05T16:30:00Z'))).toBe(22);
    expect(istHour(new Date('2026-09-05T15:00:00Z'))).toBe(20);
  });
});

describe('a card the ledger cannot name still occupies the day', () => {
  it('an unrecognised lane does not hand back a full allowance', () => {
    // 60 cards dealt today, but a lane rename left 40 of them unattributable.
    // The sections sum to 20; the day is still 60 and has room for 10.
    const day = assembleDay([...c('going_cold', 40), ...c('rotation', 100)], {
      openToday: new Set(), usedToday: { attention: 20 }, dealtToday: 60,
    });
    expect(60 + day.queue.length).toBeLessThanOrEqual(DAY_CEILING);
  });
});

// ── A RE-DIAL IS NOT A PROMISE (production, 6–9 Sep 2026) ───────────────────
//
// Neelam's retry lane ran 60, 51, 73, 83 across four days. On 9 Sep she was
// dealt 116 cards — every single one a promise, 83 of them retries — worked 72
// and left 44 unmarked. Zero never-contacted students for the fourth day
// running, against 250 in her book.
//
// The cause was a classification: `retry` sat in UNTRIMMABLE beside `callback`,
// so the no-answer pile inherited "promises are never bumped" and fed on
// itself — each unanswered call manufacturing tomorrow's card. A callback is a
// promise the STUDENT extracted from us. A retry is our own policy.
describe('retries yield, callbacks do not', () => {
  it('caps the re-dial pile and holds the rest for tomorrow', () => {
    const day = assembleDay([...c('retry', 83), ...c('rotation', 200)]);
    expect(day.counts.given.promises).toBe(RETRY_CEILING);
  });

  it('does not cap the callbacks sitting in the same section', () => {
    // THE TRAP. callback, retry and followup all live in the `promises`
    // section. A ceiling counted per SECTION would silently bump callbacks —
    // promises a student asked for — the moment retries filled the lane.
    const day = assembleDay([...c('retry', 40), ...c('callback', 30), ...c('followup', 12)]);
    const byLane = (l: DueReason) => day.queue.filter((x) => x.dueReason === l).length;
    expect(byLane('retry')).toBe(RETRY_CEILING);
    expect(byLane('callback'), 'a callback is never bumped').toBe(30);
    expect(byLane('followup'), 'nor a follow-up').toBe(12);
  });

  it('a day of nothing but callbacks is still uncapped', () => {
    const day = assembleDay([...c('callback', 80), ...c('fresh', 50)]);
    expect(day.queue).toHaveLength(80);
  });

  it('the ledger counts retries alone, not the whole promises section', () => {
    // 20 retries and 15 callbacks already dealt today. Retries are spent;
    // callbacks are not, and neither state may be read from the other.
    const day = assembleDay([...c('retry', 30), ...c('callback', 10), ...c('rotation', 100)], {
      openToday: new Set(), usedToday: { retry: RETRY_CEILING, callback: 15 },
    });
    const byLane = (l: DueReason) => day.queue.filter((x) => x.dueReason === l).length;
    expect(byLane('retry'), 'spent for the day').toBe(0);
    expect(byLane('callback'), 'unaffected').toBe(10);
  });

  it('9 Sep replayed: the day becomes finishable and rotation gets the room', () => {
    // The real shape of that day: 83 retries, 33 other promises, and a deep
    // never-contacted pool that had been getting nothing.
    const day = assembleDay([
      ...c('retry', 83), ...c('callback', 20), ...c('followup', 3), ...c('checkout_abandoned', 2),
      ...c('fresh', 250),
    ]);
    expect(day.queue.length, 'a list a person can finish').toBeLessThanOrEqual(DAY_CEILING);
    expect(day.counts.given.rotation, 'and the silent base is reached again').toBeGreaterThan(0);
  });


  it('but a held retry still returns rather than let the day end short', () => {
    // The ceiling is a shape, not a starvation rule: with nothing else to
    // deal, held retries come back before a counsellor gets a 45-card day.
    const day = assembleDay([...c('retry', 83)], { openToday: new Set(), usedToday: {} });
    // Retries are capped at RETRY_CEILING and the rest are HELD; the backfill
    // that saves the day from being short still stops at DAY_FLOOR, because a
    // held card returning is a rescue, not the day's target.
    expect(day.queue.length).toBe(DAY_FLOOR);
  });

  it('an unreached retry is not dropped — it is simply held', () => {
    const day = assembleDay([...c('retry', 83)]);
    expect(day.counts.heldBack).toBeGreaterThan(0);
  });
});
