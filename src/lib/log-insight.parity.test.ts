import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coverageInsight, type CoverageRow } from './log-insight';
import { isOpened, isAtRevisionDepth } from './coverage-status';
import {
  KNOWLEDGE_GRAPH, EXAM_SECTION_IDS, EXAM_SYLLABUS_TOPICS, MOCK_PREP_UNITS,
} from './topics-constants';

// ── 0C.3a — MIGRATION PARITY ────────────────────────────────────────────────
//
// The founder's migration contract, 18 Aug:
//
//   "Byte-identical parity. Old implementation and registry implementation run
//    side-by-side in tests. If: old !== new — STOP."
//   "Do not modify the old producer to make parity pass."
//   "Where the old system is provably wrong, classify that divergence
//    explicitly as a known semantic defect."
//
// This file IS that comparison, and it is the reason `log-insight.ts` was
// allowed to change at all. It is not a test that the new code is nice.
//
// Guard 28 from the producer investigation — "during any producer migration, a
// test asserts old and new outputs are byte-identical over a fixture corpus" —
// is discharged here.

// ── THE FROZEN PRE-MIGRATION PRODUCER ───────────────────────────────────────
//
// Verbatim from `src/lib/log-insight.ts` at commit 3a32277, the last commit
// before the migration. It lives HERE, in the test, rather than in `src/`,
// because ruling 10 requires exactly one producer per semantic fact in
// production code. This copy is a historical reference — a fixture, not a code
// path — and nothing imports it.
//
// DO NOT EDIT IT TO MAKE A TEST PASS. Its whole value is that it is what
// shipped. If it needs to change, the migration is wrong.

interface LegacyRow { section: string; status: string }

interface LegacyInput {
  coverage: LegacyRow[];
  todaySections: string[];
  isRest: boolean;
  loggedDayCount: number;
  loggedDaysLast7: number;
}

const LEGACY_CORE_SECTIONS = ['VARC', 'DILR', 'QA'] as const;

interface LegacyTally {
  section: string; total: number; opened: number; untouched: number; atDepth: number;
}

function legacyTally(coverage: LegacyRow[], section: string): LegacyTally {
  const rows = coverage.filter((r) => r.section === section);
  return {
    section,
    total: rows.length, // ← THE DEFECT. The syllabus is not "however many rows exist".
    opened: rows.filter((r) => isOpened(r.status)).length,
    untouched: rows.filter((r) => !isOpened(r.status)).length,
    atDepth: rows.filter((r) => isAtRevisionDepth(r.status)).length,
  };
}

function legacyCoverageInsight(input: LegacyInput): string | null {
  const { coverage, todaySections, isRest, loggedDayCount, loggedDaysLast7 } = input;

  if (isRest || todaySections.length === 0) {
    if (loggedDaysLast7 > 1) {
      return `Rest day counted — ${loggedDaysLast7} of the last 7 days showed up. That consistency is the prep.`;
    }
    return loggedDayCount > 1
      ? `Day counted — that's ${loggedDayCount} logged days of your preparation on record.`
      : null;
  }

  const studiedCore = LEGACY_CORE_SECTIONS.filter((s) => todaySections.includes(s));

  if (studiedCore.length > 0) {
    const tallies = studiedCore.map((s) => legacyTally(coverage, s)).filter((t) => t.total > 0);

    if (tallies.length > 0) {
      const nearDone = tallies
        .filter((t) => t.untouched >= 1 && t.untouched <= 3)
        .sort((a, b) => a.untouched - b.untouched)[0];
      if (nearDone) {
        return `Just ${nearDone.untouched} ${nearDone.section} topic${nearDone.untouched === 1 ? '' : 's'} left untouched — the whole section is in sight.`;
      }

      const cleared = tallies.find((t) => t.untouched === 0 && t.opened > 0);
      if (cleared) {
        return cleared.atDepth > 0
          ? `Every ${cleared.section} topic is opened, and ${cleared.atDepth} ${cleared.atDepth === 1 ? 'is' : 'are'} already at revision depth.`
          : `Every ${cleared.section} topic is opened — nothing untouched. Now it's depth, not coverage.`;
      }

      const best = tallies
        .filter((t) => t.opened > 0)
        .sort((a, b) => b.opened / b.total - a.opened / a.total)[0];
      if (best) {
        const pct = Math.round((best.opened / best.total) * 100);
        return `${best.section}: ${best.opened} of ${best.total} topics opened — ${pct}% of the section on the board.`;
      }

      return `Counted. As ${tallies[0].section} topics start moving, this line will carry your section numbers.`;
    }
  }

  const whole = LEGACY_CORE_SECTIONS.map((s) => legacyTally(coverage, s)).reduce(
    (acc, t) => ({ opened: acc.opened + t.opened, total: acc.total + t.total }),
    { opened: 0, total: 0 }
  );
  if (whole.total > 0 && whole.opened > 0) {
    const pct = Math.round((whole.opened / whole.total) * 100);
    return `Across the syllabus: ${whole.opened} of ${whole.total} topics opened (${pct}%).`;
  }

  return loggedDayCount > 1
    ? `Day counted — that's ${loggedDayCount} logged days of your preparation on record.`
    : null;
}

