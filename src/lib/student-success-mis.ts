import { deliveryCounts, completionRate, type SessionRow } from '@/lib/session-lifecycle';
import { REASON_LABEL, PRODUCT_FIXABLE_REASONS, type ReasonCategory } from '@/lib/intervention-taxonomy';

// ── The founder's four questions ────────────────────────────────────────────
//
//   1. Are students coming back?
//   2. Are human interventions helping?
//   3. Are students converting into COMPLETED sessions?
//   4. What are we learning that should change the product?
//
// This module computes the answers and NOTHING else. It is pure: rows in,
// answers out, no database, no clock of its own — so every claim it makes is
// testable, including the claims it refuses to make.
//
// THE RULE THAT SHAPES ALL OF IT: a number that cannot be trusted must not be
// rendered as a number. With samples this small, a percentage is a far more
// confident-looking object than the evidence behind it, and the founder is
// about to argue a funding case from these screens. Every answer therefore
// carries its own evidence grade, and UNAVAILABLE is a legitimate answer.
//
// NOT A SECOND SCORING SYSTEM. There is no score, rank, priority or formula
// here. Lane classification stays with classifyLane; conversion scoring stays
// with scoreConversion; session counting stays with session-lifecycle. This
// module only aggregates and labels what those authorities already produced.

/**
 * How much weight a number can carry.
 *
 *   FACT       — directly observed and counted. A count of rows.
 *   ASSOCIATED — two things co-occurred. NEVER means one caused the other.
 *   UNKNOWN    — the product never recorded it. Distinct from zero.
 *   UNAVAILABLE— the sample is too small to support the statement.
 */
export type Evidence = 'FACT' | 'ASSOCIATED' | 'UNKNOWN' | 'UNAVAILABLE';

/** Below this, a proportion is noise wearing a percent sign. */
export const MIN_SAMPLE_FOR_RATE = 20;

/** Below this, a lane-matched comparison cannot be made at all. */
export const MIN_PER_ARM_FOR_COMPARISON = 10;

export interface Measure {
  label: string;
  /** The count. Always present — a count is a fact even when a rate is not. */
  count: number;
  /** The denominator, when one exists. */
  of: number | null;
  /** null whenever the sample cannot carry a rate. Render as UNAVAILABLE. */
  rate: number | null;
  evidence: Evidence;
  /** Why this is UNAVAILABLE/UNKNOWN, in words the founder can act on. */
  note: string | null;
}

/**
 * Build a measure, refusing to produce a rate the sample cannot support.
 *
 * This is the single choke point for every proportion on the founder's screen.
 * If a rate exists anywhere in this module, it came through here.
 */
export function measure(
  label: string, count: number, of: number | null, min = MIN_SAMPLE_FOR_RATE,
): Measure {
  if (of == null) {
    return { label, count, of: null, rate: null, evidence: 'FACT', note: null };
  }
  if (of < min) {
    return {
      label, count, of, rate: null, evidence: 'UNAVAILABLE',
      note: `${of} in sample — too few to state a rate (need ${min}).`,
    };
  }
  return { label, count, of, rate: count / of, evidence: 'FACT', note: null };
}

// ── Question 1: are students coming back? ───────────────────────────────────

export interface ReturnRow {
  studentId: string;
  /** Whole days since the student signed up. Null when unknown. */
  tenureDays: number | null;
  /** Distinct study days logged, ever. */
  logDays: number;
  /** Did they log on day+1, day+3, day+7 after signup? Null = not yet due. */
  d1: boolean | null;
  d3: boolean | null;
  d7: boolean | null;
}

export interface ReturnPicture {
  eligible: number;
  activated: Measure;
  d1: Measure;
  d3: Measure;
  d7: Measure;
}

/**
 * COHORT-CORRECT BY CONSTRUCTION. Each window counts only students old enough
 * to have had the chance — a student who signed up yesterday is not a D7
 * failure, they are not yet a D7 anything.
 *
 * The cost of getting this wrong is already on the record: comparing "ever
 * logged %" across cohorts of different ages produced a fictitious 42.9% ->
 * 18.9% activation collapse. Measured cohort-correctly it was flat at ~22%.
 */
