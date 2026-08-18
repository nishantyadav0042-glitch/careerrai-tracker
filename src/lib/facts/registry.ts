// ── 0C.2.2 — The canonical fact registry ────────────────────────────────────
//
// The smallest set of facts that can be trusted without qualification.
//
// Not the smallest NUMBER — the founder's correction, and the right one. A
// fact earns its place by having a ruled definition, a verified denominator, a
// single authority, and a Phase-1 consumer. A fact with no consumer is
// speculative inventory; a fact with an unruled definition is a future audit.
//
// EXCLUDED, each for a stated reason (docs/0C-2-1-FACT-INVENTORY.md):
//   · consistency_pct        — six competing formulas, none ruled (Constitution B4)
//   · avoidance              — an INTERPRETATION, not a fact (B5)
//   · postponement           — daily_routines.swapped_out conflates a busy-day
//                              deferral with a deliberate swap; 48 of 91 rows
//                              carry the busy-day shape, and the write path
//                              self-declares "no invariant"
//   · all mock facts         — 22 debriefs, 18 students, only 11 complete.
//                              MOCK INSIGHT DATA IS NOT READY.
//   · plan completion ratio  — three unruled windows, AND fullyDone counts a
//                              half-tick as done while creditedHours counts it
//                              as 0.5. Blocked until that is ruled.
//   · hours / weightage coverage — different facts needing different keys
//                              (Constitution S3); no Phase-1 consumer
//   · study_days_last_7      — clean and ruled, but nothing consumes it yet
//                              (distinct from logged_days_total, which now has
//                              one: log-insight's "N logged days on record")
//   · self_reported_had_buddy — no Phase-1 consumer; not invented for symmetry
//
// Producers are PURE: no database, no clock, no model. Data arrives as
// arguments, which is what 0B's transitive-closure guard makes structurally
// true rather than merely intended.

import {
  EXAM_SYLLABUS_TOPICS, isExamSyllabusTopic, EXAM_SECTION_IDS, KNOWLEDGE_GRAPH,
} from '../topics-constants';
import { isCovered, isOpened, isAtRevisionDepth } from '../coverage-status';
import type { CanonicalQuestion } from './canonical';
import {
  type FactDef, type FactResult, type Provenance, known, unknown,
} from './contract';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFact = FactDef<any, any>;

interface CoverageRow { topic: string; status: string }

function prov(
  factKey: string, version: string, source: CanonicalQuestion, inputs: Record<string, unknown>
): Provenance {
  return { factKey, version, source, inputs };
}

/**
 * Every coverage producer runs this first.
 *
 * A row naming something outside the exam syllabus is not a row to skip — it
 * means the caller's universe disagrees with ours, and a number computed on a
 * disagreed universe is exactly the 111% Knowledge defect. So it is reported
 * and the fact goes UNKNOWN. The producer does NOT filter the row out and
 * carry on: silently discarding bad evidence is the same laundering as
 * silently clamping it.
 */
function checkUniverse(rows: CoverageRow[]): string[] {
  const strays = rows.filter((r) => !isExamSyllabusTopic(r.topic)).map((r) => r.topic);
  return strays.length
    ? [`${strays.length} row(s) outside the exam syllabus universe: ${strays.slice(0, 3).join(', ')}`]
    : [];
}

// ── Coverage ────────────────────────────────────────────────────────────────

const syllabusCoverageUnits: FactDef<{ coverage: CoverageRow[] }, number> = {
  key: 'syllabus_coverage_units',
  version: 'v1',
  semanticType: 'DERIVED_FACT',
  meaning: 'How many exam-syllabus topics the student has studied through at least once.',
  canonicalSource: 'syllabusCoverage',
  unit: 'count',
  timeBasis: 'point_in_time',
  membershipUniverse: 'EXAM_SYLLABUS_TOPICS (46: QA 28 + VARC 9 + DILR 9)',
  numerator: 'topics at isCovered (practicing or beyond)',
  unknownWhen: ['the student has no coverage rows', 'any row falls outside the syllabus universe'],
  produce: ({ coverage }) => {
    const p = prov('syllabus_coverage_units', 'v1', 'syllabusCoverage', { rows: coverage.length });
    const violations = checkUniverse(coverage);
    if (violations.length) return unknown('out_of_universe', p, violations);
    if (coverage.length === 0) return unknown('no_evidence', p);
    return known(coverage.filter((r) => isCovered(r.status)).length, p);
  },
};

