// ── 0B — CareerRai's canonical sources of truth ─────────────────────────────
//
// Phase-0 Integrity Specification, item 0B. This file is the founder's locked
// decision (18 Aug) expressed as code rather than prose, because a boundary
// that lives only in a document is a convention, and conventions lose.
//
// THE DECISION: these are four (six) DIFFERENT questions with four (six)
// DIFFERENT sources. They must never be merged, and no future fact may be
// derived from an overloaded "topics_covered" notion that blurs them.
//
//   "Did the student submit today's log?"        → daily_reports
//   "What did the student actually tick?"        → routine_task_completions
//   "What does CareerRai know is covered?"       → topic_coverage
//   "What did CareerRai actually plan?"          → daily_routines
//   "What did the student score?"                → mock_debriefs
//   "What did CareerRai recommend?"              → study_action_log
//
// The distinction that forced this: a student can log a day (showed up) while
// studying entirely off-plan (no completions), so "which sections did they
// touch today" has two different honest answers depending on which question is
// being asked. Left ambiguous, that is precisely how one subsystem reports 3
// and another reports 2 — the failure this whole phase exists to prevent.
//
// THE BOUNDARY: the memory layer READS these and NEVER writes them. That is
// not enforced by this comment; it is enforced by
// canonical-boundary.guard.test.ts, which walks the transitive import closure
// of src/lib/facts/** and src/lib/insights/** and fails the build if anything
// in it can reach a database client, chain a write onto one of these tables,
// call a mutating RPC, or query a table at all.
//
// This file therefore declares NAMES AS DATA. It performs no queries and must
// never grow one.

/** The question a canonical source answers. One source, one question. */
export type CanonicalQuestion =
  | 'observedBehaviour'
  | 'dailyLogState'
  | 'syllabusCoverage'
  | 'generatedPlan'
  | 'mockResults'
  | 'recommendationsShown'
  | 'selfReportedDeclaration';

export interface CanonicalSource {
  /** The table that owns the answer. */
  readonly table: string;
  /** The question it answers, in the words a product person would use. */
  readonly answers: string;
  /** How a single record is identified — the natural key, not the surrogate id. */
  readonly identity: readonly string[];
  /**
   * Every write path that exists today, verified against src/ on 18 Aug.
   * Recorded so a reviewer can see at a glance who may mutate this source —
   * and so that list growing is a visible, reviewable event rather than a
   * silent one.
   */
  readonly writtenBy: readonly string[];
}

export const CANONICAL_SOURCES: Readonly<Record<CanonicalQuestion, CanonicalSource>> = {
  observedBehaviour: {
    table: 'routine_task_completions',
    answers: 'What did the student actually mark completed?',
    identity: ['student_id', 'routine_date', 'task_id'],
    writtenBy: ['src/app/api/routine/complete-task/route.ts'],
  },
  dailyLogState: {
    table: 'daily_reports',
    answers: 'Did the student submit a log for this day?',
    identity: ['student_id', 'report_date'],
    // The route writes through the upsert_log_and_streak RPC, which owns the
    // transaction that keeps daily_reports and streak_data consistent.
    writtenBy: ['src/app/api/logging/log-daily/route.ts'],
  },
  syllabusCoverage: {
    table: 'topic_coverage',
    answers: 'What does CareerRai currently know is covered, and to what depth?',
    identity: ['student_id', 'section', 'topic'],
    writtenBy: [
      'src/app/api/auth/verify-phone-otp/route.ts',
      'src/app/api/routine/complete-task/route.ts',
      'src/app/api/coverage/route.ts',
      'src/app/api/coverage/priority/route.ts',
      'src/app/api/coverage/weekly-review/route.ts',
      'src/app/api/evidence/route.ts',
      'src/lib/timetable-apply.ts',
    ],
  },
  generatedPlan: {
    table: 'daily_routines',
    answers: 'What did CareerRai actually plan for this day?',
    identity: ['student_id', 'routine_date'],
    writtenBy: [
      'src/app/api/routine/calibrate/route.ts',
      'src/app/api/routine/today/route.ts',
      'src/app/api/student/daily-hours/route.ts',
      'src/lib/routine-plan.ts',
      'src/lib/timetable-apply.ts',
      'src/lib/plan-mutate.ts',
    ],
  },
  mockResults: {
    table: 'mock_debriefs',
    answers: 'What did the student score, section by section?',
    identity: ['student_id', 'log_date'],
    writtenBy: ['src/app/api/logging/mock-debrief/route.ts'],
  },
  recommendationsShown: {
    table: 'study_action_log',
    answers: 'What did CareerRai recommend, and was it followed?',
    identity: ['id'],
    writtenBy: [
      'src/app/api/next-action/route.ts',
      'src/app/api/next-action/ack/route.ts',
      'src/app/api/cron/reconcile-actions/route.ts',
    ],
  },
  // ── ADDED 0C.2.2, and worth stating why ──────────────────────────────────
  //
  // 0B enumerated the six sources that record what HAPPENED. It did not
  // declare the source of what the student SAID — and that gap surfaced the
  // moment the registry tried to give the repeater facts a provenance: they
  // were about to be labelled `dailyLogState`, which would have made every
  // self-report claim cite the wrong table.
  //
  // Declarations are a distinct kind of evidence and the distinction is
  // load-bearing for the whole repeater thesis: a student's account of their
  // own past ("DILR was my weakness") is a FACT about what they said, never
  // evidence about what is true, and it must survive whatever the data later
  // shows. Observed counterparts get separate keys; the Insight Engine may
  // reconcile them and may never overwrite one with the other.
  //
  // Not a new data source: `profiles` was already read everywhere. What is new
  // is naming it, so provenance stops lying.
  selfReportedDeclaration: {
    table: 'profiles',
    answers: 'What did the student declare about themselves, once, at onboarding?',
    identity: ['id'],
    writtenBy: [
      'src/app/api/auth/verify-phone-otp/route.ts',
      'src/app/student/onboarding/onboarding-modal.tsx',
    ],
  },
} as const;

/** The canonical tables, for guards and registries that need the flat list. */
export const CANONICAL_TABLES: readonly string[] =
  Object.values(CANONICAL_SOURCES).map((s) => s.table);

/**
 * Which question a fact reads from. Every registered fact (0C) must declare
 * this, so "where did this number come from" is answerable without reading the
 * producer's body — and so a fact that quietly reads two sources to answer one
 * question is visible in review.
 */
export function sourceFor(question: CanonicalQuestion): CanonicalSource {
  return CANONICAL_SOURCES[question];
}
