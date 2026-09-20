/**
 * ── A counsellor must be able to see her own day ───────────────────────────
 *
 * Neelam, 16 Sep 2026: *"mai msg krti hu to vhi total no. count hote h ese me
 * to mai confused ho re hu ki kitni call ki h kitni nhi"* and *"agar vha pr
 * not pick walo pr ya switch off pr filter lga skti to or ache se hota"*.
 *
 * She capped herself at 40 that morning because she could not tell a call from
 * a message in her own tally. Both defects were ours.
 */
import { describe, it, expect } from 'vitest';
import {
  DECK_FILTERS, DECK_FILTER_LABEL, matchesDeckFilter, deckFilterCounts,
  addToTally, tallyLine, EMPTY_TALLY, type FilterableLead,
} from './sales-deck-filter';
import { CALL_OUTCOMES } from './sales-disposition';

const lead = (over: Partial<FilterableLead>): FilterableLead =>
  ({ channel: 'call', noAnswerCount: 0, dueReason: 'rotation', ...over });

describe('the filter cuts the day the way she asked for', () => {
  it('finds the students who did not pick up', () => {
    // Her literal ask. Seventy cards, and she wanted these without reading all
    // seventy.
    const deck = [lead({ noAnswerCount: 3 }), lead({ noAnswerCount: 0 }), lead({ noAnswerCount: 1 })];
    expect(deck.filter((l) => matchesDeckFilter(l, 'no_answer'))).toHaveLength(2);
  });

  it('counts unanswered dials, not the lane the queue happened to assign', () => {
    // A `retry` lane expires and gets reassigned; an unanswered dial is a fact
    // about the student that survives tomorrow's deal.
    const notInRetryLane = lead({ noAnswerCount: 2, dueReason: 'fresh' });
    expect(matchesDeckFilter(notInRetryLane, 'no_answer')).toBe(true);
    const inRetryLaneButNeverDialled = lead({ noAnswerCount: 0, dueReason: 'retry' });
    expect(matchesDeckFilter(inRetryLaneButNeverDialled, 'no_answer')).toBe(false);
  });

  it('separates what to CALL from what to MESSAGE', () => {
    const deck = [lead({ channel: 'call' }), lead({ channel: 'message' }), lead({ channel: 'call' })];
    expect(deck.filter((l) => matchesDeckFilter(l, 'to_call'))).toHaveLength(2);
    expect(deck.filter((l) => matchesDeckFilter(l, 'to_message'))).toHaveLength(1);
  });

  it('finds the students nobody has ever spoken to', () => {
    expect(matchesDeckFilter(lead({ dueReason: 'fresh' }), 'never_called')).toBe(true);
    expect(matchesDeckFilter(lead({ dueReason: 'rotation' }), 'never_called')).toBe(false);
  });

  it('"All" hides nothing, ever', () => {
    const deck = [lead({}), lead({ channel: 'message' }), lead({ noAnswerCount: 9 })];
    expect(deck.filter((l) => matchesDeckFilter(l, 'all'))).toHaveLength(3);
  });

  it('every chip knows its own size', () => {
    const counts = deckFilterCounts([
      lead({ channel: 'call', dueReason: 'fresh' }),
      lead({ channel: 'message', noAnswerCount: 2 }),
      lead({ channel: 'call', noAnswerCount: 1 }),
    ]);
    expect(counts.all).toBe(3);
    expect(counts.to_call).toBe(2);
    expect(counts.to_message).toBe(1);
    expect(counts.no_answer).toBe(2);
    expect(counts.never_called).toBe(1);
  });

  it('is labelled in her words, not the database’s', () => {
    expect(DECK_FILTER_LABEL.no_answer).toBe("Didn't pick up");
    for (const f of DECK_FILTERS) expect(DECK_FILTER_LABEL[f].length).toBeGreaterThan(0);
  });
});

describe('the tally tells a call from a message', () => {
  it('a message never increments the call count', () => {
    // THE DEFECT, exactly: she messaged, the one number went up, and she could
    // not tell what she had done.
    let t = EMPTY_TALLY;
    t = addToTally(t, 'messaged');
    t = addToTally(t, 'messaged');
    expect(t.called).toBe(0);
    expect(t.messaged).toBe(2);
  });

  it('an unanswered dial IS a call', () => {
    // She picked up the phone and rang. Counting only connected calls would
    // tell a counsellor her hardest hours did not happen.
    expect(addToTally(EMPTY_TALLY, 'no_answer').called).toBe(1);
  });

  it('a skip is neither a call nor a message', () => {
    // A skip writes no lead state and starts no clock (lib/sales-disposition).
    // Folding it into either would let a day of skipping read as a day of work.
    const t = addToTally(EMPTY_TALLY, 'skipped');
    // `connected: 0` too: a skip is not a conversation, and the 20 Sep
    // connect count must never be reachable without speaking to anyone.
    expect(t).toEqual({ called: 0, messaged: 0, skipped: 1, connected: 0 });
  });

  it('every connected outcome counts as a call', () => {
    for (const o of CALL_OUTCOMES) {
      const t = addToTally(EMPTY_TALLY, o);
      const total = t.called + t.messaged + t.skipped;
      expect(total, `${o} must land in exactly one bucket`).toBe(1);
      if (o !== 'messaged' && o !== 'skipped') expect(t.called, `${o} is a call`).toBe(1);
      // `connected` rides ALONGSIDE called (20 Sep 2026) and must never be a
      // second bucket, or a connected call would count twice in the total.
      expect(t.connected, `${o} connected must not be its own bucket`).toBeLessThanOrEqual(t.called);
    }
  });

  it('the line names what happened and never a target', () => {
    // SALES-OS §0: a P5 number may never appear as a target or a quota. "At
    // least 40 daily" is an instruction to a person, not a thing the product
    // enforces on her screen.
    // RE-AFFIRMED 20 Sep 2026 against a founder instruction to show the
    // 50-connect target here. The count ships; the target does not. §0 names
    // "making call count a target" as the violation, and CONNECTED_OUTCOMES
    // includes `not_interested` and `dnd` — so a target on this screen pays a
    // rep to mark a ring-out as "not interested". lib/no-answer-contradiction
    // exists because ~15% of one rep's dispositions already did that with no
    // target present at all. The target lives on the founder's surface.
    const line = tallyLine({ called: 12, messaged: 3, skipped: 1, connected: 5 });
    expect(line).toContain('12 called');
    expect(line).toContain('3 messaged');
    expect(line).toContain('5 connected');
    expect(line).not.toMatch(/\b40\b|\b50\b|\/|target|goal|quota|%/i);
  });

  it('hides the skip count until there is one', () => {
    expect(tallyLine({ called: 5, messaged: 0, skipped: 0, connected: 2 })).toBe('2 connected · 5 called · 0 messaged');
  });
});