export function returnPicture(rows: readonly ReturnRow[]): ReturnPicture {
  const eligible = rows.length;
  const activated = rows.filter((r) => r.logDays > 0).length;

  const window = (pick: (r: ReturnRow) => boolean | null, label: string): Measure => {
    const due = rows.filter((r) => pick(r) !== null);
    const returned = due.filter((r) => pick(r) === true).length;
    if (due.length === 0) {
      return {
        label, count: 0, of: 0, rate: null, evidence: 'UNKNOWN',
        note: 'No student is old enough for this window yet.',
      };
    }
    return measure(label, returned, due.length);
  };

  return {
    eligible,
    activated: measure('Logged at least once', activated, eligible),
    d1: window((r) => r.d1, 'Returned on day 1'),
    d3: window((r) => r.d3, 'Returned within 3 days'),
    d7: window((r) => r.d7, 'Returned within 7 days'),
  };
}

// ── Question 2: are human interventions helping? ────────────────────────────

export interface LedgerRow {
  studentId: string;
  lane: string | null;
  reasonCategory: ReasonCategory | null;
  loggedD3: boolean | null;
  loggedD7: boolean | null;
  repId: string;
}

/** A student in the same lane who was NOT contacted — the comparison arm. */
export interface UnreachedRow {
  studentId: string;
  lane: string | null;
  loggedD3: boolean | null;
}

export interface LaneComparison {
  lane: string;
  reached: number;
  reachedLogged: number;
  unreached: number;
  unreachedLogged: number;
  /** Both rates, or null when either arm is too thin. */
  reachedRate: number | null;
  unreachedRate: number | null;
  /**
   * Difference in percentage points, or null. The label is ALWAYS
   * "associated with" — this design cannot support a causal claim and must
   * never be rendered as though it does.
   */
  differencePoints: number | null;
  evidence: Evidence;
  note: string | null;
}

/**
 * Compare contacted against uncontacted students WITHIN THE SAME LANE.
 *
 * Comparing across lanes is worthless: reps work the students most likely to
 * respond, so a raw "contacted students log more" comparison measures the
 * rep's TARGETING, not their effect. Same-lane is the weakest control that is
 * still honest, and it is still not causal — the rep picks whom to call inside
 * the lane too.
 */
export function compareByLane(
  ledger: readonly LedgerRow[], unreached: readonly UnreachedRow[],
): LaneComparison[] {
  const lanes = new Set<string>();
  for (const r of ledger) if (r.lane) lanes.add(r.lane);

  return [...lanes].sort().map((lane) => {
    const reachedRows = ledger.filter((r) => r.lane === lane && r.loggedD3 !== null);
    const unreachedRows = unreached.filter((r) => r.lane === lane && r.loggedD3 !== null);
    const reachedLogged = reachedRows.filter((r) => r.loggedD3 === true).length;
    const unreachedLogged = unreachedRows.filter((r) => r.loggedD3 === true).length;

    const thin = reachedRows.length < MIN_PER_ARM_FOR_COMPARISON
      || unreachedRows.length < MIN_PER_ARM_FOR_COMPARISON;

    if (thin) {
      return {
        lane,
        reached: reachedRows.length, reachedLogged,
        unreached: unreachedRows.length, unreachedLogged,
        reachedRate: null, unreachedRate: null, differencePoints: null,
        evidence: 'UNAVAILABLE' as const,
        note: `${reachedRows.length} contacted vs ${unreachedRows.length} not — `
          + `each arm needs ${MIN_PER_ARM_FOR_COMPARISON} measured outcomes before a comparison means anything.`,
      };
    }

    const rr = reachedLogged / reachedRows.length;
    const ur = unreachedLogged / unreachedRows.length;
    return {
      lane,
      reached: reachedRows.length, reachedLogged,
      unreached: unreachedRows.length, unreachedLogged,
      reachedRate: rr, unreachedRate: ur,
      differencePoints: Math.round((rr - ur) * 1000) / 10,
      evidence: 'ASSOCIATED' as const,
      note: 'Associated with contact. Reps choose whom to call inside a lane, '
        + 'so this is not evidence that the call caused the difference.',
    };
  });
}

export interface InterventionPicture {
  interventions: number;
  studentsContacted: number;
  reps: number;
  /** Interventions whose 7-day window has not elapsed. Not failures. */
  awaitingOutcome: number;
  loggedD3: Measure;
  loggedD7: Measure;
  byLane: LaneComparison[];
}

