import { describe, it, expect } from 'vitest';
import {
  totalSyllabusHours, sectionHours, topicHours, topicsInSection,
  SECTIONS, HOURS_ARE_ESTIMATES, HOURS_MEANING,
} from './prep-model';

// CareerRai had two hours models: TOPIC_METADATA implied 397h and the
// per-section mastery graphs independently implied 523h. A drift guard existed
// to stop the second one running while it disagreed with the first.
//
// Founder, 14 Aug: "delete — there should be only one way for building study
// plan." The mastery engines are gone, so the second model is gone, and with
// it the guard. This file now defends the ONE canonical model that remains.

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
