import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── Extending the dark treatment past the hero — copy and data are frozen ───
//
// Founder, 13 Aug: the hero restyle wasn't enough — extend the same dark
// language to the rest of both screens (PaceCard, ImportantDates, the
// comparison cards and buddy showcase on My Buddy).
//
// Same discipline as the hero restyle: every one of these is a visual pass
// only. No pace math touched, no ranking touched, no copy touched. The
// highest-risk element on Home — TodaysRoutineCard, the actual interactive
// task list, and the thing that caused tonight's one production crash — was
// deliberately left alone rather than reskinned under time pressure.

describe('PaceCard — the ring and pace math are untouched, only the shell', () => {
  const src = () => readFileSync('src/components/home/pace-card.tsx', 'utf8');

  it('the collapsed card is now dark', () => {
    // Padding tightened 13 Aug when the card was compacted (p-3 → px-3 py-2),
    // so this asserts the dark treatment rather than an exact spacing value —
    // spacing is design, darkness is the thing this guard exists for.
    expect(src()).toMatch(/rounded-2xl bg-stone-900 px?-\d[^"]*text-white/);
  });

  it('the reschedule editing panel stays on its own light, readable surface', () => {
    // Native date inputs and +/- steppers on an unverified dark background is
    // exactly the class of regression PositionStrip already proved out
    // tonight. The edit flow keeps a real white card rather than guessing.
    expect(src()).toContain('rounded-xl border border-white/10 bg-white p-3 text-stone-900');
  });

  it('none of the pace formula changed — same headline logic, same TONE import', () => {
    expect(src()).toContain('pace.catchUpPerDay > 0');
    expect(src()).toContain('pace.aheadPerDay > 0');
    expect(src()).toContain("from '@/lib/pace-tone'");
  });
});

// ImportantDates was merged into the position card on 13 Aug — its three
// anchors (syllabus / mocks / revision) now render inside PaceCard, which
// position-strip.guard.test.ts pins. Nothing to assert about a file that no
// longer exists; deleting the block beats leaving a test that reads a
// component Home stopped rendering.

describe('LockedBuddyHub — the comparison cards are dark, the wedge copy is frozen', () => {
  const src = () => readFileSync('src/components/locked-buddy-hub.tsx', 'utf8');

  it('the "right now vs with buddy" pair is unchanged in wording', () => {
    expect(src()).toContain('Should I give another mock? Should I revise Algebra? Am I even improving?');
    expect(src()).toContain('You know exactly what to do today. And tomorrow. All the way to CAT.');
  });

  it('the coaching-batch-vs-buddy wedge is unchanged in wording', () => {
    const s = src();
    expect(s).toContain('200 students, 1 teacher');
    expect(s).toContain('Same plan for everyone');
    expect(s).toContain('No one reviews your prep');
    expect(s).toContain('Just you, 1-on-1');
    expect(s).toContain('Plan built for you');
    expect(s).toContain('Prep reviewed weekly');
  });

  it('both sections now use the dark card language', () => {
    const s = src();
    // At least the hero plus these two sections — four dark cards total.
    expect((s.match(/bg-stone-900/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('RecommendedBuddies — real data, real ranking, only the card is dark', () => {
  const src = () => readFileSync('src/components/recommended-buddies.tsx', 'utf8');

  it('still shows the real match reason and the honest fallback for a fresh signup', () => {
    const s = src();
    expect(s).toContain('Verified ${Number(b.cat_percentile)}%ile IIM alumni mentor');
    expect(s).toContain("'Handpicked IIM alumni mentor'");
  });

  it('"Best match" still marks only the top-ranked buddy, never invented for the rest', () => {
    expect(src()).toContain('i === 0 &&');
  });

  it('LinkedIn verification link is still real and still opt-in per buddy', () => {
    expect(src()).toContain('b.linkedin_url');
    expect(src()).toContain('Verify on LinkedIn');
  });

  it('the card itself is dark', () => {
    // Padding went from p-4 to p-5 in the follow-up structural fix (13 Aug) —
    // see recommended-buddies-structural-fix.guard.test.ts for that pass.
    // This test only needs to know the card is still dark.
    expect(src()).toContain('bg-stone-900');
  });
});
