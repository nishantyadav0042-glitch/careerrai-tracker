import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { FACTS, factKeys, getFact } from './registry';
import { CANONICAL_SOURCES } from './canonical';
import { EXAM_SYLLABUS_TOPICS, MOCK_PREP_UNITS, KNOWLEDGE_GRAPH } from '../topics-constants';

const SECTION_FIXTURE_QA: string[] =
  KNOWLEDGE_GRAPH.find((s) => s.id === 'QA')!.groups.flatMap((g) => g.units);

// ── 0C.2.2 — THE FACT REGISTRY'S OWN LAWS ───────────────────────────────────
//
// The registry is the enforcement mechanism for docs/METRIC-CONSTITUTION.md.
// These guards are what make it enforcement rather than documentation.
//
// Written RED before the registry existed. Every one of them encodes a defect
// this codebase has actually paid for:
//
//   · one producer per fact        — 11 implementations of "syllabus coverage"
//   · membership → UNKNOWN         — the 111% Knowledge percentage
//   · no clamp inside a producer   — P0-C's Math.min hiding a regression
//   · canonical day only           — 5 definitions of "today"
//   · log ≠ tap                    — the founder's tap-vs-combined contract
//   · self-report immutable        — a repeater's own words must survive evidence
//   · no new data source           — 0B's boundary, restated at fact level

const SRC = join(process.cwd(), 'src');
const factFiles = readdirSync(join(SRC, 'lib/facts'))
  .filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
  .map((f) => join(SRC, 'lib/facts', f));
// Comments explain the rules (including why clamping is banned, which means
// quoting `Math.min(x, 46)`); only executable lines can break them.
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const factSrc = factFiles.map((f) => stripComments(readFileSync(f, 'utf8'))).join('\n');

describe('1 — one producer per fact', () => {
  it('every key is unique', () => {
    const keys = factKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every fact declares exactly one produce function', () => {
    for (const f of FACTS) {
      expect(typeof f.produce, `${f.key} must have a producer`).toBe('function');
    }
  });
});

describe('3 — no duplicate definitions, no umbrella facts', () => {
  it('rejects generic umbrella keys', () => {
    // "Different meaning → different fact key." A container named for a bundle
    // of meanings is how duplication re-enters wearing a registry badge — the
    // exact correction the founder made to the proposed self_reported_baseline.
    const banned = /^(baseline|progress|completion|consistency|performance|coverage_total|self_reported_baseline)$/;
    for (const k of factKeys()) expect(k, `${k} is an umbrella name`).not.toMatch(banned);
  });

  it('no two facts share a meaning string', () => {
    const meanings = FACTS.map((f) => f.meaning.trim().toLowerCase());
    expect(new Set(meanings).size).toBe(meanings.length);
  });
});

describe('4 — out-of-universe input yields UNKNOWN, never a repaired number', () => {
  it('a non-syllabus topic cannot enter a coverage numerator', () => {
    const f = getFact('syllabus_coverage_units');
    const contaminated = [
      ...EXAM_SYLLABUS_TOPICS.map((topic) => ({ topic, status: 'practicing' })),
      { topic: MOCK_PREP_UNITS[0], status: 'practicing' }, // habit unit
    ];
    const r = f.produce({ coverage: contaminated });
    expect(r.known, 'out-of-universe evidence must not produce a fact').toBe(false);
    if (!r.known) expect(r.reason).toBe('out_of_universe');
  });

  it('records the violation rather than swallowing it', () => {
    const f = getFact('syllabus_coverage_units');
    const r = f.produce({ coverage: [{ topic: MOCK_PREP_UNITS[0], status: 'practicing' }] });
    expect(r.known).toBe(false);
    if (!r.known) expect(r.violations.length).toBeGreaterThan(0);
  });

  it('no producer clamps its way to a valid-looking answer', () => {
    // P0-C's lesson: Math.min(x, 46) silently repairs a producer regression.
    // Clamping is presentation behaviour; inside a producer it is evidence
    // laundering.
    expect(factSrc).not.toMatch(/Math\.(min|max)\s*\([^)]*\b(46|100)\b/);
  });
});

