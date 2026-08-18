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
import { fullyDoneTaskIds } from '../completion-portion';
import type { CanonicalQuestion } from './canonical';
import {
  type FactDef, type FactResult, type Provenance, type UnknownReason, known, unknown,
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
 * Every coverage producer runs this first. It answers one question — "is this
 * evidence fit to count?" — and refuses rather than repairs.
 *
 * TWO ways it refuses:
 *
 * 1. OUT OF UNIVERSE. A row naming something outside the exam syllabus is not
 *    a row to skip — it means the caller's universe disagrees with ours, and a
 *    number computed on a disagreed universe is exactly the 111% Knowledge
 *    defect. The producer does NOT filter the row out and carry on: silently
 *    discarding bad evidence is the same laundering as silently clamping it.
 *
 * 2. CONTRADICTORY. Two rows for one topic saying different things is not
 *    evidence, it is a disagreement, and no producer may pick a winner. The
 *    caller is told and the fact goes UNKNOWN.
 *
 * And ONE thing it collapses: two rows for one topic saying the SAME thing are
 * one fact stated twice. Counting them twice is how a numerator climbs past its
 * denominator.
 *
 * That last case is live, not theoretical. Production carries exactly one such
 * pair today — student 352d0c81 has 'Vocabulary' filed under both VARC and
 * General, both `revising`, because the table's uniqueness is
 * (student_id, section, topic) and a mis-sectioned row therefore duplicates
 * freely. Counting rows would have given that student 10 opened VARC topics out
 * of 9, an untouched count of −1, and "111% of the section on the board".
 * Found during 0C.3a by reading the production table rather than trusting the
 * fixture. (18 Aug.)
 */
type Prepared =
  | { ok: true; rows: CoverageRow[] }
  | { ok: false; reason: UnknownReason; violations: string[] };

function prepare(rows: CoverageRow[]): Prepared {
  const strays = rows.filter((r) => !isExamSyllabusTopic(r.topic)).map((r) => r.topic);
  if (strays.length) {
    return {
      ok: false,
      reason: 'out_of_universe',
      violations: [`${strays.length} row(s) outside the exam syllabus universe: ${strays.slice(0, 3).join(', ')}`],
    };
  }

  const byTopic = new Map<string, CoverageRow>();
  const conflicts: string[] = [];
  for (const r of rows) {
    const seen = byTopic.get(r.topic);
    if (!seen) { byTopic.set(r.topic, r); continue; }
    if (seen.status !== r.status) conflicts.push(`${r.topic}: '${seen.status}' vs '${r.status}'`);
  }
  if (conflicts.length) {
    return {
      ok: false,
      reason: 'invalid_input',
      violations: [`${conflicts.length} topic(s) with contradictory rows: ${conflicts.slice(0, 3).join('; ')}`],
    };
  }

  return { ok: true, rows: [...byTopic.values()] };
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
  unknownWhen: ['the student has no coverage rows', 'any row falls outside the syllabus universe', 'two rows contradict each other about one topic'],
  produce: ({ coverage }) => {
    const p = prov('syllabus_coverage_units', 'v1', 'syllabusCoverage', { rows: coverage.length });
    const prep = prepare(coverage);
    if (!prep.ok) return unknown(prep.reason, p, prep.violations);
    if (prep.rows.length === 0) return unknown('no_evidence', p);
    return known(prep.rows.filter((r) => isCovered(r.status)).length, p);
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
  numerator: 'topics at isCovered, via syllabus_coverage_units — never recounted here',
  denominator: 'EXAM_SYLLABUS_TOPICS.length — derived, never a literal',
  validRange: [0, 100],
  unknownWhen: ['the student has no coverage rows', 'any row falls outside the syllabus universe', 'two rows contradict each other about one topic'],
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
  unknownWhen: ['the section is not an exam section', 'the student has no rows in it', 'two rows contradict each other about one topic'],
  // The section is a PARAMETER, not three separate facts — one definition
  // cannot drift from itself the way qa_/varc_/dilr_ producers would.
  produce: ({ coverage, section }) => {
    const p = prov('section_coverage_units', 'v1', 'syllabusCoverage', { section, rows: coverage.length });
    if (!(EXAM_SECTION_IDS as string[]).includes(section)) {
      return unknown('out_of_universe', p, [`'${section}' is not an exam section`]);
    }
    const prep = prepare(coverage);
    if (!prep.ok) return unknown(prep.reason, p, prep.violations);
    const inSection = prep.rows.filter((r) => sectionOf(r.topic) === section);
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
  unknownWhen: ['the section is not an exam section', 'the student has no rows in it', 'two rows contradict each other about one topic'],
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
  unknownWhen: ['the student has no coverage rows', 'any row falls outside the syllabus universe', 'two rows contradict each other about one topic'],
  produce: ({ coverage }) => {
    const p = prov('syllabus_opened_units', 'v1', 'syllabusCoverage', { rows: coverage.length });
    const prep = prepare(coverage);
    if (!prep.ok) return unknown(prep.reason, p, prep.violations);
    if (prep.rows.length === 0) return unknown('no_evidence', p);
    return known(prep.rows.filter((r) => isOpened(r.status)).length, p);
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
  unknownWhen: ['the section is not an exam section', 'the student has no rows in it', 'two rows contradict each other about one topic'],
  produce: ({ coverage, section }) => {
    const p = prov('section_opened_units', 'v1', 'syllabusCoverage', { section, rows: coverage.length });
    if (!(EXAM_SECTION_IDS as string[]).includes(section)) {
      return unknown('out_of_universe', p, [`'${section}' is not an exam section`]);
    }
    const prep = prepare(coverage);
    if (!prep.ok) return unknown(prep.reason, p, prep.violations);
    const inSection = prep.rows.filter((r) => sectionOf(r.topic) === section);
    if (inSection.length === 0) return unknown('no_evidence', p);
    return known(inSection.filter((r) => isOpened(r.status)).length, p);
  },
};

const sectionUntouchedUnits: FactDef<{ coverage: CoverageRow[]; section: string }, number> = {
  key: 'section_untouched_units',
  version: 'v1',
  semanticType: 'DERIVED_FACT',
  meaning:
    'How many topics in one exam section are not known to be opened — '
    + 'either declared not_started, or carrying no coverage row at all.',
  canonicalSource: 'syllabusCoverage',
  unit: 'count',
  timeBasis: 'point_in_time',
  membershipUniverse: 'the named exam section within EXAM_SYLLABUS_TOPICS',
  numerator: 'section size minus the isOpened count — the complement, never a second pass',
  // MISSING ROW != not_started (founder ruling, 18 Aug). This fact is the
  // complement of opened within the CANONICAL universe, so it necessarily
  // unions two different states:
  //
  //   · a row that says not_started     → KNOWN not opened
  //   · no row for that topic at all    → UNKNOWN
  //
  // The meaning string says so rather than claiming "never started", because a
  // fact that quietly folds UNKNOWN into a measured zero is the kind-6 defect
  // wearing a registry badge. Consumers that need the two apart must ask for a
  // fact that separates them — none exists yet, because nothing consumes it.
  //
  // Computed AS the complement rather than by a second pass over the rows: two
  // independent counts of one ladder is how eleven coverage producers began.
  unknownWhen: ['the section is not an exam section', 'the student has no rows in it', 'two rows contradict each other about one topic'],
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
  unknownWhen: ['the section is not an exam section', 'the student has no rows in it', 'two rows contradict each other about one topic'],
  produce: ({ coverage, section }) => {
    const p = prov('section_at_depth_units', 'v1', 'syllabusCoverage', { section, rows: coverage.length });
    if (!(EXAM_SECTION_IDS as string[]).includes(section)) {
      return unknown('out_of_universe', p, [`'${section}' is not an exam section`]);
    }
    const prep = prepare(coverage);
    if (!prep.ok) return unknown(prep.reason, p, prep.violations);
    const inSection = prep.rows.filter((r) => sectionOf(r.topic) === section);
    if (inSection.length === 0) return unknown('no_evidence', p);
    return known(inSection.filter((r) => isAtRevisionDepth(r.status)).length, p);
  },
};

// ── Opened, as a share ──────────────────────────────────────────────────────
//
// Approved 18 Aug with one binding condition: "They must be derived from the
// canonical opened-unit facts. Do NOT create a second implementation of
// isOpened."
//
// So each of these calls the unit fact's own producer and divides. Neither
// touches a coverage row, neither applies the ladder predicate, and
// `registry.guard.test.ts` counts the predicate call sites in this file to
// keep it that way: isOpened appears exactly twice, isCovered twice,
// isAtRevisionDepth once — one application per semantic family.
//
// The denominator is the CANONICAL universe in both cases, never the number of
// rows the student happens to have. That distinction is the whole of the 0C.3a
// STOP: 15 of 16 rows is 94%, 15 of 46 topics is 33%, and only the second is
// an answer to "how much of the syllabus have you opened?".

const syllabusOpenedPct: FactDef<{ coverage: CoverageRow[] }, number> = {
  key: 'syllabus_opened_pct',
  version: 'v1',
  semanticType: 'DERIVED_FACT',
  meaning: 'What share of the exam syllabus the student has started at all.',
  canonicalSource: 'syllabusCoverage',
  unit: 'ratio_pct',
  timeBasis: 'point_in_time',
  membershipUniverse: 'EXAM_SYLLABUS_TOPICS',
  numerator: 'topics at isOpened, via syllabus_opened_units — never recounted here',
  denominator: 'EXAM_SYLLABUS_TOPICS.length — the canonical universe, derived, never a literal',
  validRange: [0, 100],
  unknownWhen: ['syllabus_opened_units is UNKNOWN'],
  produce: ({ coverage }) => {
    const p = prov('syllabus_opened_pct', 'v1', 'syllabusCoverage', { rows: coverage.length });
    const inner = syllabusOpenedUnits.produce({ coverage });
    if (!inner.known) return unknown(inner.reason, p, inner.violations);
    return known(Math.round((inner.value / EXAM_SYLLABUS_TOPICS.length) * 100), p);
  },
};

const sectionOpenedPct: FactDef<{ coverage: CoverageRow[]; section: string }, number> = {
  key: 'section_opened_pct',
  version: 'v1',
  semanticType: 'DERIVED_FACT',
  meaning: 'What share of one exam section the student has started at all.',
  canonicalSource: 'syllabusCoverage',
  unit: 'ratio_pct',
  timeBasis: 'point_in_time',
  membershipUniverse: 'the named exam section within EXAM_SYLLABUS_TOPICS',
  numerator: 'topics at isOpened in that section, via section_opened_units — never recounted here',
  denominator: "the section's canonical size — derived from the taxonomy",
  validRange: [0, 100],
  unknownWhen: ['section_opened_units is UNKNOWN'],
  produce: ({ coverage, section }) => {
    const p = prov('section_opened_pct', 'v1', 'syllabusCoverage', { section, rows: coverage.length });
    const inner = sectionOpenedUnits.produce({ coverage, section });
    if (!inner.known) return unknown(inner.reason, p, inner.violations);
    const total = (TOPICS_BY_SECTION[section] ?? []).length;
    if (total === 0) return unknown('out_of_universe', p, [`'${section}' has no canonical topics`]);
    return known(Math.round((inner.value / total) * 100), p);
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

// ── Observed day outcome (0C.3G / J1) ───────────────────────────────────────
//
// docs/0C-3G-DAILY-EVIDENCE-CONTRACT.md: day_outcome is TWO facts.
// self_reported_day_outcome is what the student declared — the check-in gate
// and the log sheet's own Rest toggle, both untouched by this fact and both
// still writing the daily_reports.day_outcome column directly. This is the
// OTHER one: what CareerRai's own tick records show, independent of anything
// the student said.
//
// PARITY, not a new design. LoggingModal.tsx's deriveOutcome() computed this
// exact question client-side, from in-session tap state, and its output used
// to be written into the SAME column self-reported values occupy — the
// violation this contract exists to end. The implementation-surface audit
// found deriveOutcome() is already a pure function of data that persists
// independently (routine_task_completions + the day's planned task ids +
// daily_reports.mock_taken), because DailyTrackerApp's integrated flow POSTs
// every ticked task to complete-task in the same submission. So this fact
// reproduces deriveOutcome()'s branches exactly — the caller supplies
// persisted rows, nothing here constructs a date or touches a database — and
// the only thing that changes is WHERE the computation runs, never what it
// means. See observed-day-outcome.test.ts for the branch-by-branch parity
// proof against the frozen legacy logic.
//
// Can only ever answer 'studied' or 'partial' — never 'skipped' or
// 'not_studied', because those are claims about ABSENCE ("I rested", "I
// didn't study") that no tick record can support. An observed fact has
// evidence of presence or it has none; it never has evidence of a deliberate
// absence, which is exactly why that half of the ladder stays exclusively
// self-reported.

interface ObservedOutcomeCompletion { task_id: string; confidence: string | null }

const observedDayOutcome: FactDef<
  { completions: ObservedOutcomeCompletion[]; plannedTaskIds: string[]; mockTaken: boolean },
  'studied' | 'partial'
> = {
  key: 'observed_day_outcome',
  version: 'v1',
  semanticType: 'DERIVED_FACT',
  meaning: "What CareerRai's own tick records show happened on a day — never what the student declared.",
  canonicalSource: 'observedBehaviour',
  unit: 'outcome',
  timeBasis: 'point_in_time',
  unknownWhen: ['no completion rows exist for the day and no mock was taken'],
  produce: ({ completions, plannedTaskIds, mockTaken }) => {
    const p = prov('observed_day_outcome', 'v1', 'observedBehaviour', {
      completions: completions.length, planned: plannedTaskIds.length, mockTaken,
    });
    const finished = fullyDoneTaskIds(completions);
    // Mirrors deriveOutcome() exactly, including its edge case: a plan of
    // zero tasks makes `>= plannedTaskIds.length` vacuously true. Reproduced,
    // not "fixed" — that is what parity means.
    if (completions.length > 0 && completions.length >= plannedTaskIds.length && finished.size === completions.length) {
      return known('studied', p);
    }
    if (completions.length > 0 || mockTaken) return known('partial', p);
    return unknown('no_evidence', p);
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
  observedDayOutcome,
  syllabusOpenedUnits,
  syllabusOpenedPct,
  sectionOpenedUnits,
  sectionOpenedPct,
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