const syllabusCoveragePct: FactDef<{ coverage: CoverageRow[] }, number> = {
  key: 'syllabus_coverage_pct',
  version: 'v1',
  semanticType: 'DERIVED_FACT',
  meaning: 'What share of the exam syllabus the student has studied through at least once.',
  canonicalSource: 'syllabusCoverage',
  unit: 'ratio_pct',
  timeBasis: 'point_in_time',
  membershipUniverse: 'EXAM_SYLLABUS_TOPICS',
  numerator: 'topics at isCovered',
  denominator: 'EXAM_SYLLABUS_TOPICS.length — derived, never a literal',
  validRange: [0, 100],
  unknownWhen: ['the student has no coverage rows', 'any row falls outside the syllabus universe'],
  produce: ({ coverage }) => {
    const p = prov('syllabus_coverage_pct', 'v1', 'syllabusCoverage', { rows: coverage.length });
    const inner = syllabusCoverageUnits.produce({ coverage });
    if (!inner.known) return unknown(inner.reason, p, inner.violations);
    // The denominator is the universe itself, so numerator ⊆ denominator holds
    // structurally — the range cannot be exceeded, and needs no clamp to say so.
    return known(Math.round((inner.value / EXAM_SYLLABUS_TOPICS.length) * 100), p);
  },
};

const sectionCoverageUnits: FactDef<{ coverage: CoverageRow[]; section: string }, number> = {
  key: 'section_coverage_units',
  version: 'v1',
  semanticType: 'DERIVED_FACT',
  meaning: 'How many topics in one exam section the student has studied through at least once.',
  canonicalSource: 'syllabusCoverage',
  unit: 'count',
  timeBasis: 'point_in_time',
  membershipUniverse: 'the named exam section within EXAM_SYLLABUS_TOPICS',
  numerator: 'topics in that section at isCovered',
  unknownWhen: ['the section is not an exam section', 'the student has no rows in it'],
  // The section is a PARAMETER, not three separate facts — one definition
  // cannot drift from itself the way qa_/varc_/dilr_ producers would.
  produce: ({ coverage, section }) => {
    const p = prov('section_coverage_units', 'v1', 'syllabusCoverage', { section, rows: coverage.length });
    if (!(EXAM_SECTION_IDS as string[]).includes(section)) {
      return unknown('out_of_universe', p, [`'${section}' is not an exam section`]);
    }
    const violations = checkUniverse(coverage);
    if (violations.length) return unknown('out_of_universe', p, violations);
    const inSection = coverage.filter((r) => sectionOf(r.topic) === section);
    if (inSection.length === 0) return unknown('no_evidence', p);
    return known(inSection.filter((r) => isCovered(r.status)).length, p);
  },
};

const sectionTopicsRemaining: FactDef<{ coverage: CoverageRow[]; section: string }, number> = {
  key: 'section_topics_remaining',
  version: 'v1',
  semanticType: 'DERIVED_FACT',
  meaning: 'How many topics in one exam section the student has not yet studied through.',
  canonicalSource: 'syllabusCoverage',
  unit: 'count',
  timeBasis: 'point_in_time',
  membershipUniverse: 'the named exam section within EXAM_SYLLABUS_TOPICS',
  unknownWhen: ['the section is not an exam section', 'the student has no rows in it'],
  produce: ({ coverage, section }) => {
    const p = prov('section_topics_remaining', 'v1', 'syllabusCoverage', { section, rows: coverage.length });
    const covered = sectionCoverageUnits.produce({ coverage, section });
    if (!covered.known) return unknown(covered.reason, p, covered.violations);
    const total = (TOPICS_BY_SECTION[section] ?? []).length;
    return known(total - covered.value, p);
  },
};

// ── Opened, and revision depth ──────────────────────────────────────────────
//
// Constitution S4, and the law that stopped 0C.3a: "'Covered' means isCovered
// (practicing+). 'Opened' means isOpened (learning+). They are different bars
// and may never share a fact key."
//
// A topic at `learning` is OPENED and NOT COVERED. `log-insight.ts` has always
// counted the opened bar — "QA: 12 of 28 topics opened" — while 0C.2.2
// registered only the covered bar. Migrating it onto the covered family would
// have changed every number it displays under the cover of a refactor. These
// facts exist so the migration can be arithmetic-preserving instead.
//
// The three bars are separate FAMILIES, permanently. No producer may satisfy a
// request for one by answering with another.

