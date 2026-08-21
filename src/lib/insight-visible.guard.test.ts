import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── The daily insight has to be possible to see ────────────────────────────
//
// Built as a "passing cloud": drift in at the bottom of Home, stay 7 seconds,
// remove itself. The founder only ever noticed it by accident. Four causes,
// and the last two are the ones that made it invisible while every metric said
// it had been delivered:
//
//   1. bg-white/95 on a white Home — no contrast.
//   2. fixed bottom-20 — below where attention is.
//   3. auto-removed after 7 seconds.
//   4. it wrote its once-per-day "seen" key ON MOUNT, so a student who looked
//      away for eight seconds was marked as having read it and never got that
//      day's insight back.
//
// This guard holds the fix in place. It is deliberately about BEHAVIOUR
// (persistent, dismiss-to-mark, in-flow, contrasting) rather than an exact
// colour, so the design can change without the defect returning.

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CARD = 'src/components/home/insight-bubble.tsx';
const HOME = 'src/app/student/tracker/page.tsx';

describe('the daily insight is visible', () => {
  it('does not remove itself on a timer', () => {
    const s = code(CARD);
    // Sharpened 22 Aug. This banned setTimeout outright, which was the right
    // instinct for the original bug (the card removed ITSELF after 7 seconds,
    // so an insight could be invisible while every metric said delivered) but
    // the wrong test: the entrance animation now uses a timer to START the
    // card's slide in, which removes nothing. The invariant is that no timer
    // ever DISMISSES or hides it — so that is what this asserts.
    expect(s).not.toMatch(/VISIBLE_MS/);
    expect(s, 'no timer may dismiss the card').not.toMatch(/setTimeout\([^)]*(setDismissed|dismiss\(|setHidden)/);
    // Any timer that survives must only drive the entrance.
    for (const m of s.matchAll(/setTimeout\(\s*\(\)\s*=>\s*(\w+)/g)) {
      expect(['setEntered'], `setTimeout drives ${m[1]}, which is not the entrance`).toContain(m[1]);
    }
  });

  it('marks itself seen only on a deliberate dismiss, never on mount', () => {
    const s = code(CARD);
    expect(s, 'the seen key must be written exactly once, in the dismiss path').toMatch(/setItem/);
    // Sharpened 22 Aug: the invariant is about the SEEN key specifically. The
    // entrance also persists a key — animKey — so the same insight does not
    // re-animate on every app open. That write says "this already made its
    // entrance", never "this was read", so it does not resurrect the original
    // defect (marking an insight read before the student looked at it).
    // The first version of this assertion was a 400-character proximity check
    // ("no setItem near a useEffect"), which tripped the moment an unrelated
    // effect was added ABOVE the dismiss handler -- flagging code where the
    // invariant still held. Test the invariant itself instead: every setItem
    // in the file must be inside the dismiss function, and the effect bodies
    // must contain none.
    const effects = [...s.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\}, \[/g)];
    for (const m of effects) {
      // The SEEN key, precisely — an effect may persist the animation key.
      expect(m[1], 'no effect body may mark the insight as seen').not.toMatch(/setItem\(seenKey\(\)/);
    }
    // Positional, not slice-based: the old end-marker was the string
    // "return (", which the entrance effect's cleanup ("return () =>
    // clearTimeout") now matches earlier in the file, silently emptying the
    // slice. Assert the invariant directly instead — every write of the SEEN
    // key sits after the dismiss handler opens.
    const dismissAt = s.indexOf('function dismiss');
    expect(dismissAt, 'there must be a dismiss handler').toBeGreaterThan(-1);
    const seenWrites = [...s.matchAll(/setItem\(seenKey\(\)/g)].map((m) => m.index ?? -1);
    expect(seenWrites.length, 'the seen key is written exactly once').toBe(1);
    expect(seenWrites[0], 'the dismiss handler is the only writer').toBeGreaterThan(dismissAt);
  });

  it('sits in the page flow, not pinned to the bottom of the viewport', () => {
    const s = code(CARD);
    expect(s, 'a floating toast at the bottom is what nobody saw').not.toMatch(/fixed\s+bottom-/);
  });

  it('does not render white on a white home', () => {
    const s = code(CARD);
    expect(s, 'the card needs its own surface colour').not.toMatch(/bg-white(\/\d+)?[\s"']/);
  });

  it('is mounted above the plan on Home', () => {
    const home = code(HOME);
    const insightAt = home.indexOf('<InsightBubble');
    const paceAt = home.indexOf('<PaceCard');
    expect(insightAt, 'InsightBubble must be mounted on Home').toBeGreaterThan(-1);
    expect(paceAt).toBeGreaterThan(-1);
    expect(insightAt, 'the insight opens the screen, above the plan').toBeLessThan(paceAt);
  });

  it('is not red — most insights are neutral or positive', () => {
    // J2 retired the red burnout/sleep flags after the sleep one fired 26 times
    // at students who had logged nothing. Red here would re-teach that lesson.
    const s = code(CARD);
    expect(s).not.toMatch(/\bbg-red-|\btext-red-|\bborder-red-/);
  });
});