// ── THE CORPUS ──────────────────────────────────────────────────────────────

const STATUSES = ['not_started', 'learning', 'practicing', 'revising', 'exam_ready'];

/** Every exam topic with its true section. The universe, not a toy. */
const SYLLABUS: { topic: string; section: string }[] = KNOWLEDGE_GRAPH
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

function seededRows(seed: number, pool = STATUSES): CoverageRow[] {
  const rnd = lcg(seed);
  return SYLLABUS.map(({ topic, section }) => ({
    topic, section, status: pool[Math.floor(rnd() * pool.length)],
  }));
}

/** Take the first `n` topics of the syllabus, in canonical order. */
function firstN(n: number, status: (i: number) => string): CoverageRow[] {
  return SYLLABUS.slice(0, n).map(({ topic, section }, i) => ({ topic, section, status: status(i) }));
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
const FOUR_DAYS = DATE_SETS[3];

function distinct(dates: string[]): string[] { return [...new Set(dates.filter(Boolean))]; }

function last7(dates: string[]): number {
  const end = Date.parse(`${TODAY}T00:00:00Z`);
  return new Set(dates.filter((d) => {
    const back = Math.round((end - Date.parse(`${d}T00:00:00Z`)) / 86_400_000);
    return back >= 0 && back <= 6;
  })).size;
}

/**
 * Drive BOTH implementations from one underlying student state.
 *
 * The legacy side is fed exactly what the pre-migration route fed it: rows
 * without topics, a `count(*)` day total, and a window the route computed
 * itself. Anything else would be comparing the migration against a strawman.
 */
function both(rows: CoverageRow[], todaySections: string[], isRest: boolean, dates: string[]) {
  const old = legacyCoverageInsight({
    coverage: rows.map((r) => ({ section: r.section, status: r.status })),
    todaySections, isRest,
    // count(*) of daily_reports == the distinct date count, because
    // (student_id, report_date) is UNIQUE — asserted against the migrations in
    // registry.guard.test.ts rather than assumed here.
    loggedDayCount: distinct(dates).length,
    loggedDaysLast7: last7(dates),
  });
  const migrated = coverageInsight({
    coverage: rows, todaySections, isRest, logDates: dates, today: TODAY,
  });
  return { old, migrated };
}

// ── PART 1 — PARITY WHERE THE OLD SEMANTICS ARE VALID ───────────────────────
//
// "Valid" has a precise meaning: the student has a row for every canonical
// topic, so `rows.length` and the canonical size are the same number. That is
// 426 of 427 production students.

describe('0C.3a — parity, fully-seeded students', () => {
  it('runs over the real syllabus, not a hand-written stand-in', () => {
    expect(SYLLABUS.length).toBe(EXAM_SYLLABUS_TOPICS.length);
    expect(SYLLABUS.length).toBe(46);
    expect(SYLLABUS.filter((r) => r.section === 'QA').length).toBe(28);
    expect(SYLLABUS.filter((r) => r.section === 'VARC').length).toBe(9);
    expect(SYLLABUS.filter((r) => r.section === 'DILR').length).toBe(9);
  });

  it('agrees on every cell of the generated corpus', () => {
    const mismatches: string[] = [];
    let cells = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rows = seededRows(seed);
      for (const sections of SECTION_COMBOS) {
        for (const dates of DATE_SETS) {
          for (const isRest of [false, true]) {
            cells++;
            const { old, migrated } = both(rows, sections, isRest, dates);
            if (old !== migrated) {
              mismatches.push(`seed=${seed} sections=[${sections}] dates=${dates.length} rest=${isRest}\n  old: ${old}\n  new: ${migrated}`);
            }
          }
        }
      }
    }
    expect(cells).toBeGreaterThan(28_000);
    expect(mismatches.slice(0, 5).join('\n'), `${mismatches.length}/${cells} cells diverged`).toBe('');
  });

  it('agrees on ladder-restricted pools, where ties and rungs cluster', () => {
    // The uniform generator rarely produces "everything opened but nothing at
    // depth" or two sections with equal ratios. These pools force those shapes.
    const pools = [
      ['not_started', 'learning'],                       // opened != covered
      ['practicing', 'revising'],                        // covered, some at depth
      ['learning', 'practicing'],                        // opened, none at depth
      ['revising', 'exam_ready'],                        // all at depth
      ['not_started', 'exam_ready'],                     // bimodal
    ];
    for (const pool of pools) {
      for (let seed = 1; seed <= 25; seed++) {
        const rows = seededRows(seed * 31, pool);
        for (const sections of SECTION_COMBOS) {
          const { old, migrated } = both(rows, sections, false, FOUR_DAYS);
          expect(migrated, `pool=[${pool}] seed=${seed} [${sections}]`).toBe(old);
        }
      }
    }
  });

  it('agrees on the boundary shapes each rung is built around', () => {
    const all = (status: string) => SYLLABUS.map((r) => ({ ...r, status }));
    const shapes: { name: string; rows: CoverageRow[] }[] = [
      { name: 'everything untouched', rows: all('not_started') },
      { name: 'everything opened', rows: all('learning') },
      { name: 'everything at depth', rows: all('revising') },
      { name: 'everything exam_ready', rows: all('exam_ready') },
      {
        name: 'VARC one from clear — rung 1, singular',
        rows: SYLLABUS.map((r, i) => ({ ...r, status: r.section === 'VARC' && i % 9 === 0 ? 'not_started' : 'learning' })),
      },
      {
        name: 'DILR clear, none at depth — rung 2, second branch',
        rows: SYLLABUS.map((r) => ({ ...r, status: r.section === 'DILR' ? 'learning' : 'not_started' })),
      },
      {
        name: 'DILR clear, some at depth — rung 2, first branch',
        rows: SYLLABUS.map((r, i) => ({ ...r, status: r.section === 'DILR' ? (i % 2 ? 'revising' : 'learning') : 'not_started' })),
      },
      {
        name: 'opened but not covered — the whole section at learning',
        rows: SYLLABUS.map((r) => ({ ...r, status: r.section === 'QA' ? 'learning' : 'not_started' })),
      },
      {
        name: 'covered but not at revision depth',
        rows: SYLLABUS.map((r) => ({ ...r, status: r.section === 'QA' ? 'practicing' : 'not_started' })),
      },
    ];
    for (const { name, rows } of shapes) {
      for (const sections of SECTION_COMBOS) {
        for (const dates of DATE_SETS) {
          const { old, migrated } = both(rows, sections, false, dates);
          expect(migrated, `${name} / [${sections}] / ${dates.length} dates`).toBe(old);
        }
      }
    }
  });

  it('agrees when habit-track rows share the table', () => {
    // topic_coverage holds two universes. The pre-migration code ignored
    // MOCKS/READING by section; the migrated code scopes by the canonical topic
    // predicate. If those ever disagree, a "% of syllabus" claim counts a habit
    // track — the 111% Knowledge defect, one table over.
    const rows: CoverageRow[] = [
      ...seededRows(7),
      ...MOCK_PREP_UNITS.map((topic) => ({ topic, section: 'MOCKS', status: 'exam_ready' })),
    ];
    for (const sections of SECTION_COMBOS) {
      for (const dates of DATE_SETS) {
        const { old, migrated } = both(rows, sections, false, dates);
        expect(migrated, `[${sections}]`).toBe(old);
      }
    }
  });

  it('agrees on a student with no coverage rows at all', () => {
    for (const dates of DATE_SETS) {
      for (const sections of SECTION_COMBOS) {
        for (const isRest of [false, true]) {
          const { old, migrated } = both([], sections, isRest, dates);
          expect(migrated, `[${sections}] / ${dates.length} dates`).toBe(old);
        }
      }
    }
  });

  it('agrees on a student with no daily reports', () => {
    for (const seed of [3, 11, 29]) {
      for (const sections of SECTION_COMBOS) {
        const { old, migrated } = both(seededRows(seed), sections, false, []);
        expect(migrated, `seed=${seed} [${sections}]`).toBe(old);
      }
    }
    // And with neither coverage nor reports: the honest answer is silence.
    expect(coverageInsight({ coverage: [], todaySections: ['QA'], isRest: false, logDates: [], today: TODAY })).toBeNull();
  });

  it('agrees on rest days and on the 45-of-46 near-complete state', () => {
    const nearComplete = SYLLABUS.map((r, i) => ({ ...r, status: i === 45 ? 'not_started' : 'revising' }));
    const complete = SYLLABUS.map((r) => ({ ...r, status: 'revising' }));
    for (const rows of [nearComplete, complete]) {
      for (const sections of SECTION_COMBOS) {
        for (const isRest of [true, false]) {
          for (const dates of DATE_SETS) {
            const { old, migrated } = both(rows, sections, isRest, dates);
            expect(migrated).toBe(old);
          }
        }
      }
    }
  });
});