const syllabusOpenedUnits: FactDef<{ coverage: CoverageRow[] }, number> = {
  key: 'syllabus_opened_units',
  version: 'v1',
  semanticType: 'DERIVED_FACT',
  meaning: 'How many exam-syllabus topics the student has started at all.',
  canonicalSource: 'syllabusCoverage',
  unit: 'count',
  timeBasis: 'point_in_time',
  membershipUniverse: 'EXAM_SYLLABUS_TOPICS (46: QA 28 + VARC 9 + DILR 9)',
  numerator: 'topics at isOpened (learning or beyond)',
  unknownWhen: ['the student has no coverage rows', 'any row falls outside the syllabus universe'],
  produce: ({ coverage }) => {
    const p = prov('syllabus_opened_units', 'v1', 'syllabusCoverage', { rows: coverage.length });
    const violations = checkUniverse(coverage);
    if (violations.length) return unknown('out_of_universe', p, violations);
    if (coverage.length === 0) return unknown('no_evidence', p);
    return known(coverage.filter((r) => isOpened(r.status)).length, p);
  },
};

const sectionOpenedUnits: FactDef<{ coverage: CoverageRow[]; section: string }, number> = {
  key: 'section_opened_units',
  version: 'v1',
  semanticType: 'DERIVED_FACT',
  meaning: 'How many topics in one exam section the student has started at all.',
  canonicalSource: 'syllabusCoverage',
  unit: 'count',
  timeBasis: 'point_in_time',
  membershipUniverse: 'the named exam section within EXAM_SYLLABUS_TOPICS',
  numerator: 'topics in that section at isOpened (learning or beyond)',
  unknownWhen: ['the section is not an exam section', 'the student has no rows in it'],
  produce: ({ coverage, section }) => {
    const p = prov('section_opened_units', 'v1', 'syllabusCoverage', { section, rows: coverage.length });
    if (!(EXAM_SECTION_IDS as string[]).includes(section)) {
      return unknown('out_of_universe', p, [`'${section}' is not an exam section`]);
    }
    const violations = checkUniverse(coverage);
    if (violations.length) return unknown('out_of_universe', p, violations);
    const inSection = coverage.filter((r) => sectionOf(r.topic) === section);
    if (inSection.length === 0) return unknown('no_evidence', p);
    return known(inSection.filter((r) => isOpened(r.status)).length, p);
  },
};

const sectionUntouchedUnits: FactDef<{ coverage: CoverageRow[]; section: string }, number> = {
  key: 'section_untouched_units',
  version: 'v1',
  semanticType: 'DERIVED_FACT',
  meaning: 'How many topics in one exam section the student has never started.',
  canonicalSource: 'syllabusCoverage',
  unit: 'count',
  timeBasis: 'point_in_time',
  membershipUniverse: 'the named exam section within EXAM_SYLLABUS_TOPICS',
  // The exact complement of section_opened_units, and computed AS that
  // complement rather than by a second pass over the rows — two independent
  // counts of the same ladder is how the eleven coverage producers began.
  unknownWhen: ['the section is not an exam section', 'the student has no rows in it'],
  produce: ({ coverage, section }) => {
    const p = prov('section_untouched_units', 'v1', 'syllabusCoverage', { section, rows: coverage.length });
    const opened = sectionOpenedUnits.produce({ coverage, section });
    if (!opened.known) return unknown(opened.reason, p, opened.violations);
    const total = (TOPICS_BY_SECTION[section] ?? []).length;
    return known(total - opened.value, p);
  },
};

const sectionAtDepthUnits: FactDef<{ coverage: CoverageRow[]; section: string }, number> = {
  key: 'section_at_depth_units',
  version: 'v1',
  semanticType: 'DERIVED_FACT',
  meaning: 'How many topics in one exam section have reached revision depth or beyond.',
  canonicalSource: 'syllabusCoverage',
  unit: 'count',
  timeBasis: 'point_in_time',
  membershipUniverse: 'the named exam section within EXAM_SYLLABUS_TOPICS',
  numerator: 'topics in that section at isAtRevisionDepth (revising or beyond)',
  unknownWhen: ['the section is not an exam section', 'the student has no rows in it'],
  produce: ({ coverage, section }) => {
    const p = prov('section_at_depth_units', 'v1', 'syllabusCoverage', { section, rows: coverage.length });
    if (!(EXAM_SECTION_IDS as string[]).includes(section)) {
      return unknown('out_of_universe', p, [`'${section}' is not an exam section`]);
    }
    const violations = checkUniverse(coverage);
    if (violations.length) return unknown('out_of_universe', p, violations);
    const inSection = coverage.filter((r) => sectionOf(r.topic) === section);
    if (inSection.length === 0) return unknown('no_evidence', p);
    return known(inSection.filter((r) => isAtRevisionDepth(r.status)).length, p);
  },
};