export function interventionPicture(
  ledger: readonly LedgerRow[], unreached: readonly UnreachedRow[],
): InterventionPicture {
  const measuredD3 = ledger.filter((r) => r.loggedD3 !== null);
  const measuredD7 = ledger.filter((r) => r.loggedD7 !== null);
  return {
    interventions: ledger.length,
    studentsContacted: new Set(ledger.map((r) => r.studentId)).size,
    reps: new Set(ledger.map((r) => r.repId)).size,
    awaitingOutcome: ledger.length - measuredD7.length,
    loggedD3: measure('Logged within 3 days of contact',
      measuredD3.filter((r) => r.loggedD3 === true).length, measuredD3.length),
    loggedD7: measure('Logged within 7 days of contact',
      measuredD7.filter((r) => r.loggedD7 === true).length, measuredD7.length),
    byLane: compareByLane(ledger, unreached),
  };
}

// ── Per rep: what happened after THEIR calls ───────────────────────────────
//
// With one rep, aggregate intervention outcomes were enough. With two, they
// are exactly the wrong shape: they cannot tell you whether one rep's students
// came back and the other's did not, which is the entire question two hires
// exist to answer.
//
// NOT A LEADERBOARD, and the ordering is the proof: reps are sorted by NAME,
// never by outcome. A sorted-by-performance list is a ranking, a ranking is a
// target, and a target gets gamed — which is how a student-success rep quietly
// becomes a dialler.
//
// The data was always here (intervention_ledger.rep_id joined to the outcome
// sweep). Nothing surfaced it split.

export interface RepOutcome {
  repId: string;
  name: string;
  /** Distinct students this rep contacted. A count is a FACT at any size. */
  studentsContacted: number;
  /** Interventions whose 7-day window has not elapsed. Not failures. */
  awaitingOutcome: number;
  loggedD3: Measure;
  loggedD7: Measure;
  reasonsCaptured: Measure;
  /**
   * Completed sessions among the students this rep contacted. ASSOCIATED —
   * the rep did not deliver the session, a mentor did, and the student may
   * have booked for reasons of their own. null = not measured.
   */
  sessionsCompleted: number | null;
  /**
   * Calls logged. Deliberately last in the interface and rendered last, small
   * and grey: a rep needs their own throughput to plan a day, and it is never
   * the score.
   */
  callsLogged: number;
}

export interface RepOutcomeInput {
  /** Display names by rep id. A missing name renders as the id, never blank. */
  names?: ReadonlyMap<string, string>;
  /** Completed sessions among each rep's contacted students, when measured. */
  sessionsByRep?: ReadonlyMap<string, number>;
}

