// ── The coverage grid opens where the student said it hurts ─────────────────
//
// 22 Aug, reported by a student in the pre-auth funnel: "I am clicking on QA
// and VARC, it's coming DILR."
//
// She was right, and it was not a glitch. /start asked "Which section costs
// you the most marks?", she answered, and the very next screen — the coverage
// grid — opened on DILR because the order was the constant
// ['DILR','VARC','QA','MOCKS','READING']. Whatever she tapped, DILR came next.
// Deterministic, and it hit every student in that funnel.
//
// The constant was not wrong when it was written: it predates the
// weakest-section question, which was inserted in front of it on 15 Aug. What
// the insertion created was a product that asks a question and then visibly
// ignores the answer — the worst possible first impression for an app whose
// entire pitch is "we know something about your preparation".
//
// The post-login modal had the same contradiction more quietly: it passed no
// order at all, so it always opened on VARC.
//
// So the order is now derived, not declared. The section the student names
// leads, the other exam sections follow in their stable order, and the habit
// tracks (mocks, reading) stay last because they are the tail of the flow
// rather than a section of the syllabus.

import type { CoverageSectionId } from '@/lib/topics-constants';

/** The three exam sections, in the order they are used as a tie-break once
 *  the student's own answer has taken first place. */
const EXAM_SECTIONS: CoverageSectionId[] = ['VARC', 'DILR', 'QA'];
/** Habit tracks always close the flow — they are not syllabus sections. */
const HABIT_SECTIONS: CoverageSectionId[] = ['MOCKS', 'READING'];

export function isExamSection(value: unknown): value is CoverageSectionId {
  return value === 'VARC' || value === 'DILR' || value === 'QA';
}

/**
 * Coverage order for a student who named `weakest` as their weakest section.
 *
 * A null/unknown answer keeps the stable exam order rather than inventing a
 * preference — the screen makes the question mandatory, so this is a fallback
 * for legacy drafts, not a path anyone should reach by tapping.
 */
export function coverageOrderFor(weakest: unknown): CoverageSectionId[] {
  if (!isExamSection(weakest)) return [...EXAM_SECTIONS, ...HABIT_SECTIONS];
  return [weakest, ...EXAM_SECTIONS.filter((s) => s !== weakest), ...HABIT_SECTIONS];
}

/**
 * Draft key for the coverage grid, scoped to the order it was built with.
 *
 * The grid persists a stepIdx, and stepIdx only means anything relative to an
 * order. If a student goes back and changes their answer, resuming the old
 * draft would drop them at a step belonging to the previous sequence — which
 * is the same class of bug the funnel's own v8/v9 draft bumps exist for.
 * Making the key carry the answer retires that whole failure mode.
 */
export function coverageDraftKey(scope: string, weakest: unknown): string {
  const lead = isExamSection(weakest) ? weakest : 'none';
  return `cr_coverage_v4_${scope}_${lead}`;
}
