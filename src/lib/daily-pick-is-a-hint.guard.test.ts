import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── DAILY PICK SERVES A HINT, NEVER A QUESTION ─────────────────────────────
//
// Founder, 31 Aug: "currently just keep daily hint only in daily pick — remove
// all the questions."
//
// This is the third time the Daily Pick surface has been consolidated (12 Aug:
// don't run two engines; 13 Aug: one screen, not a surprise format; 21 Aug: one
// endpoint, not two). Each time the thing that crept back was a second kind of
// content appearing on the same screen. So the rule gets a guard rather than a
// comment: the timed challenge card must not be reachable from the Daily Pick
// tree, and the rotation must not carry a 'question' kind at all.
//
// Scoped to the four files that actually compose the surface. This does NOT
// forbid the challenge system from existing — daily_challenges, its table and
// its card are untouched and still hold 22 live rows. It forbids Daily Pick
// from rendering one.

const root = join(__dirname, '..');
const raw = (p: string) => readFileSync(join(root, p), 'utf8');

/**
 * Source with comments removed.
 *
 * Three times now a guard in this repo has failed on the EXPLANATION of the
 * rule it enforces — a comment saying "this must never call daily_challenges"
 * is itself a match for /daily_challenges/. A guard that cannot tell code from
 * prose reports the fix as the violation, so it strips block and line comments
 * first. String literals are left alone: a forbidden call written inside a
 * string is still worth catching.
 */
const read = (p: string) =>
  raw(p)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments, incl. JSDoc
    .replace(/(^|[^:])\/\/.*$/gm, '$1');  // line comments, sparing '://' in URLs

describe('the Daily Pick surface cannot serve a question', () => {
  it('the slot card does not import the timed challenge card', () => {
    const src = read('components/daily-slot-card.tsx');
    expect(src).not.toMatch(/import\s+\{[^}]*DailyChallengeCard[^}]*\}/);
    expect(src).not.toMatch(/<DailyChallengeCard\s*\/?>/);
  });

  it('the slot route never reads the challenge table', () => {
    const src = read('app/api/community/daily-slot/route.ts');
    expect(src).not.toContain('daily_challenges');
    expect(src).not.toContain('activeChallengeDate');
  });

  it("the rotation's kind union has no 'question' member", () => {
    const src = read('lib/os/daily-pick-rotation.ts');
    // The union members are the quoted kinds after `export type PickKind =`.
    const union = src.slice(src.indexOf('export type PickKind ='));
    const members = union.slice(0, union.indexOf(';'));
    expect(members).not.toMatch(/'question'/);
  });

  it('the promoter only ever stamps a tip', () => {
    const src = read('lib/daily-pick-runner.ts');
    expect(src).not.toMatch(/await stamp\([^)]*'question'\)/);
    expect(src).toMatch(/await stamp\(pick\.tip\.id, 'tip'\)/);
  });

  it('the day payload carries no question field for the client to render', () => {
    const src = read('app/api/community/insights/route.ts');
    expect(src).not.toMatch(/dailyPick:\s*\{[^}]*question:/);
  });
});

// ── THE RECYCLE STAMP MUST BE ABLE TO WRITE ────────────────────────────────
//
// The bug this locks down: the stamp guard was `.is('featured_on', null)`,
// true only for a NEVER-featured row. pickForKind deliberately returns a
// RECYCLED row once fresh stock is gone, and a recycled row has featured_on
// set — so the update matched zero rows and Daily Pick would have gone blank
// the day the shelf emptied. Live data made that imminent: 4 of 38 live tips
// had never been featured when this shipped.
//
// Asserted on the source because the predicate is a PostgREST filter string,
// not behaviour any in-process fake would reproduce faithfully.
describe('a recycled hint can still take the slot', () => {
  const src = read('lib/daily-pick-runner.ts');

  it('does not gate the stamp on featured_on being null', () => {
    expect(src).not.toMatch(/\.is\(\s*'featured_on'\s*,\s*null\s*\)/);
  });

  it('still refuses to restamp a row already featured today', () => {
    // First-writer-wins for TODAY is the concurrency property the old guard
    // was really there for, and it has to survive the fix.
    expect(src).toMatch(/featured_on\.lt\.\$\{today\}/);
  });

  it('does not use .neq, which would drop never-featured NULL rows', () => {
    // PostgREST .neq excludes NULLs — the same trap that nearly swept the App
    // Store reviewer out of premium on 30 Aug.
    expect(src).not.toMatch(/\.neq\(\s*'featured_on'/);
  });
});