describe('5/6 — percentages and syllabus membership', () => {
  it('a ratio fact declares numerator, denominator and range', () => {
    for (const f of FACTS.filter((x) => x.unit === 'ratio_pct')) {
      expect(f.numerator, `${f.key} numerator`).toBeTruthy();
      expect(f.denominator, `${f.key} denominator`).toBeTruthy();
      expect(f.validRange, `${f.key} range`).toEqual([0, 100]);
    }
  });

  it('a full-coverage student reads exactly 100, never more', () => {
    const f = getFact('syllabus_coverage_pct');
    const all = EXAM_SYLLABUS_TOPICS.map((topic) => ({ topic, status: 'exam_ready' }));
    const r = f.produce({ coverage: all });
    expect(r.known).toBe(true);
    if (r.known) expect(r.value).toBe(100);
  });

  it('an empty coverage matrix is UNKNOWN, not 0%', () => {
    // 42 students carry no coverage rows. Zero would be a claim; we have none.
    const r = getFact('syllabus_coverage_pct').produce({ coverage: [] });
    expect(r.known).toBe(false);
    if (!r.known) expect(r.reason).toBe('no_evidence');
  });

  it('the denominator comes from the canonical syllabus, never a literal', () => {
    expect(factSrc).toContain('EXAM_SYLLABUS_TOPICS');
    expect(factSrc).not.toMatch(/\/\s*46\b/); // no hand-written /46
  });
});

describe('7 — one canonical time boundary', () => {
  it('no fact producer constructs its own date', () => {
    // Facts are pure; the CareerRai day arrives as an argument from the caller,
    // which gets it from getLogDateString(). Five definitions of "today" is
    // what this prevents.
    expect(factSrc).not.toMatch(/new Date\(\)/);
    expect(factSrc).not.toMatch(/toLocaleDateString/);
    expect(factSrc).not.toMatch(/Date\.now\(\)/);
  });

  it('windowed facts declare their basis', () => {
    const windowed = FACTS.filter((f) => f.timeBasis === 'trailing_7_days');
    expect(windowed.length).toBeGreaterThan(0);
    for (const f of windowed) expect(f.meaning.toLowerCase()).toContain('7');
  });
});

describe('8 — the Daily Log is not a tap', () => {
  it('logged_today means a submitted Daily Log', () => {
    const f = getFact('logged_today');
    expect(f.canonicalSource).toBe('dailyLogState');
    expect(f.meaning.toLowerCase()).toContain('daily log');
  });

  it('no daily-log fact reads task completions or taps', () => {
    // The founder's contract: a section/task tap earns a section-scoped
    // insight; a full Daily Log earns the combined one. Collapsing them into
    // one fact would make the two insights indistinguishable downstream.
    for (const f of FACTS.filter((x) => x.key.startsWith('logged_'))) {
      expect(f.canonicalSource, `${f.key} must read the log, not the tick`).toBe('dailyLogState');
      expect(CANONICAL_SOURCES[f.canonicalSource].table).toBe('daily_reports');
    }
  });

  it('a rest-day log still counts as a logged day', () => {
    const r = getFact('logged_days_last_7').produce({
      logDates: ['2026-08-18', '2026-08-17'], today: '2026-08-18',
    });
    expect(r.known).toBe(true);
    if (r.known) expect(r.value).toBe(2);
  });

  it('never exceeds the window, however many rows arrive', () => {
    const r = getFact('logged_days_last_7').produce({
      logDates: ['2026-08-18', '2026-08-18', '2026-08-17', '2026-08-11', '2026-08-01'],
      today: '2026-08-18',
    });
    expect(r.known).toBe(true);
    if (r.known) expect(r.value).toBeLessThanOrEqual(7);
    if (r.known) expect(r.value).toBe(2); // duplicates collapse, out-of-window drops
  });
});

