import { describe, it, expect } from 'vitest';
import { coverageInsight, type CoverageRow } from './log-insight';

// The founder's contract (17 Aug): "students should always get an insight when
// they log something." These tests pin the ladder AND the guarantee — for any
// student with coverage rows or logging history, the function returns a line.

function section(name: string, statuses: string[]): CoverageRow[] {
  return statuses.map((status) => ({ section: name, status }));
}

const base = { isRest: false, loggedDayCount: 10, loggedDaysLast7: 4 };

describe('rung 1 — section within sight of fully opened', () => {
  it('names the exact remaining count for a studied section with ≤3 untouched', () => {
    const coverage = [
      ...section('QA', ['learning', 'practicing', 'revising', 'not_started', 'not_started']),
      ...section('VARC', ['not_started', 'not_started', 'not_started', 'not_started']),
    ];
    const line = coverageInsight({ ...base, coverage, todaySections: ['QA'] });
    expect(line).toContain('Just 2 QA topics left untouched');
  });

  it('uses singular grammar for exactly one topic left', () => {
    const coverage = section('DILR', ['learning', 'practicing', 'not_started']);
    const line = coverageInsight({ ...base, coverage, todaySections: ['DILR'] });
    expect(line).toContain('Just 1 DILR topic left untouched');
  });

  it('never fires for a section the student did NOT study today', () => {
    const coverage = [
      ...section('QA', ['learning', 'not_started']), // near done, but not studied today
      ...section('VARC', ['learning', ...Array(9).fill('not_started')]),
    ];
    const line = coverageInsight({ ...base, coverage, todaySections: ['VARC'] });
    expect(line).not.toContain('QA');
  });
});

describe('rung 2 — section fully opened', () => {
  it('moves the claim from breadth to depth when nothing is untouched', () => {
    const coverage = section('VARC', ['learning', 'practicing', 'practicing']);
    const line = coverageInsight({ ...base, coverage, todaySections: ['VARC'] });
    expect(line).toContain('Every VARC topic is opened');
    expect(line).toContain('depth');
  });

  it('counts revision-depth topics when they exist', () => {
    const coverage = section('VARC', ['revising', 'revising', 'practicing']);
    const line = coverageInsight({ ...base, coverage, todaySections: ['VARC'] });
    expect(line).toContain('2 are already at revision depth');
  });
});

describe('rung 3 — the default section number', () => {
  it('states opened-of-total with a percentage for the studied section', () => {
    const coverage = section('QA', ['learning', 'practicing', ...Array(8).fill('not_started')]);
    const line = coverageInsight({ ...base, coverage, todaySections: ['QA'] });
    expect(line).toContain('QA: 2 of 10 topics opened');
    expect(line).toContain('20%');
  });

  it('picks the strongest section when several were studied', () => {
    const coverage = [
      ...section('QA', ['learning', ...Array(9).fill('not_started')]),        // 10%
      ...section('DILR', ['learning', 'practicing', ...Array(2).fill('not_started')]), // 50% — but 2 untouched → rung 1 wins
    ];
    const line = coverageInsight({ ...base, coverage, todaySections: ['QA', 'DILR'] });
    // DILR has 2 untouched → rung 1 fires for it first
    expect(line).toContain('Just 2 DILR topics left untouched');
  });
});

describe('habit tracks are never counted as syllabus', () => {
  it('excludes MOCKS/READING rows from the whole-syllabus number', () => {
    const coverage = [
      ...section('QA', ['learning', 'not_started', 'not_started', 'not_started']),
      ...section('MOCKS', ['learning', 'learning', 'learning']),   // must not inflate
      ...section('READING', ['practicing']),                        // must not inflate
    ];
    const line = coverageInsight({ ...base, coverage, todaySections: ['Mock'] });
    expect(line).toContain('1 of 4 topics opened');
  });
});

describe('rest days and empty logs', () => {
  it('gives the consistency fact on a rest day, never the syllabus', () => {
    const coverage = section('QA', ['learning', 'not_started']);
    const line = coverageInsight({
      ...base, coverage, todaySections: [], isRest: true, loggedDaysLast7: 5,
    });
    expect(line).toContain('Rest day counted');
    expect(line).toContain('5 of the last 7 days');
  });

  it('falls back to total logged days when the week is thin', () => {
    const line = coverageInsight({
      coverage: [], todaySections: [], isRest: true, loggedDayCount: 12, loggedDaysLast7: 1,
    });
    expect(line).toContain('12 logged days');
  });

  it('returns null only for a first-ever rest log with no coverage — the route owns that line', () => {
    const line = coverageInsight({
      coverage: [], todaySections: [], isRest: true, loggedDayCount: 1, loggedDaysLast7: 1,
    });
    expect(line).toBeNull();
  });
});

describe('the guarantee', () => {
  it('any study log with coverage rows always gets a line', () => {
    for (const sections of [['QA'], ['VARC'], ['DILR'], ['Mock'], ['Revision'], ['QA', 'Mock']]) {
      const coverage = [
        ...section('QA', ['learning', 'not_started', 'not_started', 'not_started', 'not_started']),
        ...section('VARC', ['practicing', 'not_started', 'not_started', 'not_started', 'not_started']),
        ...section('DILR', ['revising', 'not_started', 'not_started', 'not_started', 'not_started']),
      ];
      const line = coverageInsight({ ...base, coverage, todaySections: sections });
      expect(line, `sections=${sections.join(',')}`).toBeTruthy();
    }
  });

  it('a studied section with zero coverage rows still gets the whole-syllabus or day-count line', () => {
    const line = coverageInsight({ ...base, coverage: [], todaySections: ['QA'] });
    expect(line).toBeTruthy();
  });
});
