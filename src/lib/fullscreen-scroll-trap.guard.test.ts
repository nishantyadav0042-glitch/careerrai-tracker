import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── A full-screen overlay that cannot scroll is a dead end ──────────────────
//
// Founder, 13 Aug, testing his own signup on a laptop: "complete content is
// not visible, the content is cut… there is no button to move further from
// this page, I am stuck here."
//
// He was right, and it was not a styling problem. Each of these screens is a
// `position: fixed` layer covering the viewport. A fixed element does not
// scroll with the page, so without an explicit overflow rule anything past
// the fold is CLIPPED rather than merely below — the forward button included.
// The student is not inconvenienced, they are trapped, with no gesture that
// reveals the rest of the screen.
//
// Worse, each pairs `min-h-full` with `justify-center`. Centring content that
// is taller than its container pushes it off BOTH edges at once, so the top
// of the screen becomes unreachable too.
//
// The safe pairing, and what every screen here now uses:
//   fixed layer  → overflow-y-auto   (it can scroll)
//   inner column → min-h-full + justify-center
// Short content still centres; tall content grows past the viewport, centring
// quietly becomes a no-op, and the whole thing scrolls.
//
// These three are the full-screen white takeovers in the product — post
// signup, the notification ask, and the in-app-browser escape. The last is
// the worst place possible for a dead end: a student who cannot reach its
// button is stuck inside Instagram's webview with no route out of it.

const FULLSCREEN_TAKEOVERS = [
  { file: 'src/components/post-signup-sequence.tsx', why: 'the what-is-CareerRai step, one tap after signup' },
  { file: 'src/components/standalone-notif-ask.tsx', why: 'the notification permission ask' },
  { file: 'src/components/install/in-app-escape.tsx', why: 'the in-app-browser escape hatch' },
];

describe('full-screen overlays can always be scrolled', () => {
  for (const { file, why } of FULLSCREEN_TAKEOVERS) {
    it(`${file.split('/').pop()} can scroll (${why})`, () => {
      const src = readFileSync(file, 'utf8');
      // Find the fixed full-viewport layer and assert it declares an overflow
      // rule on the SAME element — a scroll rule on an inner div does not
      // help, because the clipping happens at the fixed layer.
      const fixedLayers = src.match(/className="fixed inset-0[^"]*"/g) ?? [];
      expect(fixedLayers.length, 'expected a fixed full-screen layer').toBeGreaterThan(0);
      const scrollable = fixedLayers.some((c) => c.includes('overflow-y-auto') || c.includes('overflow-auto'));
      expect(scrollable, `${file}: fixed full-screen layer has no overflow rule — content past the fold is unreachable`).toBe(true);
    });
  }
});

describe('the screen that introduces the product keeps its way forward reachable', () => {
  // The six-promises screen until 24 Sep; this screen replaced it.
  const SRC = 'src/components/what-careerrai-is.tsx';

  it('the CTA is sticky, like every other decision screen in the funnel', () => {
    // Same rule funnel-cta.guard.test.ts pins for /start. This screen is one
    // tap after signup and answers "what is CareerRai" — the single worst
    // place to make someone hunt for the button.
    expect(readFileSync(SRC, 'utf8')).toMatch(/sticky\s+bottom-0/);
  });

  it('says the division of labour once, in the student’s words', () => {
    // Founder, 24 Sep: the student must leave able to say "it decides what I
    // study today; I study from my own material; I tell it how much got done."
    const src = readFileSync(SRC, 'utf8');
    expect(src).toContain('You have the material.<br />CareerRai decides the work.');
    expect(src).toContain('CareerRai isn&apos;t a coaching app.');
    for (const step of ['CareerRai plans', 'You study', 'You mark it']) expect(src).toContain(`head: '${step}'`);
    // The two gestures, named exactly as the Home card names them.
    expect(src).toContain('Finished it or Got halfway');
    expect(src).toContain('Your daily plan is free.');
  });

  it('promises nothing the product does not do', () => {
    const copy = readFileSync(SRC, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    // Most tasks have no video; carry-over into tomorrow is not guaranteed.
    expect(copy).toContain('Some tasks also have a free video.');
    expect(copy).not.toMatch(/every task has|tomorrow/i);
    // The plan is sized per student, so no fixed daily load is stated.
    expect(copy).not.toMatch(/\b\d+\s*(h|hrs?|hours)\b/i);
  });
});
