import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── LockedBuddyHub: visual pass only, on the app's most revenue-critical page ─
//
// 13 Aug: the hero restyled into the same dark treatment as S1/S3, to match
// the rest of tonight's work — this is the screen every free student sees on
// every visit to My Buddy, more than any onboarding screen.
//
// The one rule this guard exists to enforce: on THIS specific page, a visual
// change must never become a copy change. The fear/cost/promise wording is
// proven, tested marketing on the highest-stakes surface in the app — it does
// not get rewritten as a side effect of a colour pass.

const HUB = 'src/components/locked-buddy-hub.tsx';

describe('the hero is restyled, the words are untouched', () => {
  it('still renders both fear variants exactly as before', () => {
    const src = readFileSync(HUB, 'utf8');
    expect(src).toContain('The hardest part now isn’t studying.');
    expect(src).toContain('Not sure what to do next?');
  });

  it('still renders both cost variants exactly as before', () => {
    const src = readFileSync(HUB, 'utf8');
    expect(src).toContain('It’s not knowing if you’re wasting your one shot.');
    expect(src).toContain('Guessing your next move costs you weeks you don’t have.');
  });

  it('the "Only IIM buddies" line is unchanged', () => {
    const src = readFileSync(HUB, 'utf8');
    expect(src).toContain('to guide you.');
  });

  it('the urgency label and its data source are unchanged', () => {
    const src = readFileSync(HUB, 'utf8');
    expect(src).toContain('catUrgencyLabel()');
  });
});

describe('everything below the hero is untouched — proven, already-honest sections', () => {
  it('the buy buttons, zero-commission strip and recommended-buddy pool are all still wired', () => {
    const src = readFileSync(HUB, 'utf8');
    expect(src).toContain('<BuddyBuyButtons');
    expect(src).toContain('Zero commission');
    expect(src).toContain('<RecommendedBuddies');
    expect(src).toContain('<Testimonials');
  });

  it('social proof still gates on a real, non-trivial count — never shown for a tiny number', () => {
    const src = readFileSync(HUB, 'utf8');
    expect(src).toMatch(/proof\.mappedTotal >= 25/);
  });
});

describe('the person leads, the price follows (founder, 13 Aug)', () => {
  // He circled the S2 mentor-match mock: "proper professional, not like the
  // one currently live." The card itself was already professional — it was
  // below the fold, behind the price. What a free student saw was a poster
  // and a bill; the one thing that makes the bill credible is the person.
  it('the matched mentor renders BEFORE the buy buttons', () => {
    const src = readFileSync('src/components/locked-buddy-hub.tsx', 'utf8');
    const mentor = src.indexOf('<RecommendedBuddies');
    const buy = src.indexOf('<BuddyBuyButtons');
    expect(mentor, 'mentor card missing').toBeGreaterThan(-1);
    expect(mentor).toBeLessThan(buy);
  });

  it('and appears exactly once — moved, not duplicated', () => {
    const src = readFileSync('src/components/locked-buddy-hub.tsx', 'utf8');
    expect((src.match(/<RecommendedBuddies/g) ?? []).length).toBe(1);
  });
});
