// ── 0C.2.2 — The fact contract ──────────────────────────────────────────────
//
// The enforcement mechanism for docs/METRIC-CONSTITUTION.md. The Constitution
// states the law; this file makes a fact unable to exist without obeying it.
//
// Written after an audit found 11 implementations of "syllabus coverage", 15 of
// "logged days", 6 formulas for "consistency", 5 definitions of "today" and a
// percentage that reached 111% in production. None of those were careless — each
// was locally reasonable. What was missing was a contract that made a second
// definition impossible to add quietly.
//
// THE THREE RULES THIS TYPE SYSTEM ENFORCES:
//
//   1. Different meaning → different fact_key. No umbrella facts. A container
//      named for a bundle of meanings (the rejected `self_reported_baseline`)
//      re-admits duplication wearing a registry badge.
//
//   2. UNKNOWN is a valid, first-class answer. A producer that cannot prove a
//      value returns UNKNOWN — it never estimates, never defaults to zero, and
//      never repairs bad input into a plausible number.
//
//   3. Evidence is never laundered. Out-of-universe input yields UNKNOWN plus a
//      recorded violation. Clamping belongs to presentation; inside a producer
//      `Math.min(x, 46)` is how a regression stays invisible (P0-C's lesson).

import type { CanonicalQuestion } from './canonical';

/**
 * What kind of claim this is. The Insight Engine may only ever present the
 * first three; INTERPRETATION and RECOMMENDATION exist so that later layers
 * must declare when they have crossed from evidence into meaning.
 */
export type SemanticType =
  | 'FACT'            // directly observed from canonical persisted data
  | 'DERIVED_FACT'    // deterministically calculated from canonical facts
  | 'OBSERVATION'     // a pattern meeting an explicit evidence threshold
  | 'INTERPRETATION'  // meaning assigned to an observation
  | 'RECOMMENDATION'; // a suggested student action

export type Unit =
  | 'count' | 'ratio_pct' | 'days' | 'percentile' | 'section' | 'boolean'
  // 0C.3G/J1: a small closed set of outcome labels ('studied' | 'partial'),
  // narrower than the self-reported day_outcome's four values because an
  // observed fact can never claim 'skipped' or 'not_studied' — it has no
  // evidence of absence, only evidence of presence.
  | 'outcome';

/**
 * How the fact is anchored in time.
 *
 * `trailing_7_days` means the CareerRai days [today−6 … today], inclusive —
 * seven, never eight (Constitution Article 1). The day itself always arrives
 * as an argument: producers are pure and may not construct a date, because
 * five competing definitions of "today" are what that rule exists to prevent.
 */
export type TimeBasis = 'point_in_time' | 'trailing_7_days' | 'immutable_declaration';

/** Why a fact could not be produced. Never an error — a legitimate answer. */
export type UnknownReason =
  | 'no_evidence'      // the student has no rows to compute from
  | 'out_of_universe'  // input contained something outside the fact's membership
  | 'invalid_input';   // malformed input (wrong shape, non-finite number)

export interface Provenance {
  factKey: string;
  version: string;
  /** Which canonical record the value was derived from (0B). */
  source: CanonicalQuestion;
  /** What the producer actually counted — the receipts a claim can cite. */
  inputs: Record<string, unknown>;
}

/**
 * A fact is either KNOWN with a value, or UNKNOWN with a reason. There is no
 * third state, and no way to read a value without acknowledging the first.
 *
 * `violations` carries integrity failures the producer detected. A pure
 * function cannot log, so it reports — and the caller decides whether to raise
 * an Exception. What it must never do is silently correct the input.
 */
export type FactResult<T> =
  | { known: true; value: T; provenance: Provenance; violations: string[] }
  | { known: false; reason: UnknownReason; provenance: Provenance; violations: string[] };

export interface FactDef<TInput, TValue> {
  /** Stable, specific, never an umbrella. */
  key: string;
  version: string;
  semanticType: SemanticType;
  /** What a human should believe when they read this value. */
  meaning: string;
  /** The canonical record this reads, declared in facts/canonical.ts (0B). */
  canonicalSource: CanonicalQuestion;
  unit: Unit;
  timeBasis: TimeBasis;
  /** For ratios and membership-scoped counts: the universe being counted over. */
  membershipUniverse?: string;
  numerator?: string;
  denominator?: string;
  validRange?: [number, number];
  /** Every condition under which this returns UNKNOWN, stated up front. */
  unknownWhen: string[];
  /** Pure. No I/O, no clock, no database, no model. */
  produce: (input: TInput) => FactResult<TValue>;
}

// ── Helpers, so every producer reports the same shape ───────────────────────

export function known<T>(
  value: T, provenance: Provenance, violations: string[] = []
): FactResult<T> {
  return { known: true, value, provenance, violations };
}

export function unknown<T>(
  reason: UnknownReason, provenance: Provenance, violations: string[] = []
): FactResult<T> {
  return { known: false, reason, provenance, violations };
}
