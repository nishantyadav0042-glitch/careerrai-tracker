import { describe, it, expect } from 'vitest';
import { assembleDay, dayAnchorMs, SECTION_OF, SECTION_ORDER } from './sales-day';
import type { DueReason } from './call-queue';
import {
  DAY_FLOOR, DAY_CEILING, ROTATION_FLOOR, ATTENTION_CEILING, NEW_ARRIVAL_CEILING, ROTATION_CALL_EVERY,
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
      openToday, rotationUsedToday: 50,
    });
    expect(day.queue).toHaveLength(20);
    expect(day.queue.every((x) => openToday.has(x.studentId))).toBe(true);
  });

  it('rotation tops up only to the day-s target, counting what it already spent', () => {
    // 10 dealt this morning, 4 still open: the target is 50, so at most 40 new.
    const remaining = c('rotation', 4);
    const openToday = new Set(remaining.map((x) => x.studentId));
    const day = assembleDay([...remaining, ...c('rotation', 200)], {
      openToday, rotationUsedToday: 10,
    });
    expect(day.counts.given.rotation).toBe(4 + (DAY_FLOOR - 10));
  });

  it('a genuinely new SIGNAL still arrives mid-day — that is the point of the exception', () => {
    // A promise coming due at 6pm, on a rotation target already fully spent.
    const day = assembleDay([...c('callback', 1), ...c('rotation', 50)], {
      openToday: new Set(), rotationUsedToday: DAY_FLOOR,
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