// ── PART 2 — FAIL CLOSED ON UNKNOWN EVIDENCE ────────────────────────────────

describe('0C.3a — unknown evidence fails closed, it is never silently ignored', () => {
  it('turns a syllabus fact UNKNOWN when a row names a topic we do not recognise', () => {
    // A retired or misspelled topic is not a row to skip. Skipping it changes
    // the denominator silently; refusing the fact does not.
    const rows: CoverageRow[] = [
      ...SYLLABUS.filter((r) => r.section === 'QA').map((r) => ({ ...r, status: 'learning' })),
      { topic: 'Vedic Maths Shortcuts', section: 'QA', status: 'exam_ready' },
    ];
    const line = coverageInsight({ coverage: rows, todaySections: ['QA'], isRest: false, logDates: FOUR_DAYS, today: TODAY });
    // The QA section fact declines; nothing else can be said about today, so
    // the line falls through to the day count rather than inventing a number.
    expect(line).toBe("Day counted — that's 4 logged days of your preparation on record.");
    expect(line).not.toContain('QA');
  });

  it('does not let an unrecognised topic reach a percentage', () => {
    const rows: CoverageRow[] = [{ topic: 'Not A Real Topic', section: 'QA', status: 'learning' }];
    const line = coverageInsight({ coverage: rows, todaySections: ['Mock'], isRest: false, logDates: FOUR_DAYS, today: TODAY });
    expect(line).toBe("Day counted — that's 4 logged days of your preparation on record.");
  });
});