export function repOutcomes(
  ledger: readonly LedgerRow[], input: RepOutcomeInput = {},
): RepOutcome[] {
  const byRep = new Map<string, LedgerRow[]>();
  for (const r of ledger) {
    const a = byRep.get(r.repId);
    if (a) a.push(r); else byRep.set(r.repId, [r]);
  }

  const rows: RepOutcome[] = [...byRep.entries()].map(([repId, own]) => {
    const measuredD3 = own.filter((r) => r.loggedD3 !== null);
    const measuredD7 = own.filter((r) => r.loggedD7 !== null);
    const withReason = own.filter((r) => r.reasonCategory != null);
    return {
      repId,
      name: input.names?.get(repId) ?? repId,
      studentsContacted: new Set(own.map((r) => r.studentId)).size,
      awaitingOutcome: own.length - measuredD7.length,
      loggedD3: measure('Logged within 3 days',
        measuredD3.filter((r) => r.loggedD3 === true).length, measuredD3.length),
      loggedD7: measure('Logged within 7 days',
        measuredD7.filter((r) => r.loggedD7 === true).length, measuredD7.length),
      reasonsCaptured: measure('Calls with a reason captured', withReason.length, own.length),
      sessionsCompleted: input.sessionsByRep?.get(repId) ?? null,
      callsLogged: own.length,
    };
  });

  // BY NAME. Never by any outcome — see the note above.
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Question 3: are students converting into COMPLETED sessions? ────────────

export interface ConversionPicture {
  created: number;
  scheduled: number;
  active: number;
  completed: number;
  cancelled: number;
  expired: number;
  completedWithObservedStart: number;
  completedStartUnknown: number;
  settled: number;
  completion: Measure;
  /** True while the product has never delivered one. */
  neverDelivered: boolean;
}

/**
 * Reuses deliveryCounts/completionRate — session-lifecycle is THE authority on
 * what a session is. This only dresses it for the screen.
 *
 * A BOOKING IS NOT A CONVERSION. Until a session is completed, the student has
 * paid and received nothing, and counting that as conversion is how a company
 * congratulates itself for taking money.
 */
export function conversionPicture(rows: readonly SessionRow[]): ConversionPicture {
  const c = deliveryCounts(rows);
  const rate = completionRate(c);
  return {
    created: c.total,
    scheduled: c.scheduled, active: c.active, completed: c.completed,
    cancelled: c.cancelled, expired: c.expired,
    completedWithObservedStart: c.completedWithObservedStart,
    completedStartUnknown: c.completedStartUnknown,
    settled: c.settled,
    completion: rate == null
      ? {
        label: 'Sessions completed', count: c.completed, of: c.settled, rate: null,
        evidence: 'UNAVAILABLE',
        note: `${c.settled} sessions have finished either way — too few to state a completion rate.`,
      }
      : { label: 'Sessions completed', count: c.completed, of: c.settled, rate, evidence: 'FACT', note: null },
    neverDelivered: c.completed === 0,
  };
}

// ── Question 4: what are we learning? ───────────────────────────────────────

export interface ReasonCount {
  reason: ReasonCategory;
  label: string;
  count: number;
  /** Something the PRODUCT can fix, as opposed to a fact about the student. */
  productFixable: boolean;
}

export interface LearningPicture {
  /** Interventions where the rep captured a structured reason. */
  withReason: number;
  withoutReason: number;
  /** Capture discipline — a ledger nobody fills teaches nothing. */
  capture: Measure;
  top: ReasonCount[];
  productFixableCount: number;
  /**
   * Honest statement of what this sample can support. Counts are always
   * reportable; a "top reason" claim needs more than a handful.
   */
  readable: boolean;
}

export function learningPicture(ledger: readonly LedgerRow[]): LearningPicture {
  const withReason = ledger.filter((r) => r.reasonCategory != null);
  const tally = new Map<ReasonCategory, number>();
  for (const r of withReason) {
    tally.set(r.reasonCategory!, (tally.get(r.reasonCategory!) ?? 0) + 1);
  }
  const top: ReasonCount[] = [...tally.entries()]
    .map(([reason, count]) => ({
      reason, count,
      label: REASON_LABEL[reason],
      productFixable: PRODUCT_FIXABLE_REASONS.has(reason),
    }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

  return {
    withReason: withReason.length,
    withoutReason: ledger.length - withReason.length,
    capture: measure('Calls with a reason captured', withReason.length, ledger.length),
    top,
    productFixableCount: top.filter((t) => t.productFixable).reduce((n, t) => n + t.count, 0),
    // Below this the "top reason" is one student's bad morning.
    readable: withReason.length >= MIN_SAMPLE_FOR_RATE,
  };
}

// ── Reachability: which students the product can speak to at all ────────────

export interface ReachPicture {
  students: number;
  withPush: number;
  withPhoneOnly: number;
  unreachable: number;
  pushReach: Measure;
  /**
   * The students for whom a HUMAN is currently the only channel. This is the
   * number that justifies a rep existing at all, and it is not a sales metric
   * — it is a product gap measured honestly.
   */
  humanIsOnlyChannel: number;
}

export function reachPicture(
  rows: readonly { hasPush: boolean; hasPhone: boolean }[],
): ReachPicture {
  const withPush = rows.filter((r) => r.hasPush).length;
  const phoneOnly = rows.filter((r) => !r.hasPush && r.hasPhone).length;
  return {
    students: rows.length,
    withPush,
    withPhoneOnly: phoneOnly,
    unreachable: rows.filter((r) => !r.hasPush && !r.hasPhone).length,
    pushReach: measure('Reachable by push', withPush, rows.length),
    humanIsOnlyChannel: phoneOnly,
  };
}
