import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { remainingPrepHours, EXAM_UNIT_COUNT } from '@/lib/blueprint-builder';
import { KNOWLEDGE_GRAPH } from '@/lib/topics-constants';

// ── The hours model is fed only its own domain ─────────────────────────────
//
// AVG_UNIT_HOURS is totalSyllabusHours() / EXAM_UNIT_COUNT -- 397h over the 46
// EXAM units (VARC 9 + DILR 9 + QA 28). The KNOWLEDGE_GRAPH has 53, because it
// also carries MOCKS and READING habit units that the curated per-topic model
// deliberately does NOT estimate hours for.
//
// Onboarding passed `coverage_total: matrix.length` -- the full 53 -- into that
// per-exam-unit model. Measured on current main before the fix: a fresh student
// was quoted 457h against a 397h syllabus, 60 phantom hours, which at 4h/day is
// a finish date FIFTEEN DAYS late (20 days at 3h/day, 10 at 6h/day). Quoted at
// onboarding, the moment activation depends on.
//
// This is a units error, not a product choice: there is exactly one right
// denominator for a per-exam-unit constant. The separate and genuinely
// product-shaped question -- whether the student's coverage BADGE should read
// "of 46" or "of 53" -- is deliberately untouched here, which is why the fix is
// an additive exam-scoped triple rather than a redefinition of coverage_total.
//
// Found by re-cutting the parked P0-C-A, which diagnosed the same defect on
// 18 Aug and never merged.

const ROOT = process.cwd();
const examUnits = () =>
  KNOWLEDGE_GRAPH.filter((s) => ['VARC', 'DILR', 'QA'].includes(s.id))
    .flatMap((s) => s.groups).flatMap((g) => g.units);
const allUnits = () => KNOWLEDGE_GRAPH.flatMap((s) => s.groups).flatMap((g) => g.units);

describe('the hours model only ever sees exam units', () => {
  it('EXAM_UNIT_COUNT matches the graph it claims to count', () => {
    expect(examUnits().length).toBe(EXAM_UNIT_COUNT);
  });

  it('the graph is genuinely wider than the hours domain', () => {
    // If these ever converge the bug is gone by construction, but so is the
    // reason for this guard — make that visible rather than silently vacuous.
    expect(allUnits().length).toBeGreaterThan(EXAM_UNIT_COUNT);
  });

  it('a fresh student is quoted the curated syllabus, not the graph', () => {
    const hours = remainingPrepHours({
      coverage_exam_total: EXAM_UNIT_COUNT,
      coverage_exam_practicing: 0,
      coverage_exam_learning: 0,
      coverage_total: allUnits().length,
      coverage_practicing: 0,
      coverage_learning: 0,
    } as Parameters<typeof remainingPrepHours>[0]);
    // 397h curated, not 457h.
    expect(Math.round(hours)).toBeLessThan(410);
    expect(Math.round(hours)).toBeGreaterThan(380);
  });

  it('the exam-scoped triple wins over the graph-scoped one', () => {
    const input = (extra: object) => remainingPrepHours({
      coverage_total: allUnits().length, coverage_practicing: 0, coverage_learning: 0, ...extra,
    } as Parameters<typeof remainingPrepHours>[0]);
    const graphOnly = input({});
    const examScoped = input({
      coverage_exam_total: EXAM_UNIT_COUNT, coverage_exam_practicing: 0, coverage_exam_learning: 0,
    });
    expect(examScoped).toBeLessThan(graphOnly);
  });

  it('onboarding emits the exam-scoped counts', () => {
    const screen = readFileSync(join(ROOT, 'src/app/student/onboarding/screens/screen-topic-coverage.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(screen, 'the hours model must be handed exam units').toMatch(/coverage_exam_total/);
  });

  it('the coverage badge is untouched — it still reads coverage_total', () => {
    const builder = readFileSync(join(ROOT, 'src/lib/blueprint-builder.ts'), 'utf8');
    const badge = builder.slice(builder.indexOf('function coverageBadge'));
    expect(badge, 'the display question is a separate, founder-shaped decision').toMatch(/coverage_total/);
  });
});
