import { describe, it, expect } from 'vitest';
import { assembleDay, dayAnchorMs, istHour, SECTION_OF, SECTION_ORDER, type DaySection } from './sales-day';
import type { DueReason } from './call-queue';
import {
  DAY_FLOOR, DAY_CEILING, ROTATION_FLOOR, ATTENTION_CEILING, NEW_ARRIVAL_CEILING, ROTATION_CALL_EVERY,
  SHIFT_END_HOUR_IST,
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
  it('signals short of the floor: rotation fills up to the floor', () => {
    const day = assembleDay([...c('going_cold', 5), ...c('conversion', 5), ...c('fresh', 100)]);
    expect(day.queue).toHaveLength(DAY_FLOOR);
    expect(day.counts.given.rotation).toBe(DAY_FLOOR - 10);
  });

  it('signals near the floor: rotation still gets its floor, up to the ceiling', () => {
    const day = assembleDay([...c('going_cold', 45), ...c('fresh', 100)]);
    expect(day.queue).toHaveLength(45 + ROTATION_FLOOR);
    expect(day.counts.given.rotation).toBe(ROTATION_FLOOR);
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
  it('the ranked order is preserved: promises first, rotation last', () => {
    const day = assembleDay([...c('callback', 2), ...c('checkout_abandoned', 1), ...c('attention', 3), ...c('fresh', 60)]);
    const sections = day.queue.map((x) => x.section);
    const firstRotation = sections.indexOf('rotation');
    expect(sections.slice(0, 2)).toEqual(['promises', 'promises']);
    expect(sections[2]).toBe('money');
    expect(sections.slice(firstRotation).every((s) => s === 'rotation')).toBe(true);
  });

  it('attention is a message; every Nth rotation card is a call; everything else is a call', () => {
    const day = assembleDay([...c('callback', 1), ...c('attention', 2), ...c('going_cold', 1), ...c('fresh', 20)]);
    const by = (s: string) => day.queue.filter((x) => x.section === s);
    expect(by('promises').every((x) => x.channel === 'call')).toBe(true);
    expect(by('retention').every((x) => x.channel === 'call')).toBe(true);
    expect(by('attention').every((x) => x.channel === 'message')).toBe(true);
    const rot = by('rotation');
    rot.forEach((x, i) => expect(x.channel).toBe(i % ROTATION_CALL_EVERY === 0 ? 'call' : 'message'));
  });

  it('never contacted (fresh) comes before the long-silent (rotation) within the rotation section', () => {
    // The queue ranks them; assembleDay must not reorder.
    const cands = [...c('rotation', 3), ...c('fresh', 3)];
    const day = assembleDay(cands);
    expect(day.queue.map((x) => x.dueReason).slice(0, 3)).toEqual(['rotation', 'rotation', 'rotation']);
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
    // Morning: 50 rotation cards dealt. By evening 30 are marked and 20 remain
    // open. A rebuild must show those 20 — not 20 plus 30 replacements.
    const remaining = c('rotation', 20);
    const openToday = new Set(remaining.map((x) => x.studentId));
    const day = assembleDay([...remaining, ...c('rotation', 200)], {
      openToday, usedToday: { rotation: 50 },
    });
    expect(day.queue).toHaveLength(20);
    expect(day.queue.every((x) => openToday.has(x.studentId))).toBe(true);
  });

  it('rotation tops up only to the day-s target, counting what it already spent', () => {
    // 10 dealt this morning, 4 still open: the target is 50, so at most 40 new.
    const remaining = c('rotation', 4);
    const openToday = new Set(remaining.map((x) => x.studentId));
    const day = assembleDay([...remaining, ...c('rotation', 200)], {
      openToday, usedToday: { rotation: 10 },
    });
    expect(day.counts.given.rotation).toBe(4 + (DAY_FLOOR - 10));
  });

  it('a genuinely new SIGNAL still arrives mid-day — that is the point of the exception', () => {
    // A promise coming due at 6pm, on a rotation target already fully spent.
    const day = assembleDay([...c('callback', 1), ...c('rotation', 50)], {
      openToday: new Set(), usedToday: { rotation: DAY_FLOOR },
    });
    expect(day.counts.given.promises, 'a promise is never withheld').toBe(1);
    expect(day.counts.given.rotation, 'but rotation is done for today').toBe(0);
  });

  it('with no context it behaves exactly as before — nothing else changes', () => {
    const cands = [...c('going_cold', 5), ...c('rotation', 100)];
    expect(assembleDay(cands).queue).toHaveLength(DAY_FLOOR);
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
      openToday: new Set(), usedToday: { new: NEW_ARRIVAL_CEILING },
    });
    expect(day.counts.given.new).toBe(0);
  });

  it('the DAY ceiling counts the day: 65 dealt leaves room for 5', () => {
    const day = assembleDay([...c('going_cold', 40), ...c('rotation', 100)], {
      openToday: new Set(),
      usedToday: { attention: 20, new: 15, retention: 10, rotation: 20 },
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
      usedToday: { promises: 5, attention: 20, new: 15, rotation: ROTATION_FLOOR },
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
      openToday: new Set(), usedToday: { attention: 20, new: 15, retention: 15, rotation: 20 },
    });
    expect(day.counts.given.promises, 'never withheld').toBe(1);
    expect(day.counts.given.attention, 'but the lane is spent').toBe(0);
  });

  it('the backfill measures shortness on the whole day, not the screen', () => {
    // 60 cards dealt today, 55 of them worked. The day is not short; a
    // held-back card must not be pulled in to "fill" an empty-looking screen.
    const day = assembleDay([...c('attention', 40)], {
      openToday: new Set(), usedToday: { attention: ATTENTION_CEILING, new: 15, retention: 10, rotation: 15 },
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
    const used: Partial<Record<DaySection, number>> = {};
    const worked = new Set<string>();
    let open = new Set<string>();
    let dealt = 0;
    for (let round = 0; round < 12; round++) {
      const day = assembleDay(pool.filter((x) => !worked.has(x.studentId)), { openToday: open, usedToday: used });
      for (const card of day.queue) {
        if (!open.has(card.studentId)) {
          used[card.section] = (used[card.section] ?? 0) + 1;
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
