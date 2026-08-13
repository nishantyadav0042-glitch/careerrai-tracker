import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── One position card, not three (13 Aug) ───────────────────────────────────
//
// Home used to stack three separate black blocks: PositionStrip (streak +
// syllabus date + coverage% + hours-today), PaceCard (ring + pace verdict +
// week sparkline + finish date + reschedule) and ImportantDates (syllabus /
// mocks / revision anchors).
//
// Between them the finish date was printed THREE times, coverage% twice and
// the pace verdict twice. Founder: "combine all these 3 black screens into
// one very smartly or max 2, with minimal spaces… they don't deserve this
// much space."
//
// They merged into PaceCard rather than a new component so the reschedule
// flow — the only interactive part, and the most-tested — kept working
// untouched. This guard pins the merge: everything still shown, each fact
// said once, and the composition rule that made the strip safe in the first
// place (reuse Home's numbers, never recompute them) still holding.

const PAGE = 'src/app/student/tracker/page.tsx';
const CARD = 'src/components/home/pace-card.tsx';

describe('the position card composes — it never recomputes', () => {
  it('todayHours is read off the SAME hoursByDate map the sparkline uses', () => {
    expect(readFileSync(PAGE, 'utf8')).toContain('const todayHours = hoursByDate.get(todayStr)');
  });

  it('streak and shields come from the existing momentum object, not a new query', () => {
    const src = readFileSync(PAGE, 'utf8');
    expect(src).toContain('streak={currentStreak}');
    expect(src).toContain('shields={momentum.shields}');
  });

  it('no pace math lives in the card — it only renders what the engine returned', () => {
    const src = readFileSync(CARD, 'utf8');
    // The card may format and position numbers; it must never derive the
    // verdict itself. computeRequiredPace belongs to study-pace.ts.
    expect(src).not.toContain('function computeRequiredPace');
  });
});

describe('the three merged blocks are gone, and their content is not', () => {
  it('the two absorbed components no longer exist as separate cards', () => {
    const src = readFileSync(PAGE, 'utf8');
    expect(src).not.toMatch(/<PositionStrip/);
    expect(src).not.toMatch(/<ImportantDates/);
  });

  it('Home renders exactly ONE position card', () => {
    const src = readFileSync(PAGE, 'utf8');
    expect((src.match(/<PaceCard/g) ?? []).length).toBe(1);
  });

  it('every fact the old stack showed is still on screen', () => {
    const src = readFileSync(CARD, 'utf8');
    for (const shown of ['-day streak', 'h today', 'Covered', 'Syllabus ', 'Mocks ', 'Revision ', 'Reschedule']) {
      expect(src, `merged card dropped "${shown}"`).toContain(shown);
    }
  });

  it('the finish date is derived once, not formatted separately on the page', () => {
    // It used to be built into a `syllabusLabel` on the page AND formatted
    // inside the card — two derivations of one date, which is how three
    // copies of it ended up on screen.
    expect(readFileSync(PAGE, 'utf8')).not.toContain('const syllabusLabel');
  });

  it('the pace verdict chip appears once, not twice', () => {
    const src = readFileSync(CARD, 'utf8');
    expect((src.match(/\$\{tone\.chipBg\}/g) ?? []).length).toBe(1);
  });
});

describe('the client-boundary rule that caused the one production crash still holds', () => {
  it('TONE is imported from the plain module, never redeclared', () => {
    // A server component importing a named const from a 'use client' file
    // builds fine and resolves to undefined at runtime — that is what took
    // /student/tracker down for ~8 minutes. TONE lives in lib/pace-tone.ts.
    const src = readFileSync(CARD, 'utf8');
    expect(src).toContain("from '@/lib/pace-tone'");
    expect(src).not.toMatch(/^const TONE\s*[:=]/m);
  });
});
