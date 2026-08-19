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
    expect(s, 'an insight that vanishes on a timer cannot be read late').not.toMatch(/setTimeout/);
    expect(s).not.toMatch(/VISIBLE_MS/);
  });

  it('marks itself seen only on a deliberate dismiss, never on mount', () => {
    const s = code(CARD);
    expect(s, 'the seen key must be written exactly once, in the dismiss path').toMatch(/setItem/);
    // setItem must not sit inside a useEffect — that was the on-mount bug.
    expect(s).not.toMatch(/useEffect[\s\S]{0,400}setItem/);
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
