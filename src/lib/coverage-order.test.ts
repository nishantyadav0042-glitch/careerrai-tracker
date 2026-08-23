import { describe, it, expect } from 'vitest';
import { coverageOrderFor, coverageDraftKey, isExamSection } from './coverage-order';

// The student's report, as a test: "I am clicking on QA and VARC, it's coming
// DILR." Every assertion below fails against the old hardcoded constant.

describe('the grid opens on the section the student named', () => {
  it('QA first when they said QA — the exact reported failure', () => {
    expect(coverageOrderFor('QA')[0]).toBe('QA');
  });

  it('VARC first when they said VARC — the other half of the report', () => {
    expect(coverageOrderFor('VARC')[0]).toBe('VARC');
  });

  it('DILR first when they actually said DILR', () => {
    expect(coverageOrderFor('DILR')[0]).toBe('DILR');
  });

  it('no answer can ever produce DILR first by accident', () => {
    // The old constant led with DILR for everyone. Nothing may reintroduce it
    // as a silent default.
    for (const answer of [null, undefined, '', 'MOCKS', 'nonsense']) {
      expect(coverageOrderFor(answer)[0]).not.toBe('DILR');
    }
  });
});

describe('the rest of the order stays whole', () => {
  it('every section still appears exactly once', () => {
    for (const answer of ['VARC', 'DILR', 'QA', null]) {
      const order = coverageOrderFor(answer);
      expect(order).toHaveLength(5);
      expect(new Set(order).size).toBe(5);
    }
  });

  it('habit tracks stay at the end, never promoted ahead of the syllabus', () => {
    for (const answer of ['VARC', 'DILR', 'QA', null]) {
      expect(coverageOrderFor(answer).slice(-2)).toEqual(['MOCKS', 'READING']);
    }
  });

  it('a habit track named as "weakest" is not treated as an exam section', () => {
    expect(coverageOrderFor('MOCKS')[0]).toBe('VARC');
    expect(isExamSection('MOCKS')).toBe(false);
  });
});

describe('a changed answer cannot resume the previous sequence', () => {
  it('different answers produce different draft keys', () => {
    const qa = coverageDraftKey('preauth', 'QA');
    const varc = coverageDraftKey('preauth', 'VARC');
    expect(qa).not.toBe(varc);
  });

  it('the same answer in the same scope is stable, so a real resume still works', () => {
    expect(coverageDraftKey('preauth', 'QA')).toBe(coverageDraftKey('preauth', 'QA'));
  });

  it('two students on one device never share a key', () => {
    expect(coverageDraftKey('user-a', 'QA')).not.toBe(coverageDraftKey('user-b', 'QA'));
  });
});
