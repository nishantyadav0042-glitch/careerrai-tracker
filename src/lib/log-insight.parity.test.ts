import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coverageInsight } from './log-insight';
import { coverageInsightFromFacts, type FactCoverageRow } from './log-insight-facts';
import {
  KNOWLEDGE_GRAPH, EXAM_SECTION_IDS, EXAM_SYLLABUS_TOPICS, MOCK_PREP_UNITS,
} from './topics-constants';

// ── 0C.3a — MIGRATION PARITY ────────────────────────────────────────────────
//
// The founder's migration contract, 18 Aug:
//
//   "Byte-identical parity. Old implementation and registry implementation run
//    side-by-side in tests. If: old !== new — STOP."
//
// This file IS that comparison. It is not a test that the new code is nice; it
// is the instrument that decides whether 0C.3a may ship at all.
//
// Guard 28 from the producer investigation ("during any producer migration, a
// test asserts old and new outputs are byte-identical over a fixture corpus")
// is discharged here.

const STATUSES = ['not_started', 'learning', 'practicing', 'revising', 'exam_ready'];

/** A fully-seeded student: one row per exam topic. 426 of 427 real students. */
const SEEDED: { topic: string; section: string }[] = KNOWLEDGE_GRAPH
  .filter((s) => (EXAM_SECTION_IDS as string[]).includes(s.id))
  .flatMap((s) => s.groups.flatMap((g) => g.units.map((topic) => ({ topic, section: s.id }))));

/**
 * Deterministic, never random. `Math.random()` in a corpus generator makes a
 * parity failure unreproducible — the one thing a parity harness may not be.
 */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => { x = (x * 1_664_525 + 1_013_904_223) >>> 0; return x / 4_294_967_296; };
}

function seededRows(seed: number, statusPool = STATUSES): FactCoverageRow[] {
  const rnd = lcg(seed);
  return SEEDED.map(({ topic, section }) => ({
    topic, section, status: statusPool[Math.floor(rnd() * statusPool.length)],
  }));
}

const SECTION_COMBOS: string[][] = [
  [], ['QA'], ['VARC'], ['DILR'], ['QA', 'VARC'], ['VARC', 'DILR'], ['QA', 'DILR'],
  ['QA', 'VARC', 'DILR'], ['Mock'], ['Revision'], ['Mock', 'Revision'], ['QA', 'Mock'],
];

const DATE_SETS: string[][] = [
  [],
  ['2026-08-18'],
  ['2026-08-18', '2026-08-17'],
  ['2026-08-18', '2026-08-17', '2026-08-16', '2026-08-15'],
  ['2026-08-18', '2026-08-12', '2026-08-11', '2026-07-01', '2026-06-02'],
  ['2026-08-18', '2026-08-18', '2026-08-01'], // a duplicated date, deliberately
];
const TODAY = '2026-08-18';

function distinct(dates: string[]): string[] { return [...new Set(dates)]; }

function last7(dates: string[]): number {
  const end = Date.parse(`${TODAY}T00:00:00Z`);
  return new Set(dates.filter((d) => {
    const back = Math.round((end - Date.parse(`${d}T00:00:00Z`)) / 86_400_000);
    return back >= 0 && back <= 6;
  })).size;
}

/** Drive both implementations from ONE underlying student state. */
function bothAgree(rows: FactCoverageRow[], todaySections: string[], isRest: boolean, dates: string[]) {
  const old = coverageInsight({
    coverage: rows.map((r) => ({ section: r.section, status: r.status })),
    todaySections, isRest,
    // The route passes `count(*)` of daily_reports. That equals the distinct
    // date count ONLY because (student_id, report_date) is unique — verified in
    // production, 0 duplicate pairs. The registry makes it structural instead
    // of incidental: logged_days_total counts dates, never rows.
    loggedDayCount: distinct(dates).length,
    loggedDaysLast7: last7(dates),
  });
  const migrated = coverageInsightFromFacts({
    coverage: rows, todaySections, isRest, logDates: dates, today: TODAY,
  });
  return { old, migrated };
}

