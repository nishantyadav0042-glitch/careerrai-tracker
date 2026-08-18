import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { remainingPrepHours, EXAM_UNIT_COUNT } from './blueprint-builder';
import { totalSyllabusHours } from './prep-model';
import { EXAM_SYLLABUS_TOPICS, MOCK_PREP_UNITS, READING_HABIT_UNITS } from './topics-constants';

// ── P0-C-A — THE HOURS MODEL IS ONLY EVER FED ITS OWN DOMAIN ────────────────
//
// Founder decision, 18 Aug, after the P0-C audit:
//
//   "Multiplying the 46-unit calibrated rate by 53 invents ~60 hours.
//    Correct the onboarding/hours calculation to use the canonical exam
//    syllabus unit count = 46. Do not blindly replace every occurrence of 53
//    with 46 — only the specific calculation whose domain has been proven to
//    be the exam syllabus."
//
// THE DEFECT, proven by the audit:
//   blueprint-builder.ts:121  AVG_UNIT_HOURS = totalSyllabusHours() / EXAM_UNIT_COUNT
// defines a rate of hours PER EXAM UNIT — 397h ÷ 46 = 8.63h — and
// prep-model.ts:86 states that 397h is "the whole syllabus from zero, mocks
// excluded". Not one of the 7 habit units carries an estimatedHours value.
// The onboarding screen then handed that rate a count of 53, charging seven
// units the model had explicitly declined to estimate: 457h against a 397h
// syllabus, and finish dates 8–15 days later than the model implies.
//
// This is the same bug class the file's own header (lines 111-119) records
// fixing once before — the "3.8h/day promised, 6.6h/day demanded" blunder.
// That fix made the rate derive from one model. Nobody checked the count it
// multiplies. So this guard pins the DOMAIN, not the arithmetic.

const AVG_UNIT_HOURS = totalSyllabusHours() / EXAM_UNIT_COUNT;

describe('the hours model receives only exam syllabus units', () => {
  it('prices a fresh student at the real syllabus, not the graph', () => {
    // Nothing declared: every exam unit is untouched, REMAINING_FRACTION 1.0.
    const hours = remainingPrepHours({ exam_syllabus_unit_count: EXAM_UNIT_COUNT });
    expect(Math.round(hours)).toBe(Math.round(totalSyllabusHours())); // 397, not 457
  });

  it('refuses to price more units than the syllabus contains', () => {
    // The defensive half: even if a future caller hands it a graph-sized
    // count, the model may not invent hours for units it never measured.
    const inflated = remainingPrepHours({ exam_syllabus_unit_count: 53 });
    const correct = remainingPrepHours({ exam_syllabus_unit_count: EXAM_UNIT_COUNT });
    expect(Math.round(inflated)).toBe(Math.round(correct));
  });

  it('the 60-hour inflation is gone', () => {
    const inflated = 53 * AVG_UNIT_HOURS;
    const correct = remainingPrepHours({ exam_syllabus_unit_count: 53 });
    expect(inflated - correct).toBeGreaterThan(55); // the invented hours…
    expect(Math.round(correct)).toBe(397);          // …are no longer charged
  });

  it('still honours a genuinely smaller declared count', () => {
    // Clamping must be a ceiling, never a floor: a student who has declared
    // only part of the grid is not silently promoted to the full syllabus.
    const partial = remainingPrepHours({ exam_syllabus_unit_count: 20 });
    expect(partial).toBeLessThan(remainingPrepHours({ exam_syllabus_unit_count: EXAM_UNIT_COUNT }));
  });
});

describe('the producer counts exam units, not graph nodes', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/app/student/onboarding/screens/screen-topic-coverage.tsx'), 'utf8'
  );

  it('never sends matrix.length as the hours-model count', () => {
    // matrix is built from KNOWLEDGE_GRAPH (53). Its length is the size of the
    // GRAPH, and was being read downstream as the size of the SYLLABUS.
    expect(src).not.toMatch(/exam_syllabus_unit_count:\s*matrix\.length/);
  });

  it('scopes the whole declared triple to exam units', () => {
    // coverage_practicing and coverage_learning were counted over the same
    // 53-row matrix, so a habit unit marked 'practicing' inflated them too.
    // All three counts must range over the same set as the denominator.
    expect(src).toContain('isExamSyllabusTopic');
  });
});

describe('the two sets stay distinct', () => {
  it('no habit unit is an exam unit', () => {
    for (const u of [...MOCK_PREP_UNITS, ...READING_HABIT_UNITS]) {
      expect(EXAM_SYLLABUS_TOPICS).not.toContain(u);
    }
  });

  it('the exam set is exactly the model\'s domain', () => {
    expect(EXAM_SYLLABUS_TOPICS.length).toBe(EXAM_UNIT_COUNT);
  });
});
