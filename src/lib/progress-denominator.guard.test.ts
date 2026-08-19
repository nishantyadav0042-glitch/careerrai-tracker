import { describe, it, expect } from 'vitest';
import { TOPIC_METADATA, KNOWLEDGE_GRAPH } from '@/lib/topics-constants';
import { EXAM_UNIT_COUNT } from '@/lib/blueprint-builder';

// ── Every progress number counts the same 46 things ─────────────────────────
//
// Three separate universes exist in this codebase and all three are legitimate:
//
//   TOPIC_METADATA        the per-topic curated model -- hours, weightage,
//                         revision cadence. Drives the Home ring's completion %.
//   EXAM_UNIT_COUNT       the denominator the hours model is calibrated against
//                         (totalSyllabusHours / 46). Drives the finish date.
//   KNOWLEDGE_GRAPH       everything the app tracks, 53 units -- it also carries
//                         MOCKS and READING habit units, which the curated model
//                         deliberately does not estimate hours for.
//
// The first two must describe the SAME 46 exam units, or the student sees a
// completion percentage measured against one syllabus and a finish date
// measured against another. That is exactly what happened before the P0-C-A
// re-cut: onboarding fed the 53-unit graph into the 46-unit hours model and
// quoted 457h against a 397h syllabus -- a finish date 15 days late at 4h/day.
//
// This asserts SET EQUALITY, not just equal counts. Two 46-element sets with
// different members would still put a topic in one number and not the other,
// and a count check would pass while the surfaces disagreed.
//
// KNOWLEDGE_GRAPH is deliberately allowed to be wider: the coverage grid must
// let a student declare mock-prep and reading habits. What it must NOT do is
// leak into an hours or completion calculation.

const examUnits = () =>
  KNOWLEDGE_GRAPH.filter((s) => ['VARC', 'DILR', 'QA'].includes(s.id))
    .flatMap((s) => s.groups).flatMap((g) => g.units);
const allUnits = () => KNOWLEDGE_GRAPH.flatMap((s) => s.groups).flatMap((g) => g.units);

describe('one progress universe', () => {
  it('the curated model and the hours denominator count the same number', () => {
    expect(Object.keys(TOPIC_METADATA).length).toBe(EXAM_UNIT_COUNT);
  });

  it('the graph exam sections agree with the hours denominator', () => {
    expect(examUnits().length).toBe(EXAM_UNIT_COUNT);
  });

  it('they are the same units, not merely the same count', () => {
    const meta = new Set(Object.keys(TOPIC_METADATA));
    const exam = examUnits();
    expect(exam.filter((u) => !meta.has(u)), 'in the exam graph but absent from the curated model').toEqual([]);
    expect([...meta].filter((u) => !exam.includes(u)), 'in the curated model but not an exam unit').toEqual([]);
  });

  it('the full graph stays wider — the coverage grid needs the habit units', () => {
    expect(allUnits().length).toBeGreaterThan(EXAM_UNIT_COUNT);
    // And the extra units must be exactly the non-exam sections, not stray
    // exam topics that fell out of the curated model.
    const extra = allUnits().filter((u) => !examUnits().includes(u));
    const nonExam = KNOWLEDGE_GRAPH.filter((s) => !['VARC', 'DILR', 'QA'].includes(s.id))
      .flatMap((s) => s.groups).flatMap((g) => g.units);
    expect(extra.sort()).toEqual(nonExam.sort());
  });
});