describe('0C.3a — byte-identical parity for a fully-seeded student', () => {
  it('runs over the real syllabus, not a hand-written stand-in', () => {
    // A parity corpus built on a 5-topic toy would pass and prove nothing. The
    // denominators under test are the canonical ones: 46 = QA 28 + VARC 9 + DILR 9.
    expect(SEEDED.length).toBe(EXAM_SYLLABUS_TOPICS.length);
    expect(SEEDED.filter((r) => r.section === 'QA').length).toBe(28);
  });

  it('agrees on every corpus cell', () => {
    const mismatches: string[] = [];
    let cells = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const rows = seededRows(seed);
      for (const sections of SECTION_COMBOS) {
        for (const dates of DATE_SETS) {
          for (const isRest of [false, true]) {
            cells++;
            const { old, migrated } = bothAgree(rows, sections, isRest, dates);
            if (old !== migrated) {
              mismatches.push(`seed=${seed} sections=[${sections}] dates=${dates.length} rest=${isRest}\n  old: ${old}\n  new: ${migrated}`);
            }
          }
        }
      }
    }
    expect(cells).toBeGreaterThan(5000);
    expect(mismatches.slice(0, 5).join('\n'), `${mismatches.length}/${cells} cells diverged`).toBe('');
  });

  it('agrees on the boundary shapes the rungs are built around', () => {
    // Each rung reached deliberately, not by luck of the generator.
    const qaAll = (status: string) => SEEDED.map((r) => ({ ...r, status }));
    const shapes: { name: string; rows: FactCoverageRow[] }[] = [
      { name: 'everything untouched', rows: qaAll('not_started') },
      { name: 'everything opened', rows: qaAll('learning') },
      { name: 'everything at depth', rows: qaAll('revising') },
      {
        name: 'VARC one topic from clear', // rung 1
        rows: SEEDED.map((r, i) => ({ ...r, status: r.section === 'VARC' && i % 9 === 0 ? 'not_started' : 'learning' })),
      },
      {
        name: 'DILR clear, none at depth', // rung 2, second branch
        rows: SEEDED.map((r) => ({ ...r, status: r.section === 'DILR' ? 'learning' : 'not_started' })),
      },
      {
        name: 'DILR clear, some at depth', // rung 2, first branch
        rows: SEEDED.map((r, i) => ({ ...r, status: r.section === 'DILR' ? (i % 2 ? 'revising' : 'learning') : 'not_started' })),
      },
    ];
    for (const { name, rows } of shapes) {
      for (const sections of SECTION_COMBOS) {
        const { old, migrated } = bothAgree(rows, sections, false, DATE_SETS[3]);
        expect(migrated, `${name} / [${sections}]`).toBe(old);
      }
    }
  });

  it('agrees when habit-track rows share the table', () => {
    // topic_coverage holds two universes. The old code ignored MOCKS/READING by
    // section; the migrated code scopes by the canonical topic predicate. If
    // those ever disagree, a "% of syllabus" claim counts a habit track — the
    // 111% Knowledge defect, one table over.
    const rows: FactCoverageRow[] = [
      ...seededRows(7),
      ...MOCK_PREP_UNITS.map((topic) => ({ topic, section: 'MOCKS', status: 'exam_ready' })),
    ];
    for (const sections of SECTION_COMBOS) {
      const { old, migrated } = bothAgree(rows, sections, false, DATE_SETS[4]);
      expect(migrated, `[${sections}]`).toBe(old);
    }
  });

  it('agrees that a student with no coverage at all gets the day count', () => {
    for (const dates of DATE_SETS) {
      for (const sections of SECTION_COMBOS) {
        const { old, migrated } = bothAgree([], sections, false, dates);
        expect(migrated, `[${sections}] / ${dates.length} dates`).toBe(old);
      }
    }
  });
});

// ── THE STOP ────────────────────────────────────────────────────────────────