// ── PART 3 — CLASSIFIED SEMANTIC DEFECT ─────────────────────────────────────

describe('0C.3a — the row-count denominator: a known defect, not a parity failure', () => {
  // Founder ruling, 18 Aug: "Canonical denominator = 46 exam-syllabus topics
  // (28 QA + 9 VARC + 9 DILR). rows.length must never be used as a syllabus
  // denominator." And: "If old output is semantically wrong, classify that
  // divergence explicitly as a known defect. Do not falsify the canonical fact
  // to reproduce it."
  //
  // The fixture is the real shape of production student 50b0ad71 (3 logs, last
  // 26 Jul): 16 rows of 46 — 7 QA, 4 VARC, 5 DILR. Rows exist only where a task
  // tick made one, because /complete-task upserts a single row on demand while
  // onboarding seeds the whole matrix. Any student who skips the onboarding
  // matrix and then ticks tasks lands in this shape.
  const qa = SYLLABUS.filter((r) => r.section === 'QA');
  const varc = SYLLABUS.filter((r) => r.section === 'VARC');
  const dilr = SYLLABUS.filter((r) => r.section === 'DILR');
  const PARTIAL: CoverageRow[] = [
    ...qa.slice(0, 7).map((r, i) => ({ ...r, status: i < 6 ? 'learning' : 'not_started' })),
    ...varc.slice(0, 4).map((r) => ({ ...r, status: 'learning' })),
    ...dilr.slice(0, 5).map((r) => ({ ...r, status: 'learning' })),
  ];

  it('DEFECT: claimed a section was in sight with 22 of its 28 topics untouched', () => {
    const { old, migrated } = both(PARTIAL, ['QA'], false, FOUR_DAYS);
    expect(old).toBe('Just 1 QA topic left untouched — the whole section is in sight.');
    expect(migrated).toBe('QA: 6 of 28 topics opened — 21% of the section on the board.');
    expect(migrated).not.toBe(old);
  });

  it('DEFECT: fired the wrong RUNG, not merely a wrong number', () => {
    // The student is told breadth is finished and to move to depth, with 5 of
    // 9 VARC topics never touched. This is the worst of the four: a false
    // claim, not a skewed percentage.
    const { old, migrated } = both(PARTIAL, ['VARC'], false, FOUR_DAYS);
    expect(old).toBe("Every VARC topic is opened — nothing untouched. Now it's depth, not coverage.");
    expect(migrated).toBe('VARC: 4 of 9 topics opened — 44% of the section on the board.');
  });

  it('DEFECT: overstated whole-syllabus coverage by 61 percentage points', () => {
    const { old, migrated } = both(PARTIAL, ['Mock'], false, FOUR_DAYS);
    expect(old).toBe('Across the syllabus: 15 of 16 topics opened (94%).');
    expect(migrated).toBe('Across the syllabus: 15 of 46 topics opened (33%).');
  });

  it('DEFECT: ranked the wrong section, because every section looked near-complete', () => {
    const { old, migrated } = both(PARTIAL, ['QA', 'VARC', 'DILR'], false, FOUR_DAYS);
    expect(old).toBe('Just 1 QA topic left untouched — the whole section is in sight.');
    expect(migrated).toBe('DILR: 5 of 9 topics opened — 56% of the section on the board.');
  });

  it('the divergence is confined to partial matrices and nothing else', () => {
    // The classification has to be provable, not asserted. Every divergence in
    // the whole corpus must come from a student whose row count is short of the
    // canonical size — if one ever appears on a fully-seeded student, the
    // migration is wrong and Part 1 fails.
    const partials = [1, 2, 16, 30, 45].map((n) => firstN(n, (i) => (i % 3 ? 'learning' : 'not_started')));
    let diverged = 0;
    for (const rows of partials) {
      for (const sections of SECTION_COMBOS) {
        const { old, migrated } = both(rows, sections, false, FOUR_DAYS);
        if (old !== migrated) diverged++;
      }
    }
    expect(diverged, 'partial matrices are expected to diverge — that is the defect').toBeGreaterThan(0);
  });

  it('a 46-row matrix never diverges, however the statuses fall', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rows = seededRows(seed * 7);
      for (const sections of SECTION_COMBOS) {
        const { old, migrated } = both(rows, sections, false, FOUR_DAYS);
        expect(migrated, `seed=${seed} [${sections}]`).toBe(old);
      }
    }
  });
});

