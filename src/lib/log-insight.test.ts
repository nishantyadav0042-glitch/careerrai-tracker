import { describe, it, expect } from 'vitest';
import { coverageInsight, type CoverageRow } from './log-insight';
import { KNOWLEDGE_GRAPH, EXAM_SECTION_IDS } from './topics-constants';

// The founder's contract (17 Aug): "students should always get an insight when
// they log something." These tests pin the ladder AND the guarantee — for any
// student with coverage rows or logging history, the function returns a line.
//
// 0C.3a, 18 Aug — REWRITTEN AGAINST THE CANONICAL SYLLABUS.
//
// The pre-migration version of this file built sections of arbitrary size — a
// "QA" of 5 rows, a "DILR" of 3 — and asserted lines like "QA: 2 of 10 topics
// opened". Those assertions were the row-count denominator defect, written down
// as expectations. A test that pins a defect protects it.
//
// Every fixture below is now the real taxonomy: QA is 28 topics, VARC is 9,
// DILR is 9, and a section fixture states a status for topics that exist.

const TOPICS: Record<string, string[]> = Object.fromEntries(
  KNOWLEDGE_GRAPH
    .filter((s) => (EXAM_SECTION_IDS as string[]).includes(s.id))
    .map((s) => [s.id, s.groups.flatMap((g) => g.units)])
);

/**
 * Build one section's rows. `statuses` applies from the first canonical topic
 * onward; every remaining topic in the section gets `rest`.
 */
function section(name: string, statuses: string[], rest = 'not_started'): CoverageRow[] {
  return TOPICS[name].map((topic, i) => ({
    topic, section: name, status: statuses[i] ?? rest,
  }));
}

const DATES = ['2026-08-18', '2026-08-17', '2026-08-16', '2026-08-15',
  '2026-08-10', '2026-08-09', '2026-08-08', '2026-08-05', '2026-08-04', '2026-08-01'];
const base = { isRest: false, logDates: DATES, today: '2026-08-18' };

describe('rung 1 — section within sight of fully opened', () => {
  it('names the exact remaining count for a studied section with ≤3 untouched', () => {
    // VARC: 7 of 9 opened, 2 untouched.
    const coverage = [
      ...section('VARC', ['learning', 'practicing', 'revising', 'learning', 'learning', 'practicing', 'exam_ready']),
      ...section('QA', []),
    ];
    const line = coverageInsight({ ...base, coverage, todaySections: ['VARC'] });
    expect(line).toBe('Just 2 VARC topics left untouched — the whole section is in sight.');
  });

  it('uses singular grammar for exactly one topic left', () => {
    const coverage = section('DILR', Array(8).fill('learning'));
    const line = coverageInsight({ ...base, coverage, todaySections: ['DILR'] });
    expect(line).toBe('Just 1 DILR topic left untouched — the whole section is in sight.');
  });

  it('never fires for a section the student did NOT study today', () => {
    const coverage = [
      ...section('VARC', Array(8).fill('learning')),  // near done, but not studied today
      ...section('QA', ['learning']),
    ];
    const line = coverageInsight({ ...base, coverage, todaySections: ['QA'] });
    expect(line).not.toContain('VARC');
  });
});

describe('rung 2 — section fully opened', () => {
  it('moves the claim from breadth to depth when nothing is untouched', () => {
    const coverage = section('VARC', Array(9).fill('practicing'));
    const line = coverageInsight({ ...base, coverage, todaySections: ['VARC'] });
    expect(line).toBe("Every VARC topic is opened — nothing untouched. Now it's depth, not coverage.");
  });

  it('counts revision-depth topics when they exist', () => {
    const coverage = section('VARC', ['revising', 'revising', ...Array(7).fill('practicing')]);
    const line = coverageInsight({ ...base, coverage, todaySections: ['VARC'] });
    expect(line).toBe('Every VARC topic is opened, and 2 are already at revision depth.');
  });

  it('requires the WHOLE section, not just the rows that happen to exist', () => {
    // The 0C.3a defect, pinned. Four VARC rows, all opened, is not a cleared
    // section — it is 4 of 9 with 5 topics we have never been told about.
    const coverage = TOPICS.VARC.slice(0, 4).map((topic) => ({ topic, section: 'VARC', status: 'learning' }));
    const line = coverageInsight({ ...base, coverage, todaySections: ['VARC'] });
    expect(line).not.toContain('Every VARC topic is opened');
    expect(line).toBe('VARC: 4 of 9 topics opened — 44% of the section on the board.');
  });
});