describe('9 — the section dimension is a parameter, not three facts', () => {
  it('has no per-section producers', () => {
    for (const bad of ['qa_coverage_units', 'varc_coverage_units', 'dilr_coverage_units']) {
      expect(factKeys(), `${bad} must be a parameter, not a fact`).not.toContain(bad);
    }
  });

  it('takes the section as input', () => {
    const f = getFact('section_coverage_units');
    const r = f.produce({
      coverage: EXAM_SYLLABUS_TOPICS.map((topic) => ({ topic, status: 'practicing' })),
      section: 'QA',
    });
    expect(r.known).toBe(true);
    if (r.known) expect(r.value).toBe(28); // the verified QA denominator
  });
});

describe('10 — self-report is immutable and never confused with observation', () => {
  it('is typed as FACT, not DERIVED_FACT', () => {
    for (const k of ['self_reported_last_year_percentile', 'self_reported_weakest_section', 'is_repeater']) {
      expect(getFact(k).semanticType).toBe('FACT');
    }
  });

  it('carries no observed_* counterpart in the same key', () => {
    // A repeater's own words survive whatever the evidence later shows. The
    // Insight Engine may reconcile them; it may never overwrite them.
    for (const f of FACTS.filter((x) => x.key.startsWith('self_reported_'))) {
      expect(f.timeBasis).toBe('immutable_declaration');
      expect(f.meaning.toLowerCase()).toMatch(/said|declared|reported/);
      // Provenance must cite what the student SAID, never a record of what
      // happened — this caught the registry mislabelling all three as
      // dailyLogState, which would have made every self-report claim cite
      // daily_reports.
      expect(f.canonicalSource, `${f.key} provenance`).toBe('selfReportedDeclaration');
      expect(CANONICAL_SOURCES[f.canonicalSource].table).toBe('profiles');
    }
  });
});

describe('11 — no accidental new data source', () => {
  it('every fact names a source already declared canonical in 0B', () => {
    for (const f of FACTS) {
      expect(CANONICAL_SOURCES[f.canonicalSource], `${f.key} source`).toBeTruthy();
    }
  });
});

describe('12 — only APPROVED surfaces consume the registry', () => {
  // This was "nothing consumes it yet" while 0C.2.2 was pure infrastructure.
  // That premise is exactly what 0C.3 supersedes: log-insight.ts migrated in
  // 0C.3a, and log-daily's first-log rule in 0C.3b-i. The guard is not
  // removed, it is tightened — an ALLOWLIST is stronger than "none", because
  // "none" would have to be deleted the moment a consumer was approved, taking
  // all control with it.
  //
  // Adding a route or component here means a founder ruling cleared it. The
  // Fact Registry is not a library anyone may reach for; every consumer is a
  // migration with a parity proof behind it.
  const APPROVED = [
    'src/app/api/logging/log-daily/route.ts', // 0C.3b-i — rule 1, first log
  ];

  it('no unapproved route or component imports it', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) {
          const s = readFileSync(p, 'utf8');
          if (/from ['"][^'"]*facts\/registry['"]/.test(s)) offenders.push(p.replace(`${process.cwd()}/`, ''));
        }
      }
    };
    for (const d of ['app', 'components']) if (existsSync(join(SRC, d))) walk(join(SRC, d));
    expect(offenders.filter((f) => !APPROVED.includes(f)),
      'a new registry consumer needs a ruling and a parity proof').toEqual([]);
  });

  it('every approved consumer actually exists and still consumes it', () => {
    // A stale allowlist entry would silently widen the gate.
    for (const f of APPROVED) {
      expect(existsSync(join(process.cwd(), f)), `${f} is listed but missing`).toBe(true);
      expect(readFileSync(join(process.cwd(), f), 'utf8'), `${f} no longer consumes the registry`)
        .toMatch(/from ['"][^'"]*facts\/registry['"]/);
    }
  });
});