// ── Daily log ───────────────────────────────────────────────────────────────
//
// FOUNDER CONTRACT, preserved deliberately: a section/task TAP is not a Daily
// Log. A tap earns a section-scoped insight; a submitted Daily Log earns the
// combined one. These facts read daily_reports ONLY — never
// routine_task_completions — so the two events stay distinguishable
// downstream. Collapsing them here would make the two insight types
// indistinguishable forever after.

const loggedToday: FactDef<{ logDates: string[]; today: string }, boolean> = {
  key: 'logged_today',
  version: 'v1',
  semanticType: 'FACT',
  meaning: "Whether the student has submitted today's Daily Log. Not a tap, not a task tick.",
  canonicalSource: 'dailyLogState',
  unit: 'boolean',
  timeBasis: 'point_in_time',
  unknownWhen: ['the CareerRai day was not supplied'],
  produce: ({ logDates, today }) => {
    const p = prov('logged_today', 'v1', 'dailyLogState', { today });
    if (!today) return unknown('invalid_input', p, ['no CareerRai day supplied']);
    return known(logDates.includes(today), p);
  },
};

const loggedDaysLast7: FactDef<{ logDates: string[]; today: string }, number> = {
  key: 'logged_days_last_7',
  version: 'v1',
  semanticType: 'DERIVED_FACT',
  meaning: 'Distinct CareerRai days with a submitted Daily Log in the trailing 7 days, today included.',
  canonicalSource: 'dailyLogState',
  unit: 'days',
  timeBasis: 'trailing_7_days',
  numerator: 'distinct log dates within the window',
  denominator: '7 CareerRai days',
  validRange: [0, 7],
  unknownWhen: ['the CareerRai day was not supplied'],
  produce: ({ logDates, today }) => {
    const p = prov('logged_days_last_7', 'v1', 'dailyLogState', { today, rows: logDates.length });
    if (!today) return unknown('invalid_input', p, ['no CareerRai day supplied']);
    // Seven days, inclusive of today — [today−6 … today]. Distinct DATES, never
    // rows: two rows for one date is one logged day. A rest-day log counts;
    // showing up and studying are different facts (Constitution B1).
    const window = new Set<string>();
    const end = Date.parse(`${today}T00:00:00Z`);
    for (const d of logDates) {
      const t = Date.parse(`${d}T00:00:00Z`);
      if (!Number.isFinite(t)) continue;
      const daysBack = Math.round((end - t) / 86_400_000);
      if (daysBack >= 0 && daysBack <= 6) window.add(d);
    }
    return known(window.size, p);
  },
};

const loggedDaysTotal: FactDef<{ logDates: string[] }, number> = {
  key: 'logged_days_total',
  version: 'v1',
  semanticType: 'DERIVED_FACT',
  meaning: 'Distinct CareerRai days on which the student has ever submitted a Daily Log.',
  canonicalSource: 'dailyLogState',
  unit: 'days',
  timeBasis: 'point_in_time',
  numerator: 'distinct log dates, lifetime',
  // No window, therefore no validRange: a lifetime count has no ceiling to
  // declare, and inventing one would be the "8 days in a 7-day window" defect
  // running in reverse.
  unknownWhen: [],
  produce: ({ logDates }) => {
    const p = prov('logged_days_total', 'v1', 'dailyLogState', { rows: logDates.length });
    // Distinct DATES, never rows — two submissions on one day is one logged day.
    return known(new Set(logDates.filter(Boolean)).size, p);
  },
};

// ── Repeater self-report ────────────────────────────────────────────────────
//
// These are what the student SAID, recorded once. They are immutable: the
// Insight Engine may later place them beside observed evidence and reconcile
// the two, but it may never overwrite a student's own account of their past
// with a number computed from their present.
//
// Split into separate keys per the founder's correction — a single
// `self_reported_baseline` would have bundled four meanings behind one key and
// re-admitted the duplication this registry exists to end.