describe('rung 3 — the default section number', () => {
  it('states opened-of-total with a percentage for the studied section', () => {
    const coverage = section('QA', ['learning', 'practicing']);
    const line = coverageInsight({ ...base, coverage, todaySections: ['QA'] });
    expect(line).toBe('QA: 2 of 28 topics opened — 7% of the section on the board.');
  });

  it('picks the strongest section when several were studied', () => {
    const coverage = [
      ...section('QA', ['learning']),                        // 1/28 = 4%
      ...section('DILR', ['learning', 'practicing', 'revising', 'learning']), // 4/9 = 44%
    ];
    const line = coverageInsight({ ...base, coverage, todaySections: ['QA', 'DILR'] });
    expect(line).toBe('DILR: 4 of 9 topics opened — 44% of the section on the board.');
  });

  it('rung 1 still outranks rung 3 when a section is nearly clear', () => {
    const coverage = [
      ...section('QA', ['learning']),
      ...section('DILR', Array(7).fill('learning')), // 2 untouched → rung 1
    ];
    const line = coverageInsight({ ...base, coverage, todaySections: ['QA', 'DILR'] });
    expect(line).toBe('Just 2 DILR topics left untouched — the whole section is in sight.');
  });
});

describe('habit tracks are never counted as syllabus', () => {
  it('excludes MOCKS/READING rows from the whole-syllabus number', () => {
    const coverage: CoverageRow[] = [
      ...section('QA', ['learning']),
      { topic: 'Full Length Mocks', section: 'MOCKS', status: 'learning' },
      { topic: 'Mock Analysis', section: 'MOCKS', status: 'learning' },
      { topic: 'Daily Editorials', section: 'READING', status: 'practicing' },
    ];
    const line = coverageInsight({ ...base, coverage, todaySections: ['Mock'] });
    expect(line).toBe('Across the syllabus: 1 of 46 topics opened (2%).');
  });
});

describe('unknown evidence is refused, not quietly dropped', () => {
  it('declines the section line when a row names a topic we do not recognise', () => {
    const coverage: CoverageRow[] = [
      ...section('QA', ['learning', 'practicing']),
      { topic: 'Vedic Maths Shortcuts', section: 'QA', status: 'exam_ready' },
    ];
    const line = coverageInsight({ ...base, coverage, todaySections: ['QA'] });
    expect(line).not.toContain('QA:');
    expect(line).toBe("Day counted — that's 10 logged days of your preparation on record.");
  });

  it('declines when two rows contradict each other about one topic', () => {
    const coverage: CoverageRow[] = [
      ...section('VARC', Array(9).fill('practicing')),
      { topic: TOPICS.VARC[0], section: 'General', status: 'not_started' },
    ];
    const line = coverageInsight({ ...base, coverage, todaySections: ['VARC'] });
    expect(line).not.toContain('VARC');
  });

  it('collapses a topic filed twice in agreement rather than counting it twice', () => {
    // The real production shape: 'Vocabulary' under both VARC and General,
    // both `revising`. Counting rows would say 10 of 9 — 111%.
    const coverage: CoverageRow[] = [
      ...section('VARC', Array(9).fill('revising')),
      { topic: 'Vocabulary', section: 'General', status: 'revising' },
    ];
    const line = coverageInsight({ ...base, coverage, todaySections: ['VARC'] });
    expect(line).toBe('Every VARC topic is opened, and 9 are already at revision depth.');
  });
});

describe('rest days and empty logs', () => {
  it('gives the consistency fact on a rest day, never the syllabus', () => {
    const coverage = section('QA', ['learning']);
    const line = coverageInsight({
      ...base, coverage, todaySections: [], isRest: true,
      logDates: ['2026-08-18', '2026-08-17', '2026-08-16', '2026-08-14', '2026-08-13'],
    });
    expect(line).toBe('Rest day counted — 5 of the last 7 days showed up. That consistency is the prep.');
  });

  it('falls back to total logged days when the week is thin', () => {
    const line = coverageInsight({
      coverage: [], todaySections: [], isRest: true, today: '2026-08-18',
      logDates: ['2026-08-18', '2026-07-01', '2026-06-20', '2026-06-19'],
    });
    expect(line).toBe("Day counted — that's 4 logged days of your preparation on record.");
  });

  it('returns null only for a first-ever rest log with no coverage — the route owns that line', () => {
    const line = coverageInsight({
      coverage: [], todaySections: [], isRest: true,
      logDates: ['2026-08-18'], today: '2026-08-18',
    });
    expect(line).toBeNull();
  });
});

describe('the guarantee', () => {
  it('any study log with coverage rows always gets a line', () => {
    const coverage = [
      ...section('QA', ['learning']),
      ...section('VARC', ['practicing']),
      ...section('DILR', ['revising']),
    ];
    for (const sections of [['QA'], ['VARC'], ['DILR'], ['Mock'], ['Revision'], ['QA', 'Mock']]) {
      const line = coverageInsight({ ...base, coverage, todaySections: sections });
      expect(line, `sections=${sections.join(',')}`).toBeTruthy();
    }
  });

  it('a studied section with zero coverage rows still gets the day-count line', () => {
    const line = coverageInsight({ ...base, coverage: [], todaySections: ['QA'] });
    expect(line).toBe("Day counted — that's 10 logged days of your preparation on record.");
  });
});
