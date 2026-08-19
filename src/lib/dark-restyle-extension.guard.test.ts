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

  it('none of the pace formula changed — same ring, same TONE import', () => {
    // The ring and the verdict are the pace engine's output; the restyle was
    // only ever allowed to change how they look.
    expect(src()).toContain('pace.completedPct');
    expect(src()).toContain('TONE[pace.status]');
    expect(src()).toContain("from '@/lib/pace-tone'");
  });

  it('the headline is no longer a second copy of the verdict', () => {
    // It used to branch on catchUpPerDay/aheadPerDay to say in words what the
    // chip beside it was already saying in words, over a repeat of the hours
    // printed one row above. Replaced 13 Aug — prep-gain.test.ts pins what
    // took its place.
    const src_ = src();
    expect(src_).not.toContain('pace.catchUpPerDay > 0');
    expect(src_).not.toContain('pace.aheadPerDay > 0');
  });
});

// ImportantDates was merged into the position card on 13 Aug — its three
// anchors (syllabus / mocks / revision) now render inside PaceCard, which
// position-strip.guard.test.ts pins. Nothing to assert about a file that no
// longer exists; deleting the block beats leaving a test that reads a
// component Home stopped rendering.

// LockedBuddyHub was retired from /student/buddy on 14 Aug, when the founder
// cut that screen to three blocks ("your weakness, one person, one price").
// The route renders BuddyConversionScreen, and session-booking.guard.test.ts
// asserts the hub is NOT rendered there — so this block was pinning the
// wording of a component no student could reach. Deleted in the same commit as
// the component, for the same reason the ImportantDates block above was: a
// guard over dead code is what makes the code look load-bearing.

describe('RecommendedBuddies — real data, real ranking, only the card is dark', () => {
  const src = () => readFileSync('src/components/recommended-buddies.tsx', 'utf8');

  it('still shows the real match reason and the honest fallback for a fresh signup', () => {
    const s = src();
    // Literals updated 19 Aug. The INVARIANT is unchanged and is what this
    // asserts: the reason always falls back to something honest rather than
    // rendering blank for a data-thin fresh signup. What changed is the text —
    // the old fallback said "Verified N%ile IIM alumni mentor", and nothing was
    // verified (iim_verified_at is null for all eight buddies). It now states
    // the percentile, which is a real stored number, and lets iim-claim.ts
    // decide per mentor whether the institute may be named.
    expect(s).toContain('Cleared CAT at ${credential}');
    expect(s).toContain("'Handpicked by CareerRai'");
  });

  it('"Best match" still marks only the top-ranked buddy, never invented for the rest', () => {
    expect(src()).toContain('const isPick = i === 0');
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
