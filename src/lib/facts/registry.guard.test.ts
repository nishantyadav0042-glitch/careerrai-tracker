import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { FACTS, factKeys, getFact } from './registry';
import { CANONICAL_SOURCES } from './canonical';
import { EXAM_SYLLABUS_TOPICS, MOCK_PREP_UNITS } from '../topics-constants';

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

describe('12 — infrastructure only: nothing consumes the registry yet', () => {
  it('no route or component imports it', () => {
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
    expect(offenders, '0C.2.2 is infrastructure — consumers migrate in 0C.3').toEqual([]);
  });
});
