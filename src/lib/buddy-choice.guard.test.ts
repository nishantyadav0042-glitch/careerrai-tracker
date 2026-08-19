import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── A recommendation, plus the choice to look past it ──────────────────────
//
// Founder, 19 Aug: keep our recommendation, but let the student see the top 5
// and pick. CareerRai still does the matching and still says who it chose and
// why — what changes is that the student decides. Choosing the person you will
// admit being stuck to is not a thing to be assigned.
//
// The line this guard holds is the one that is easy to cross by accident:
// showing five equal profiles by default. That is a mentor directory, which is
// the category the founder explicitly does not want CareerRai to be read as.
// One recommendation, clearly labelled, with the door to the others visible.

const ROOT = process.cwd();
const code = (p: string) =>
  readFileSync(join(ROOT, p), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const MATCH = 'src/lib/buddy-match.ts';
const CARD = 'src/components/recommended-buddies.tsx';

describe('the buddy showcase offers five and recommends one', () => {
  it('returns five candidates, not four', () => {
    expect(code(MATCH)).toMatch(/\.slice\(0,\s*5\)/);
  });

  it('opens with a single profile, not a directory', () => {
    const s = code(CARD);
    expect(s, 'collapsed state must show exactly one').toMatch(/buddies\.slice\(0,\s*1\)/);
  });

  it('labels CareerRai’s pick so it stays identifiable when the list opens', () => {
    const s = code(CARD);
    expect(s).toMatch(/Recommended for you/);
    expect(s, 'the label must key off position, not be hard-coded on every card').toMatch(/isPick/);
  });

  it('offers the alternatives as a question, not a list control', () => {
    const s = code(CARD);
    expect(s).toMatch(/Want to explore other buddies\?/);
  });

  it('always answers "recommended for what?"', () => {
    // A student with no baseline yet still gets a reason rather than a blank.
    const s = code(CARD);
    expect(s).toMatch(/reasonText/);
    expect(s).toMatch(/b\.reason \?\?/);
  });

  it('never claims a credential has been verified', () => {
    const s = code(CARD);
    expect(s).not.toMatch(/verified[^.<>{}]{0,40}(iim|alumni|mentor)/i);
    // The institute is gated; the raw column must not be rendered directly.
    expect(s, 'route the institute through iim-claim.ts').not.toMatch(/\{b\.iim_converted\}/);
  });
});
