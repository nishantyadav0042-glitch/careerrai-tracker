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