const selfReportedLastYearPercentile: FactDef<{ lastYearPercentile: number | null }, number> = {
  key: 'self_reported_last_year_percentile',
  version: 'v1',
  semanticType: 'FACT',
  meaning: 'The percentile the student said they scored in their previous attempt.',
  canonicalSource: 'selfReportedDeclaration',
  unit: 'percentile',
  timeBasis: 'immutable_declaration',
  validRange: [0, 100],
  unknownWhen: ['the student never gave a percentile (35 of 66 repeaters)'],
  produce: ({ lastYearPercentile }) => {
    const p = prov('self_reported_last_year_percentile', 'v1', 'selfReportedDeclaration', {});
    if (lastYearPercentile == null) return unknown('no_evidence', p);
    if (!Number.isFinite(lastYearPercentile) || lastYearPercentile < 0 || lastYearPercentile > 100) {
      return unknown('invalid_input', p, [`percentile out of range: ${lastYearPercentile}`]);
    }
    return known(lastYearPercentile, p);
  },
};

const selfReportedWeakestSection: FactDef<{ weakestSection: string | null }, string> = {
  key: 'self_reported_weakest_section',
  version: 'v1',
  semanticType: 'FACT',
  meaning: 'The section the student said costs them the most marks.',
  canonicalSource: 'selfReportedDeclaration',
  unit: 'section',
  timeBasis: 'immutable_declaration',
  unknownWhen: ['the student never named one'],
  produce: ({ weakestSection }) => {
    const p = prov('self_reported_weakest_section', 'v1', 'selfReportedDeclaration', {});
    if (!weakestSection) return unknown('no_evidence', p);
    if (!(EXAM_SECTION_IDS as string[]).includes(weakestSection)) {
      return unknown('out_of_universe', p, [`'${weakestSection}' is not an exam section`]);
    }
    return known(weakestSection, p);
  },
};

const isRepeaterFact: FactDef<{ isRepeater: boolean | null }, boolean> = {
  key: 'is_repeater',
  version: 'v1',
  semanticType: 'FACT',
  meaning: 'Whether the student declared this is not their first attempt.',
  canonicalSource: 'selfReportedDeclaration',
  unit: 'boolean',
  timeBasis: 'immutable_declaration',
  unknownWhen: ['the student never answered'],
  produce: ({ isRepeater }) => {
    const p = prov('is_repeater', 'v1', 'selfReportedDeclaration', {});
    if (isRepeater == null) return unknown('no_evidence', p);
    return known(isRepeater, p);
  },
};

// ── Section lookup, derived from the taxonomy ───────────────────────────────
//
// Built once from the same graph EXAM_SYLLABUS_TOPICS comes from, so a topic
// added to an exam section is picked up here automatically and can never drift
// into a second hand-maintained list.

const TOPICS_BY_SECTION: Record<string, string[]> = Object.fromEntries(
  KNOWLEDGE_GRAPH
    .filter((s) => (EXAM_SECTION_IDS as string[]).includes(s.id))
    .map((s) => [s.id, s.groups.flatMap((g) => g.units)])
);

const SECTION_OF_TOPIC: Record<string, string> = {};
for (const [section, topics] of Object.entries(TOPICS_BY_SECTION)) {
  for (const t of topics) SECTION_OF_TOPIC[t] = section;
}

function sectionOf(topic: string): string | null {
  return SECTION_OF_TOPIC[topic] ?? null;
}

// ── The registry ────────────────────────────────────────────────────────────

export const FACTS: AnyFact[] = [
  syllabusCoverageUnits,
  syllabusCoveragePct,
  sectionCoverageUnits,
  sectionTopicsRemaining,
  syllabusOpenedUnits,
  sectionOpenedUnits,
  sectionUntouchedUnits,
  sectionAtDepthUnits,
  loggedToday,
  loggedDaysLast7,
  loggedDaysTotal,
  selfReportedLastYearPercentile,
  selfReportedWeakestSection,
  isRepeaterFact,
];

export function factKeys(): string[] {
  return FACTS.map((f) => f.key);
}

export function getFact(key: string): AnyFact {
  const f = FACTS.find((x) => x.key === key);
  if (!f) throw new Error(`No such fact: ${key}. Registered: ${factKeys().join(', ')}`);
  return f;
}

export type { FactResult };