describe('25 — opened, covered and revision-depth are permanently separate families', () => {
  // Founder law, 18 Aug: "Opened != Covered." They are different rungs of one
  // ladder and no producer may substitute one for another. This is the law that
  // stopped 0C.3a: log-insight speaks the opened family, and the registry had
  // registered only the covered family.
  it('an *_opened_* fact uses isOpened, never isCovered', () => {
    for (const f of FACTS.filter((x) => x.key.includes('_opened_'))) {
      expect(f.numerator?.toLowerCase(), `${f.key}`).toContain('isopened');
      expect(f.numerator?.toLowerCase(), `${f.key} must not claim isCovered`).not.toContain('iscovered');
    }
  });

  it('a *_coverage_* fact uses isCovered, never isOpened', () => {
    for (const f of FACTS.filter((x) => x.key.includes('_coverage_'))) {
      expect(f.numerator?.toLowerCase(), `${f.key}`).toContain('iscovered');
    }
  });

  it('the three bars produce genuinely different counts on the same rows', () => {
    // 'learning' is opened but not covered; 'revising' is all three. If any two
    // families ever agree on this fixture, one has silently adopted the other.
    const rows = [
      { topic: EXAM_SYLLABUS_TOPICS[0], status: 'learning' },
      { topic: EXAM_SYLLABUS_TOPICS[1], status: 'practicing' },
      { topic: EXAM_SYLLABUS_TOPICS[2], status: 'revising' },
      ...EXAM_SYLLABUS_TOPICS.slice(3).map((topic) => ({ topic, status: 'not_started' })),
    ];
    const opened = getFact('syllabus_opened_units').produce({ coverage: rows });
    const covered = getFact('syllabus_coverage_units').produce({ coverage: rows });
    expect(opened.known && covered.known).toBe(true);
    if (opened.known && covered.known) {
      expect(opened.value).toBe(3);   // learning + practicing + revising
      expect(covered.value).toBe(2);  // practicing + revising
      expect(opened.value).not.toBe(covered.value);
    }
  });

  it('untouched is the exact complement of opened within a section', () => {
    const qa = EXAM_SYLLABUS_TOPICS.filter((t) => SECTION_FIXTURE_QA.includes(t));
    const rows = qa.map((topic, i) => ({ topic, status: i < 5 ? 'learning' : 'not_started' }));
    const openedR = getFact('section_opened_units').produce({ coverage: rows, section: 'QA' });
    const untouchedR = getFact('section_untouched_units').produce({ coverage: rows, section: 'QA' });
    expect(openedR.known && untouchedR.known).toBe(true);
    if (openedR.known && untouchedR.known) {
      expect(openedR.value + untouchedR.value).toBe(qa.length);
    }
  });

  it('logged_days_total is lifetime and declares no window', () => {
    const f = getFact('logged_days_total');
    expect(f.timeBasis).toBe('point_in_time');
    expect(f.validRange).toBeUndefined();
    const r = f.produce({ logDates: ['2026-08-18', '2026-08-18', '2026-08-01'] });
    expect(r.known).toBe(true);
    if (r.known) expect(r.value).toBe(2); // distinct dates, never rows
  });
});

