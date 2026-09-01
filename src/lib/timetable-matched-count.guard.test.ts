import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── "MATCHED" MEANS THE SAME THING ON BOTH SCREENS ───────────────────────────
 *
 * 1 Sep. The chapter layer (coaching-chapter.behaviour.test.ts) was added to
 * the admin OCR dashboard's count but not to the student's own confirm
 * screen. Same upload, two formulas:
 *
 *   admin:   blocks.filter(b => b.topic || b.chapter).length
 *   student: blocks.filter(b => b.topic).length
 *
 * A sheet with 6 precise topics and 3 chapter-only reads (e.g. "Algebra")
 * showed the student "6 matched to CareerRai topics" while the admin
 * dashboard logged 9/10 for that exact event. Two different numbers for one
 * fact is worse than either number alone — it reads as the app not knowing
 * its own state, which is the complaint that started this file.
 *
 * This pins the two formulas as ONE fact, following the pattern the rest of
 * this repo uses for a rule two files must not drift apart on: assert the
 * shape in both places rather than trust a comment to keep them in sync.
 *
 * Comments are stripped before matching, because this repo has repeatedly
 * shipped guards that matched their own explanatory prose.
 */

const ADMIN_ROUTE = join(__dirname, '..', 'app', 'api', 'timetable', 'parse', 'route.ts');
const STUDENT_COMPONENT = join(__dirname, '..', 'components', 'timetable-upload.tsx');

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** The exact predicate inside `.filter(...)` that counts a block as matched. */
const MAPPED_PREDICATE = /\.filter\(\s*\(?b\)?\s*=>\s*b\.topic\s*\|\|\s*b\.chapter\s*\)\.length/;

describe('a block counts as matched the SAME way on the admin and student screens', () => {
  it('the admin OCR dashboard counts topic OR chapter', () => {
    const code = codeOnly(readFileSync(ADMIN_ROUTE, 'utf8'));
    expect(
      MAPPED_PREDICATE.test(code),
      'admin route no longer counts b.topic || b.chapter as matched — update this guard '
      + 'if the definition is a deliberate change, and update the student screen to match',
    ).toBe(true);
  });

  it('the student confirm screen counts topic OR chapter — not topic alone', () => {
    const code = codeOnly(readFileSync(STUDENT_COMPONENT, 'utf8'));
    expect(
      MAPPED_PREDICATE.test(code),
      'the student screen counts a narrower set than the admin dashboard, so the same '
      + 'upload shows two different "matched" numbers to two different readers',
    ).toBe(true);
  });

  it('REGRESSION: topic-only was exactly the defect', () => {
    // Demonstrating what the bug looked like, so a future edit that narrows
    // the predicate back to `b.topic` alone fails obviously rather than
    // silently.
    const oldFormula = (blocks: { topic: string | null; chapter?: string | null }[]) =>
      blocks.filter((b) => b.topic).length;
    const newFormula = (blocks: { topic: string | null; chapter?: string | null }[]) =>
      blocks.filter((b) => b.topic || b.chapter).length;

    const sample = [
      { topic: 'Circles', chapter: null },
      { topic: null, chapter: 'Algebra' },
      { topic: null, chapter: 'Arithmetic' },
      { topic: null, chapter: null }, // a break — correctly unmatched either way
    ];
    expect(oldFormula(sample), 'the old formula undercounts chapter-only reads').toBe(1);
    expect(newFormula(sample)).toBe(3);
  });
});
