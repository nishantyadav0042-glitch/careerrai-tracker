// ── THE coverage ladder ─────────────────────────────────────────────────────
//
// One type, one order, one label set. Before this file existed the same five
// statuses were declared independently in study-pace.ts, coverage-review.ts
// and topic-selector.ts, with the ordering array copied twice more (topic-
// selector's STATUS_ORDER, evidence's STATUS_RANK). Five copies of one
// business fact is how a sixth status gets added to one file and silently
// breaks ranking in the others — the clone-inconsistency failure mode.
//
// This module is a LEAF: it imports nothing, so anything may import it
// without cycles. If you are about to declare a status union or ladder array
// anywhere else in the codebase, stop — import this instead. (Playbook rule:
// a PR that redefines an existing business concept instead of importing it is
// rejected.)

export type CoverageStatus = 'not_started' | 'learning' | 'practicing' | 'revising' | 'exam_ready';

export const STATUS_ORDER: CoverageStatus[] = [
  'not_started', 'learning', 'practicing', 'revising', 'exam_ready',
];

export const STATUS_LABEL: Record<CoverageStatus, string> = {
  not_started: 'Not started',
  learning: 'Learning',
  practicing: 'Practising',
  revising: 'Revising',
  exam_ready: 'Exam ready',
};

export function isCoverageStatus(v: unknown): v is CoverageStatus {
  return typeof v === 'string' && (STATUS_ORDER as string[]).includes(v);
}

export function statusRank(s: CoverageStatus): number {
  return STATUS_ORDER.indexOf(s);
}

/**
 * Coerce whatever the database actually holds into a status we can rank.
 *
 * Backbone audit, 13 Aug: several call sites did `STATUS_ORDER.indexOf(row)`
 * on a raw DB value and then indexed the array with the result. For any value
 * outside the ladder that is `indexOf → -1`, and:
 *
 *   · `STATUS_ORDER[-1 + 1]` is `'not_started'` — so a "Finished it" tap on
 *     an unrecognised row ERASED the topic instead of advancing it;
 *   · `STATUS_ORDER[-1]` is `undefined` — written straight back to the row.
 *
 * `'mastered'` is the known legacy name for the top rung and four modules
 * still defend against it, so it maps to `exam_ready` rather than being
 * thrown away. Anything genuinely unknown floors at `not_started`, which is
 * safe ONLY because every caller pairs this with the never-regress rule
 * below — normalising must not become a quiet downgrade path.
 */
export function normalizeStatus(v: unknown): CoverageStatus {
  if (isCoverageStatus(v)) return v;
  if (v === 'mastered') return 'exam_ready';
  return 'not_started';
}

/**
 * The highest of two statuses. The one safe way to apply an advancing signal
 * to a row whose stored value we could not fully trust: a tap may lift a
 * topic, never drop it.
 */
export function highestStatus(a: CoverageStatus, b: CoverageStatus): CoverageStatus {
  return statusRank(a) >= statusRank(b) ? a : b;
}

/**
 * A status may only move FORWARD in bulk/self-service flows, or stay put.
 * Deliberate regressions belong in flows built for them (the red confidence
 * signal, the full matrix editor) — never in a weekly tap-through where a
 * mis-tap would silently rewrite history.
 */
export function isForwardMove(from: CoverageStatus, to: CoverageStatus): boolean {
  return statusRank(to) >= statusRank(from);
}

// ── HAS THIS STUDENT COVERED THIS TOPIC? ONE ANSWER ─────────────────────────
//
// The 14 Aug dead-code sweep found this question written ELEVEN times, always
// as the same inline triple:
//
//   t.status === 'practicing' || t.status === 'revising' || t.status === 'exam_ready'
//
// in buddy/cockpit, api/blueprint, api/auth/verify-phone-otp, student/tracker,
// student/plan/topics, daily-insight (twice), buddy-briefing (twice),
// student-brief (as a COVERED set) and sales-conversion (as a FINISHED set).
//
// Ten of the eleven agreed. The eleventh, prep-insight-engine's `isFinished`,
// dropped exam_ready — so the instant-insight screen would count a topic the
// student had EARNED THROUGH EVIDENCE as not yet studied, and tell them to go
// start it. That one was latent rather than live (its matrix comes from
// onboarding taps, and exam_ready can never be self-assigned), which is
// precisely why nobody caught it: it was wrong everywhere it was not yet used.
//
// Defined by RANK, not by listing the three names. When a sixth status is
// added above exam_ready it is covered automatically, instead of being missed
// in eleven places — the failure mode this repo has now paid for twice, once
// on the coverage ladder and once on the revision rule.
//
// Takes `unknown` and normalizes, so a legacy 'mastered' row counts as covered
// (it means exam_ready) and an unrecognised value counts as not covered rather
// than throwing.

/** The lowest rung that counts as "studied through at least once". */
export const COVERED_FLOOR: CoverageStatus = 'practicing';

/** The statuses that count as covered, derived from the ladder — never listed. */
export const COVERED_STATUSES: CoverageStatus[] =
  STATUS_ORDER.filter((s) => statusRank(s) >= statusRank(COVERED_FLOOR));

/** Has the student studied this topic through at least once? */
export function isCovered(status: unknown): boolean {
  return statusRank(normalizeStatus(status)) >= statusRank(COVERED_FLOOR);
}

// ── Two more ladder predicates, same law: derived by RANK, never listed ─────
//
// "Opened" and "covered" are different questions and both get asked. A student
// insight says "12 of 28 QA topics opened" — that is anything past
// not_started, a lower bar than covered (practicing+), because the honest
// claim there is about what has been STARTED, not what has been finished.
//
// These live here rather than in the caller for the reason
// covered-authority.guard.test.ts enforces: the moment a predicate over this
// ladder is re-spelled somewhere else, the two copies drift, and a sixth
// status added above exam_ready gets missed in one of them. This repo has
// already paid for that failure twice. (Added 18 Aug after log-insight.ts
// re-spelled the set and the guard caught it.)

/** The lowest rung that counts as "started at all". */
export const OPENED_FLOOR: CoverageStatus = 'learning';

/** The lowest rung that counts as "being actively revised". */
export const DEPTH_FLOOR: CoverageStatus = 'revising';

/** Has the student started this topic at all? */
export function isOpened(status: unknown): boolean {
  return statusRank(normalizeStatus(status)) >= statusRank(OPENED_FLOOR);
}

/** Has this topic reached revision depth or beyond? */
export function isAtRevisionDepth(status: unknown): boolean {
  return statusRank(normalizeStatus(status)) >= statusRank(DEPTH_FLOOR);
}

// ── The one law of exam_ready ───────────────────────────────────────────────
//
// exam_ready is EARNED FROM EVIDENCE (all six checks in evidence.ts) and set
// by no other path. Not by a chip row, not by a green confidence tap, not by
// a bulk import. Self-assessment correlates with actual ability at roughly
// r ≈ 0.29 across meta-analyses (Mabe & West 1982; Zell & Krizan 2014) — an
// opinion simply isn't strong enough data to hang our strongest claim on.
// Enforced three deep: this constant for writers, mergeStatus in evidence.ts,
// and the topic_coverage trigger in the database (the layer no forgotten
// writer can skip).
export const EXAM_READY_SOURCE = 'evidence' as const;
