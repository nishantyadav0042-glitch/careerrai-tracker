import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── RecommendedBuddies: the SECOND restyle pass, the one that actually fixes it ─
//
// The first restyle (13 Aug, earlier) only changed colour and kept the old
// avatar-left/text-right row. The founder kept pointing at the mock's S2
// panel and saying "still the old screen" — correctly, because this
// component is what /student/buddy (the tab he checks) actually renders, and
// its STRUCTURE still didn't match: the mock's card is centered — avatar top,
// name, journey pill, quote, stats grid — this was a horizontal row.
//
// This guard pins the structural fix, not just the colour: centered layout,
// same card shape as MentorPool (onboarding S2), same real fields.

const FILE = 'src/components/recommended-buddies.tsx';

describe('the card is now centered, matching the mock and MentorPool', () => {
  it('the avatar/name/journey block is vertically centered, not a horizontal row', () => {
    const src = readFileSync(FILE, 'utf8');
    expect(src).toContain('flex flex-col items-center text-center');
    // The old horizontal row must be gone.
    expect(src).not.toContain('flex items-start gap-3');
  });

  it('the journey pill uses the same dark-pill treatment MentorPool uses', () => {
    expect(readFileSync(FILE, 'utf8')).toContain('rounded-full bg-white/10 px-3.5 py-1');
  });

  it('carries the same three-stat USP grid every rich mentor card now shares', () => {
    const src = readFileSync(FILE, 'utf8');
    expect(src).toContain("['1-on-1', 'only yours']");
    expect(src).toContain("['Weekly', 'live call']");
    expect(src).toContain("['Daily', 'chat replies']");
  });
});

describe('every field is still real — structure changed, data did not', () => {
  it('the bio is still the mentor\'s own text, never invented', () => {
    const src = readFileSync(FILE, 'utf8');
    expect(src).toContain('b.how_i_work');
    expect(src).not.toMatch(/I was stuck at/);
  });

  it('the match reason still has its honest fallback for a data-thin fresh signup', () => {
    const src = readFileSync(FILE, 'utf8');
    // Literals updated 19 Aug. The INVARIANT is unchanged and is what this
    // asserts: the reason always falls back to something honest rather than
    // rendering blank for a data-thin fresh signup. What changed is the text —
    // the old fallback said "Verified N%ile IIM alumni mentor", and nothing was
    // verified (iim_verified_at is null for all eight buddies). It now states
    // the percentile, which is a real stored number, and lets iim-claim.ts
    // decide per mentor whether the institute may be named.
    expect(src).toContain('Cleared CAT at ${credential}');
    expect(src).toContain("'Handpicked by CareerRai'");
  });

  it('LinkedIn verification and the real buy CTA are both still wired', () => {
    const src = readFileSync(FILE, 'utf8');
    expect(src).toContain('b.linkedin_url');
    expect(src).toContain('<UnlockBuddyButton');
  });

  it('"Best match" still only marks the top-ranked buddy', () => {
    expect(readFileSync(FILE, 'utf8')).toContain('const isPick = i === 0');
  });
});