describe('0C.3a — the divergence that stops the migration', () => {
  // ONE production student (50b0ad71, 3 logs, last 26 Jul) carries a PARTIAL
  // coverage matrix: 7 QA rows, 4 VARC, 5 DILR — 16 of 46. Rows exist only
  // where a task tick created one, because /complete-task upserts a single row
  // on demand while onboarding seeds all 46.
  //
  // log-insight.ts uses `rows.length` as the denominator: "however many rows
  // this student happens to have". The registry uses the section's real size,
  // as ruling D1 requires ("the denominator is the canonical syllabus, never a
  // literal, never a row count").
  //
  // So the two disagree, and the OLD one is the one that is wrong: it reports
  // a student who has opened 6 of 28 QA topics as having opened "6 of 7 — 86%".
  //
  // This is not a migration artefact to be tuned away. It is the migration
  // finding a live Article-5 violation. Per the contract: STOP, report, do not
  // adjust the fact definition to reproduce the old number.
  const PARTIAL: FactCoverageRow[] = [
    ...SEEDED.filter((r) => r.section === 'QA').slice(0, 7).map((r, i) => ({ ...r, status: i < 6 ? 'learning' : 'not_started' })),
    ...SEEDED.filter((r) => r.section === 'VARC').slice(0, 4).map((r) => ({ ...r, status: 'learning' })),
    ...SEEDED.filter((r) => r.section === 'DILR').slice(0, 5).map((r) => ({ ...r, status: 'learning' })),
  ];

  it('claims a section is nearly clear when 22 of its 28 topics are untouched', () => {
    const { old, migrated } = bothAgree(PARTIAL, ['QA'], false, DATE_SETS[3]);
    // 6 QA topics opened, 1 row not_started, 21 topics with no row at all.
    expect(old).toBe('Just 1 QA topic left untouched — the whole section is in sight.');
    expect(migrated).toBe('QA: 6 of 28 topics opened — 21% of the section on the board.');
    expect(migrated).not.toBe(old); // the STOP condition, recorded not suppressed
  });

  it('claims every VARC topic is opened when 5 of 9 have never been touched', () => {
    // The worst shape: not a percentage that is off, a RUNG that is wrong. The
    // student is told breadth is finished and to move to depth.
    const { old, migrated } = bothAgree(PARTIAL, ['VARC'], false, DATE_SETS[3]);
    expect(old).toBe("Every VARC topic is opened — nothing untouched. Now it's depth, not coverage.");
    expect(migrated).toBe('VARC: 4 of 9 topics opened — 44% of the section on the board.');
  });

  it('overstates the whole syllabus by 61 percentage points', () => {
    const { old, migrated } = bothAgree(PARTIAL, ['Mock'], false, DATE_SETS[3]);
    expect(old).toBe('Across the syllabus: 15 of 16 topics opened (94%).');
    expect(migrated).toBe('Across the syllabus: 15 of 46 topics opened (33%).');
  });

  it('picks a different section entirely when all three are studied', () => {
    // The rung-3 ranking sorts on opened/total. With row-count denominators
    // every section looks near-complete, so the ordering is arbitrary too.
    const { old, migrated } = bothAgree(PARTIAL, ['QA', 'VARC', 'DILR'], false, DATE_SETS[3]);
    expect(old).toBe('Just 1 QA topic left untouched — the whole section is in sight.');
    expect(migrated).toBe('DILR: 5 of 9 topics opened — 56% of the section on the board.');
  });
});

describe('0C.3a — ratios still produced outside the registry', () => {
  it('names the two facts the migration needs and does not have', () => {
    // Recorded as a test so it cannot be forgotten between sessions. My 0C.3
    // investigation enumerated the COUNTS these lines need and missed the
    // PERCENTAGES they print — the same class of miss as the opened/covered
    // gap, found the same way: by trying to actually do the migration.
    const src = readFileSync(join(process.cwd(), 'src/lib/log-insight-facts.ts'), 'utf8');
    expect(src).toContain('section_opened_pct');
    expect(src).toContain('syllabus_opened_pct');
    expect(src.match(/⚠ BLOCKED/g)?.length, 'both blocked ratios must be marked').toBe(2);
  });

  it('is not wired into the live log path', () => {
    // 0C.3a does not ship while a STOP is outstanding.
    const route = readFileSync(join(process.cwd(), 'src/app/api/logging/log-daily/route.ts'), 'utf8');
    expect(route).not.toContain('coverageInsightFromFacts');
  });
});