describe('26 — one application of each ladder predicate, ever', () => {
  // Founder ruling, 18 Aug, granting the two percentage facts: "They must be
  // derived from the canonical opened-unit facts. Do NOT create a second
  // implementation of isOpened."
  //
  // A percentage that recounts the rows is a second producer of the same
  // semantic fact wearing a different key — the exact duplication this registry
  // exists to end, re-entering through the door marked "it's just a ratio".
  //
  // Counted at CALL SITES, not declared in prose: the ratio facts must call the
  // unit fact's own producer and divide.
  const calls = (fn: string) => (factSrc.match(new RegExp(`\\b${fn}\\(`, 'g')) ?? []).length;

  it('isOpened is applied exactly twice — syllabus and section', () => {
    expect(calls('isOpened')).toBe(2);
  });

  it('isCovered is applied exactly twice — syllabus and section', () => {
    expect(calls('isCovered')).toBe(2);
  });

  it('isAtRevisionDepth is applied exactly once', () => {
    expect(calls('isAtRevisionDepth')).toBe(1);
  });

  it('every ratio fact delegates to a unit fact producer', () => {
    for (const f of FACTS.filter((x) => x.unit === 'ratio_pct')) {
      expect(f.numerator, `${f.key} must cite the unit fact it divides`).toMatch(/via \w+|inner/i);
    }
  });

  it('a percentage moves in lockstep with its unit fact', () => {
    const rows = EXAM_SYLLABUS_TOPICS.map((topic, i) => ({ topic, status: i < 23 ? 'learning' : 'not_started' }));
    const units = getFact('syllabus_opened_units').produce({ coverage: rows });
    const pct = getFact('syllabus_opened_pct').produce({ coverage: rows });
    expect(units.known && pct.known).toBe(true);
    if (units.known && pct.known) {
      expect(units.value).toBe(23);
      expect(pct.value).toBe(Math.round((units.value / EXAM_SYLLABUS_TOPICS.length) * 100));
      expect(pct.value).toBe(50);
    }
  });
});

describe('27 — the denominator is the syllabus, never the row count', () => {
  // THE 0C.3a STOP, made permanent. log-insight.ts divided by `rows.length` —
  // "however many topic_coverage rows this student happens to have" — and told
  // a student with 7 QA rows that they had opened 86% of QA. The truth was 21%.
  //
  // Fixtures below are the real shape of production student 50b0ad71: 16 rows
  // of 46, because /complete-task upserts one row on demand while onboarding
  // seeds the whole matrix.
  const QA_TOPICS = KNOWLEDGE_GRAPH.find((s) => s.id === 'QA')!.groups.flatMap((g) => g.units);
  const PARTIAL_QA = QA_TOPICS.slice(0, 7).map((topic, i) => ({ topic, status: i < 6 ? 'learning' : 'not_started' }));

  it('divides by the section size, not by how many rows arrived', () => {
    const r = getFact('section_opened_pct').produce({ coverage: PARTIAL_QA, section: 'QA' });
    expect(r.known).toBe(true);
    if (r.known) {
      expect(r.value).toBe(21);      // 6 / 28
      expect(r.value).not.toBe(86);  // 6 / 7 — the defect
    }
  });

  it('divides by 46, not by how many syllabus rows arrived', () => {
    const r = getFact('syllabus_opened_pct').produce({ coverage: PARTIAL_QA });
    expect(r.known).toBe(true);
    if (r.known) expect(r.value).toBe(Math.round((6 / EXAM_SYLLABUS_TOPICS.length) * 100)); // 13
  });

  it('counts the untouched remainder against the section, not the rows', () => {
    const r = getFact('section_untouched_units').produce({ coverage: PARTIAL_QA, section: 'QA' });
    expect(r.known).toBe(true);
    if (r.known) {
      expect(r.value).toBe(22);     // 28 − 6
      expect(r.value).not.toBe(1);  // 7 − 6 — the defect, which read as "in sight"
    }
  });

  it('no ratio fact declares a row count as its denominator', () => {
    for (const f of FACTS.filter((x) => x.unit === 'ratio_pct')) {
      expect(f.denominator!.toLowerCase(), `${f.key}`).not.toMatch(/rows?\.length|number of rows|however many/);
      expect(f.denominator!.toLowerCase(), `${f.key}`).toMatch(/derived|canonical/);
    }
  });
});

