import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// ── The button must never hide below the fold. ──────────────────────────────
//
// Founder, 10 Aug: "There should be no error or blunder or duplication in
// onboarding — we have live ads going on. Every student should register and
// download our app smooth and fast, without any error."
//
// Ads pay per click. A click that lands on a screen whose ONLY way forward is
// off-screen is money spent on a dead end, and it is invisible in analytics:
// the student doesn't error, doesn't bounce loudly, they just stop.
//
// Measured on 10 Aug across Pixel 5 (360×740), iPhone SE (375×667) and
// iPhone 13, every /start decision screen pinned its primary button to the
// bottom of the viewport — except instant-insight, which ran 34–68px past the
// fold with its button loose in the scroll. That is the diagnosis screen: the
// moment the pitch lands, and the last thing between an ad click and the
// signup form.
//
// So: any funnel screen whose forward action is a full-width footer button must
// keep that button sticky. Screens that advance by tapping a CHOICE instead
// (need-check, target-date) have no footer button and are not listed.

const STICKY = /sticky\s+bottom-0/;

const FOOTER_CTA_SCREENS: { file: string; why: string }[] = [
  { file: 'src/app/start/screens/screen-dream-percentile.tsx', why: 'college list can run long' },
  { file: 'src/app/start/screens/screen-quick-facts.tsx', why: 'four questions, overflows a 667px phone' },
  { file: 'src/app/start/screens/screen-pain-points.tsx', why: 'six long options' },
  { file: 'src/app/start/screens/screen-instant-insight.tsx', why: 'THE pitch screen — regressed once, 10 Aug' },
  { file: 'src/app/start/screens/screen-login-build.tsx', why: 'the signup form itself' },
  { file: 'src/app/student/onboarding/screens/screen-topic-coverage.tsx', why: 'the tallest screen in the product' },
];

describe('every funnel screen keeps its forward button reachable', () => {
  for (const { file, why } of FOOTER_CTA_SCREENS) {
    it(`${file.split('/').pop()} pins its CTA (${why})`, () => {
      expect(readFileSync(file, 'utf8')).toMatch(STICKY);
    });
  }

  it('the diagnosis screen has exactly one forward button', () => {
    // Two "continue" controls on the pitch screen would be the duplication
    // blunder in its most expensive spot.
    const src = readFileSync('src/app/start/screens/screen-instant-insight.tsx', 'utf8');
    expect(src.match(/Build my plan around this/g)?.length ?? 0).toBe(1);
  });
});