// ── PART 4 — ONE PRODUCER ───────────────────────────────────────────────────

describe('0C.3a — log-insight no longer calculates anything', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/log-insight.ts'), 'utf8');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

  it('applies no ladder predicate of its own', () => {
    for (const fn of ['isOpened(', 'isCovered(', 'isAtRevisionDepth(']) {
      expect(code, `log-insight must not apply ${fn} — the registry does`).not.toContain(fn);
    }
  });

  it('computes no percentage of its own', () => {
    // Every ratio the student sees comes from a fact with a declared numerator,
    // denominator and valid range. Article 5.
    expect(code).not.toMatch(/\*\s*100/);
    expect(code).not.toMatch(/Math\.round\s*\(/);
  });

  it('counts no rows of its own', () => {
    expect(code).not.toMatch(/\.filter\([^)]*\)\.length/);
    expect(code).not.toMatch(/rows\.length/);
  });

  it('gets every number from the registry', () => {
    const asked = [...code.matchAll(/getFact\('([a-z0-9_]+)'\)/g)].map((m) => m[1]);
    expect(new Set(asked)).toEqual(new Set([
      'section_opened_units', 'section_untouched_units', 'section_at_depth_units',
      'section_opened_pct', 'syllabus_opened_units', 'syllabus_opened_pct',
      'logged_days_last_7', 'logged_days_total',
    ]));
  });

  it('constructs no date and reads no clock', () => {
    expect(code).not.toMatch(/new Date\(\)/);
    expect(code).not.toMatch(/Date\.now\(\)/);
  });
});