describe('28 — MISSING ROW is not not_started', () => {
  // Founder ruling, 18 Aug: "For a topic with no coverage row: UNKNOWN. For a
  // topic with an actual coverage row whose state is not_started: KNOWN NOT
  // OPENED. Those are not the same thing." Same lesson as daily-insight kind 6.
  const QA_TOPICS = KNOWLEDGE_GRAPH.find((s) => s.id === 'QA')!.groups.flatMap((g) => g.units);

  it('no producer defaults a missing row to a status', () => {
    // prep-memory.ts:330's `?? 'not_started'` is how absence became measurement.
    // It must be structurally impossible inside facts/.
    expect(factSrc).not.toMatch(/\?\?\s*['"]not_started['"]/);
    expect(factSrc).not.toMatch(/=\s*['"]not_started['"]/);
  });

  it('the untouched fact says it unions the two states, and does not claim "never started"', () => {
    const f = getFact('section_untouched_units');
    expect(f.meaning.toLowerCase()).toContain('not known to be opened');
    expect(f.meaning.toLowerCase()).toContain('no coverage row');
    expect(f.meaning.toLowerCase(), 'a union may not be described as a measurement')
      .not.toContain('never started');
  });

  it('a declared not_started and an absent row are both excluded from opened', () => {
    // Same exclusion, different epistemics — the count is right either way; it
    // is the CLAIM about the remainder that must stay honest.
    const declared = getFact('section_opened_units')
      .produce({ coverage: QA_TOPICS.map((topic) => ({ topic, status: 'not_started' })), section: 'QA' });
    const absent = getFact('section_opened_units')
      .produce({ coverage: [{ topic: QA_TOPICS[0], status: 'not_started' }], section: 'QA' });
    expect(declared.known && absent.known).toBe(true);
    if (declared.known && absent.known) {
      expect(declared.value).toBe(0);
      expect(absent.value).toBe(0);
    }
  });

  it('an empty matrix stays UNKNOWN rather than becoming a measured zero', () => {
    for (const key of ['syllabus_opened_units', 'syllabus_opened_pct']) {
      const r = getFact(key).produce({ coverage: [] });
      expect(r.known, key).toBe(false);
      if (!r.known) expect(r.reason).toBe('no_evidence');
    }
    const sec = getFact('section_opened_pct').produce({ coverage: [], section: 'QA' });
    expect(sec.known).toBe(false);
  });
});

describe('29 — logged_days_total counts days, and the invariant is enforced not assumed', () => {
  it('is immune to duplicate rows for one date', () => {
    // The route passes count(*) of daily_reports today. That is only a day
    // count because (student_id, report_date) is unique. This producer does not
    // depend on that: it counts DATES.
    const r = getFact('logged_days_total').produce({
      logDates: ['2026-08-18', '2026-08-18', '2026-08-18', '2026-08-01'],
    });
    expect(r.known).toBe(true);
    if (r.known) expect(r.value).toBe(2);
  });

  it('the uniqueness invariant is declared in the schema and never dropped', () => {
    // Proven, not documented. If a future migration drops this constraint, the
    // count(*) reading in any un-migrated caller silently becomes a row count.
    const migDir = join(process.cwd(), 'supabase/migrations');
    const migrations = readdirSync(migDir).filter((f) => f.endsWith('.sql'));
    const all = migrations.map((f) => readFileSync(join(migDir, f), 'utf8')).join('\n');
    expect(all, 'daily_reports must declare UNIQUE (student_id, report_date)')
      .toMatch(/UNIQUE\s*\(\s*student_id\s*,\s*report_date\s*\)/i);
    expect(all, 'nothing may drop it')
      .not.toMatch(/DROP\s+CONSTRAINT[^;]*student_id_report_date/i);
  });

  it('ignores empty date strings rather than counting them as a day', () => {
    const r = getFact('logged_days_total').produce({ logDates: ['', '2026-08-18'] });
    expect(r.known).toBe(true);
    if (r.known) expect(r.value).toBe(1);
  });
});

describe('30 — one topic, one row: a numerator may never outrun its denominator', () => {
  // Found in production during 0C.3a, not imagined. topic_coverage is unique on
  // (student_id, SECTION, topic), so a mis-sectioned row duplicates a topic
  // freely. Student 352d0c81 — 21 logs, active — carries 'Vocabulary' under
  // both VARC and General, both `revising`.
  //
  // Counting rows would have given that student 10 opened VARC topics out of 9,
  // an untouched count of −1, and "111% of the section on the board". The same
  // defect this registry was built to end, arriving through a door nobody was
  // watching.
  const QA = KNOWLEDGE_GRAPH.find((s) => s.id === 'QA')!.groups.flatMap((g) => g.units);
  const VARC = KNOWLEDGE_GRAPH.find((s) => s.id === 'VARC')!.groups.flatMap((g) => g.units);

  it('collapses a topic stated twice in agreement', () => {
    const rows = [
      ...VARC.map((topic) => ({ topic, status: 'revising' })),
      { topic: 'Vocabulary', status: 'revising' }, // the real production shape
    ];
    const opened = getFact('section_opened_units').produce({ coverage: rows, section: 'VARC' });
    const untouched = getFact('section_untouched_units').produce({ coverage: rows, section: 'VARC' });
    const pct = getFact('section_opened_pct').produce({ coverage: rows, section: 'VARC' });
    expect(opened.known && untouched.known && pct.known).toBe(true);
    if (opened.known && untouched.known && pct.known) {
      expect(opened.value).toBe(9);      // not 10
      expect(untouched.value).toBe(0);   // not −1
      expect(pct.value).toBe(100);       // not 111
    }
  });

  it('refuses when two rows contradict each other about one topic', () => {
    // Not a winner to pick — a disagreement. No producer may resolve it.
    const rows = [
      ...VARC.map((topic) => ({ topic, status: 'learning' })),
      { topic: 'Vocabulary', status: 'not_started' },
    ];
    const r = getFact('section_opened_units').produce({ coverage: rows, section: 'VARC' });
    expect(r.known).toBe(false);
    if (!r.known) {
      expect(r.reason).toBe('invalid_input');
      expect(r.violations[0]).toContain('Vocabulary');
    }
  });

  it('no coverage count can exceed its membership universe, however rows arrive', () => {
    const duplicated = [
      ...QA.map((topic) => ({ topic, status: 'exam_ready' })),
      ...QA.map((topic) => ({ topic, status: 'exam_ready' })),
      ...QA.map((topic) => ({ topic, status: 'exam_ready' })),
    ];
    for (const key of ['section_opened_units', 'section_coverage_units', 'section_at_depth_units']) {
      const r = getFact(key).produce({ coverage: duplicated, section: 'QA' });
      expect(r.known, key).toBe(true);
      if (r.known) expect(r.value, key).toBe(28);
    }
    for (const key of ['syllabus_opened_pct', 'syllabus_coverage_pct']) {
      const r = getFact(key).produce({ coverage: duplicated });
      expect(r.known, key).toBe(true);
      if (r.known) expect(r.value, key).toBeLessThanOrEqual(100);
    }
  });

  it('untouched and remaining can never go negative', () => {
    const duplicated = [...QA, ...QA].map((topic) => ({ topic, status: 'revising' }));
    for (const key of ['section_untouched_units', 'section_topics_remaining']) {
      const r = getFact(key).produce({ coverage: duplicated, section: 'QA' });
      expect(r.known, key).toBe(true);
      if (r.known) expect(r.value, key).toBe(0);
    }
  });

  it('deduplication is not filtering: an unrecognised topic still refuses the fact', () => {
    // Collapsing a repeat and dropping an unknown are different acts. Only the
    // first is allowed.
    const r = getFact('section_opened_units').produce({
      coverage: [...VARC.map((topic) => ({ topic, status: 'learning' })), { topic: 'Retired Topic', status: 'learning' }],
      section: 'VARC',
    });
    expect(r.known).toBe(false);
    if (!r.known) expect(r.reason).toBe('out_of_universe');
  });
});
