/**
 * ── The deck must let a counsellor cut and count her own day ───────────────
 *
 * Neelam, 16 Sep 2026, on WhatsApp. She found two defects in one message and
 * this guard holds both fixes shut.
 *
 * The one that must never come back: the tally counted a message, a skip and a
 * call as the same thing, so she capped herself at 40 that morning rather than
 * work a number she could not read.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DECK = join(__dirname, '..', 'components', 'call-deck.tsx');
const src = () => readFileSync(DECK, 'utf8');
const code = () =>
  src().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the session tally separates a call from a message', () => {
  it('the deck counts through the split tally, not one number', () => {
    const s = code();
    expect(s, 'the single `done` counter is what confused her').not.toMatch(/setDone\(/);
    expect(s).toContain('addToTally');
    expect(s).toContain('tallyLine(tally)');
  });

  it('the tally is fed the actual outcome, never a constant', () => {
    // If this ever becomes addToTally(t, 'called') the split is cosmetic.
    expect(code()).toMatch(/addToTally\(t, outcome\)/);
  });

  it('both the working deck and the cleared state show the split', () => {
    const s = code();
    expect(s.match(/tallyLine\(tally\)/g)?.length,
      'the empty state told her the same wrong number').toBeGreaterThanOrEqual(2);
  });
});

describe('the filter is real, and honest about its own size', () => {
  it('the deck renders the chips and filters what it shows', () => {
    const s = code();
    expect(s).toContain('DECK_FILTERS');
    expect(s).toContain('matchesDeckFilter');
    expect(s).toMatch(/setFilter\(/);
  });

  it('chip counts come from the whole day, not from the filtered view', () => {
    // A chip whose number shrank because another chip is active would be the
    // same lie as a ceiling that refills when a card is worked (Incident #72).
    const s = code();
    expect(s).toMatch(/deckFilterCounts\(list\)/);
    expect(s, 'counting the filtered view would make every chip agree with itself')
      .not.toMatch(/deckFilterCounts\(shown\)/);
  });

  it('filtering hides cards from the view and never from the day', () => {
    // `list` stays the day. A filter that removed cards would let a counsellor
    // finish a filter and believe she had finished the day.
    const s = code();
    expect(s).toMatch(/const shown = list\.filter/);
    expect(s, 'the still-to-mark count must stay the whole day').toMatch(/\{list\.length\} still to mark/);
  });

  it('an empty filter offers the way back rather than an empty screen', () => {
    const s = src();
    expect(s).toMatch(/Nothing in/);
    expect(code()).toMatch(/onClick=\{\(\) => setFilter\('all'\)\}/);
  });

  it('a chip with nothing behind it is not shown at all', () => {
    // An empty chip is a question a counsellor has to answer mid-dial.
    expect(code()).toMatch(/f === 'all' \|\| counts\[f\] > 0/);
  });
});

describe('it shows her work without becoming a quota', () => {
  it('no target, goal or quota reaches the screen', () => {
    // SALES-OS §0: a P5 number may never appear as a performance judgement, a
    // target, or an input to pay. "At least 40 daily" is the founder's
    // instruction to a person — the product must not enforce it on her screen.
    //
    // Scoped to the tally and filter header, and matching the words as WORDS:
    // `target="_blank"` and `e.target.value` are JSX, not something a
    // counsellor reads.
    const s = src();
    // Anchored on the header's own text: the FIRST `tallyLine` call is in the
    // cleared-day block further up, and slicing from there would sweep in half
    // the card markup.
    const header = s.slice(s.indexOf('still to mark'), s.indexOf('{SECTION_ORDER'));
    expect(header.length, 'the header moved — this assertion needs rewiring').toBeGreaterThan(100);
    for (const banned of [/\btargets?\b/i, /\bgoals?\b/i, /\bquotas?\b/i, /\bof 40\b/, /\/40\b/, /\d+\s*%/]) {
      expect(header, `a quota must never appear on a rep's deck: ${banned}`).not.toMatch(banned);
    }
  });

  it('and the tally line itself only ever names what happened', () => {
    const lib = readFileSync(join(__dirname, 'sales-deck-filter.ts'), 'utf8');
    const fn = lib.slice(lib.indexOf('export function tallyLine'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('called');
    expect(body).toContain('messaged');
    for (const banned of [/\btargets?\b/i, /\bgoals?\b/i, /\bquotas?\b/i, /\bremaining\b/i]) {
      expect(body, `${banned} turns a count into a judgement`).not.toMatch(banned);
    }
  });
});
