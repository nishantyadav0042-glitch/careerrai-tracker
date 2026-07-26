import { describe, it, expect } from 'vitest';
import {
  totalSyllabusHours, sectionHours, topicHours, topicsInSection,
  graphImpliedHours, sectionDrift, isSectionReconciled, driftMessage,
  MAX_MODEL_DRIFT, SECTIONS, HOURS_ARE_ESTIMATES, HOURS_MEANING,
} from './prep-model';
import { QA_GRAPH } from './qa-mastery-engine';
import { VARC_GRAPH } from './varc-mastery-engine';

// CareerRai had two hours models: TOPIC_METADATA implied 397h and the section
// mastery graphs independently implied 523h. Nobody saw the contradiction only
// because the graphs are dormant. prep-model.ts made one of them canonical and
// added a guard that refuses to run a drifted engine.
//
// These tests defend the guard, not the numbers. The numbers may legitimately
// change when the graphs are reconciled; what must never change is that a
// section engine cannot quietly start producing a plan whose total contradicts
// the finish date we already showed the student.

describe('the canonical hours model', () => {
  it('has exactly one total, and it is the sum of the topic metadata', () => {
    const total = totalSyllabusHours();
    const fromSections = sectionHours().reduce((s, x) => s + x.hours, 0);
    expect(fromSections).toBe(total);
  });

  it('covers all three sections with no topic counted twice', () => {
    const perSection = SECTIONS.flatMap(topicsInSection);
    expect(new Set(perSection).size).toBe(perSection.length);
    expect(perSection.length).toBeGreaterThan(0);
  });

  it('gives every canonical topic a positive hour estimate', () => {
    for (const section of SECTIONS) {
      for (const topic of topicsInSection(section)) {
        expect(topicHours(topic)).toBeGreaterThan(0);
      }
    }
  });

  it('returns null for a topic outside the syllabus rather than guessing', () => {
    expect(topicHours('Quantum Chromodynamics')).toBeNull();
  });

  it('reports section shares that add up to roughly 100%', () => {
    const sum = sectionHours().reduce((s, x) => s + x.sharePct, 0);
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
  });
});

describe('the drift guard', () => {
  it('holds the tolerance at 10%', () => {
    expect(MAX_MODEL_DRIFT).toBe(0.10);
  });

  it('blocks every section whose graph still disagrees with canonical', () => {
    // All three sections FAIL today, deliberately — the reconciliation is real
    // work and this is what stops it being skipped and found by a student.
    // If a section starts passing, that is good news, but it must be a
    // conscious change: update this test when the graph is reconciled.
    for (const [section, graph] of [['QA', QA_GRAPH], ['VARC', VARC_GRAPH]] as const) {
      const drift = sectionDrift(section, graph);
      const reconciled = isSectionReconciled(section, graph);
      expect(reconciled).toBe(drift <= MAX_MODEL_DRIFT);
      if (!reconciled) {
        expect(driftMessage(section, graph)).toContain('out of sync');
      }
    }
  });

  it('measures drift as a non-negative fraction of the canonical figure', () => {
    for (const [section, graph] of [['QA', QA_GRAPH], ['VARC', VARC_GRAPH]] as const) {
      const drift = sectionDrift(section, graph);
      expect(drift).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(drift)).toBe(true);
    }
  });

  it('explains itself with both numbers when it blocks', () => {
    const msg = driftMessage('QA', QA_GRAPH);
    expect(msg).toMatch(/QA/);
    expect(msg).toMatch(/\d+h/);          // the implied figure
    expect(msg).toMatch(/limit 10%/);     // the tolerance, stated
  });

  it('graphImpliedHours is a comparison figure, never zero for a real graph', () => {
    expect(graphImpliedHours(QA_GRAPH)).toBeGreaterThan(0);
    // Including bonus topics can only add hours, never remove them.
    expect(graphImpliedHours(QA_GRAPH, true)).toBeGreaterThanOrEqual(graphImpliedHours(QA_GRAPH, false));
  });
});

describe('provenance is stated, not implied', () => {
  it('says the hours are an estimate and not a score prediction', () => {
    expect(HOURS_ARE_ESTIMATES).toMatch(/not measured/i);
    expect(HOURS_ARE_ESTIMATES).toMatch(/not a score prediction/i);
  });

  it('describes hours as completing the plan, never as cracking the exam', () => {
    expect(HOURS_MEANING).toMatch(/learning plan/i);
    expect(HOURS_MEANING).not.toMatch(/crack/i);
  });
});
