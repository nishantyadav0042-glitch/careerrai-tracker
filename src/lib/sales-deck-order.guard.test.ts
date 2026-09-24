import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { assembleDay, SECTION_ORDER, SECTION_OF, SECTION_LABEL, orderForScreen, pinnedIntroIds, type DaySection } from './sales-day';
import { FRESH_PIN_PER_DAY } from './os/scale-config';
import type { DueReason } from './call-queue';

// ── INCIDENT #91: THE PIN THAT NEVER REACHED THE SCREEN ─────────────────────
//
// From 15 Sep 2026 the day "opened with never-contacted students at the top".
// It did not. `pinFreshToFront` moved them to the front of the queue ARRAY,
// and `call-deck.tsx` groups the day by `section` and renders the groups in
// SECTION_ORDER — so a pinned card, still carrying `section: 'rotation'`,
// rendered in the LAST group, exactly where it would have been unpinned.
//
// Production over those thirty days: 370 fresh cards dealt, 84 worked (23%).
// On 16 Sep, 43 dealt and 0 worked, while retry — rendered second — ran at
// 78% worked and 1.4% interested.
//
// The class of defect: a correct change made at a layer the product does not
// read. These tests bind the two layers together so the next change to either
// one cannot silently lose the other.

const c = (dueReason: DueReason, n: number, tag: string = dueReason) =>
  Array.from({ length: n }, (_, i) => ({ studentId: `${tag}-${i}`, dueReason }));

describe('the order the counsellor actually reads', () => {
  it('is SECTION_ORDER, and the stored queue is in that order too', () => {
    // The two layers agreeing IS the fix. Until 16 Sep the deck was stored in
    // sort order and rendered in section order, so `sales_opportunity.rank`
    // could not answer "what did the counsellor see first?" for any card.
    const deck = readFileSync('src/components/call-deck.tsx', 'utf8');
    expect(deck, 'the screen groups by section').toMatch(/bySection/);
    expect(deck, 'and renders the groups in SECTION_ORDER').toMatch(/SECTION_ORDER\.filter/);

    const day = assembleDay([
      ...c('rotation', 3), ...c('retry', 3), ...c('callback', 2), ...c('fresh', 3), ...c('restart', 2),
    ]);
    const at = (s: DaySection) => SECTION_ORDER.indexOf(s);
    const seen = day.queue.map((x) => at(x.section));
    expect(seen, 'the stored queue never goes backwards through SECTION_ORDER')
      .toEqual([...seen].sort((a, b) => a - b));
  });

  it('every section has a place in the order and a label — no card renders nowhere', () => {
    // call-deck.tsx drops any group whose key is missing from SECTION_ORDER.
    // A new DueReason mapped to a section nobody listed would vanish from the
    // screen while still counting in the day — silence that looks like work.
    for (const section of Object.values(SECTION_OF)) {
      expect(SECTION_ORDER, `${section} must render somewhere`).toContain(section);
      expect(SECTION_LABEL[section], `${section} needs a heading`).toBeTruthy();
    }
    expect(new Set(SECTION_ORDER).size, 'no duplicate sections').toBe(SECTION_ORDER.length);
  });

  it('the pinned never-contacted block is a SECTION, second only to promises', () => {
    // The whole of Incident #91 in one assertion: pinning must change what the
    // card IS, not only where it sits in an array.
    // Founder, 24 Sep 2026: log breakers are first, and the daily loggers'
    // feedback calls sit between the promises and the intro block. The pin
    // still sits above every other discretionary section.
    expect(SECTION_ORDER.slice(0, 4)).toEqual(['logbreakers', 'promises', 'champions', 'intro']);

    const day = assembleDay([...c('callback', 2), ...c('retry', 10), ...c('fresh', 40)]);
    const intro = day.queue.filter((x) => x.section === 'intro');
    expect(intro, 'the block is dealt at its configured size').toHaveLength(FRESH_PIN_PER_DAY);
    expect(intro.every((x) => x.dueReason === 'fresh'), 'only never-contacted are lifted').toBe(true);
    expect(intro.every((x) => x.channel === 'call'), 'an introduction is a conversation, not a template').toBe(true);

    // And it reaches the screen ahead of the re-dials, which is the point.
    const firstIntro = day.queue.findIndex((x) => x.section === 'intro');
    const firstRedial = day.queue.findIndex((x) => x.section === 'redial');
    expect(firstIntro).toBeGreaterThan(-1);
    expect(firstIntro, 'a first conversation outranks a re-dial').toBeLessThan(firstRedial);
  });

  it('counts the intro block under intro — the card and its count come from one decision', () => {
    // admin-filters doctrine: the number on the chip and the list behind it are
    // the same function. A pinned card counted as `rotation` while rendering as
    // `intro` would put a wrong number on a correct list.
    const day = assembleDay([...c('fresh', 40)]);
    expect(day.counts.given.intro).toBe(FRESH_PIN_PER_DAY);
    for (const s of SECTION_ORDER) {
      expect(day.queue.filter((x) => x.section === s), `${s} count matches its cards`)
        .toHaveLength(day.counts.given[s]);
    }
  });

  it('restart — the founder’s first priority — renders above attention and retry', () => {
    // Founder, 15 Sep: students who logged on more than one day are the first
    // call of the day. On 16 Sep both books were dealt 21 restart cards
    // between them and worked zero, because `retention` rendered sixth of
    // seven, under `attention`, and `retry` rendered second.
    const at = (s: DaySection) => SECTION_ORDER.indexOf(s);
    expect(at(SECTION_OF.restart)).toBeLessThan(at(SECTION_OF.attention));
    expect(at(SECTION_OF.restart)).toBeLessThan(at(SECTION_OF.retry));
    expect(at(SECTION_OF.restart)).toBeLessThan(at(SECTION_OF.new_never_logged));
  });

  it('a re-dial is not filed with the promises', () => {
    expect(SECTION_OF.retry).toBe('redial');
    expect(SECTION_OF.callback).toBe('promises');
    expect(SECTION_OF.followup).toBe('promises');
    const day = assembleDay([...c('retry', 5), ...c('callback', 2)]);
    expect(day.counts.given.promises, 'callbacks only').toBe(2);
    expect(day.counts.given.redial).toBe(5);
  });

  it('re-grouping is stable: it never re-ranks inside a section', () => {
    // "Filter, never re-sort" still holds. orderForScreen groups; the queue's
    // own sort still decides who is first among the promises.
    const q = [
      { studentId: 'a', section: 'rotation' as DaySection },
      { studentId: 'b', section: 'promises' as DaySection },
      { studentId: 'c', section: 'rotation' as DaySection },
      { studentId: 'd', section: 'promises' as DaySection },
    ];
    expect(orderForScreen(q).map((x) => x.studentId)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('pins off the queue’s own order, and pins nothing when the block is zero', () => {
    const day = [...c('fresh', 3, 'early'), ...c('rotation', 2), ...c('fresh', 3, 'late')];
    expect([...pinnedIntroIds(day, 2)], 'the queue decides WHICH, the pin only how many')
      .toEqual(['early-0', 'early-1']);
    expect(pinnedIntroIds(day, 0).size).toBe(0);
  });
});
