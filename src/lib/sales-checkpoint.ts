import type { SalesObjective } from '@/lib/sales-objective';
import { isConnectedOutcome } from '@/lib/sales-disposition';

// ── THE DAY, AS THE SYSTEM SEES IT ──────────────────────────────────────────
//
// Founder, 29 Aug 2026: "The salesman should NOT have to say 'today I was given
// 72 leads.' The system already knows. His only job should be to execute the
// interaction and select the outcome."
//
// So every number here is derived from rows the platform wrote. Nothing on this
// screen is self-reported, which is what makes it worth trusting — and also
// what stops it becoming a reporting chore that eats the time it is supposed to
// be measuring.
//
// WHAT THIS IS FOR, and the line it must not cross. It answers coverage: did
// the students who mattered actually get reached? It is NOT a productivity
// score. SALES-OS.md §0 puts activity at P5 and forbids it becoming P0, and the
// difference shows up in one design choice: `worked` counts DISPOSITIONS, never
// taps. A counter any tap could advance is a counter that will be advanced by
// tapping.
//
// The single most useful number here is not "worked". It is
// `highPriorityRemaining` — because missing seven hot students matters more
// than completing seventy cold ones, and a plain completion percentage hides
// exactly that.

/** One surfaced-opportunity row, as the checkpoint needs it. */
export interface OpportunityRow {
  studentId: string;
  objective: SalesObjective;
  /** Sort position within the day. Lower is more urgent. */
  rank: number;
  /** Null until a real disposition lands. */
  workedAt: string | null;
  outcome: string | null;
}

export interface ObjectiveTally {
  surfaced: number;
  /** Opportunities actioned — INCLUDING dials nobody answered. */
  worked: number;
  /**
   * Opportunities where a human actually spoke to the student.
   *
   * Founder, 29 Aug 2026, on how this experiment could produce a false
   * positive: "the founder sees 500 'worked' and assumes 500 meaningful
   * conversations." That is a real hazard here, because `worked` is set by ANY
   * disposition and `no_answer` is a disposition — a counsellor can work a
   * whole day of unanswered dials and be at 100% coverage, honestly.
   *
   * Coverage answers "did we act on the right students". Only this answers
   * "did anyone actually talk". Reporting the first without the second invites
   * exactly the wrong conclusion, so the two travel together.
   */
  reached: number;
  remaining: number;
}

export interface DayCheckpoint {
  surfaced: number;
  /** Actioned, including unanswered dials. NOT a count of conversations. */
  worked: number;
  /** Actually spoke to a human. The honest denominator for anything about
   *  intervention quality — see ObjectiveTally.reached. */
  reached: number;
  remaining: number;
  retention: ObjectiveTally;
  conversion: ObjectiveTally;
  /**
   * Unworked opportunities inside the top slice of the day.
   *
   * The founder's leakage number. Reported as a COUNT here and rendered as
   * named students by the caller — SCALE-CONTRACT §4: a count you cannot drill
   * into is a chart, and this system does not permit charts.
   */
  highPriorityRemaining: number;
  /** The unworked high-priority students themselves, most urgent first. */
  highPriorityStudentIds: string[];
  /**
   * Coverage of what mattered, 0–100, or NULL when nothing was surfaced.
   *
   * Null rather than 100: a day with no opportunities is not a perfectly
   * covered day, and rendering it as 100% would be a precise lie about an
   * empty set (L1). A quiet Tuesday is information about the base, not
   * evidence about the counsellor.
   */
  coveragePercent: number | null;
}

/**
 * How many of the day's opportunities count as "high priority".
 *
 * A fixed slice rather than a priority threshold, deliberately: lane ranks
 * shift as the engine is tuned, and a founder-facing number whose meaning
 * changes when we retune the queue is worse than useless. "The top twenty the
 * system chose" survives every retune.
 */
export const HIGH_PRIORITY_SLICE = 20;

const emptyTally = (): ObjectiveTally => ({ surfaced: 0, worked: 0, reached: 0, remaining: 0 });

/**
 * Compute one counsellor's day from the rows the platform wrote.
 *
 * Pure: rows in, answers out. The caller supplies rows for one rep and one IST
 * day; this function does not know what today is, which is what makes the
 * day-boundary rule testable rather than a property of when the test ran.
 */
export function computeCheckpoint(rows: readonly OpportunityRow[]): DayCheckpoint {
  const retention = emptyTally();
  const conversion = emptyTally();
  let worked = 0;
  let reached = 0;

  for (const r of rows) {
    const t = r.objective === 'retention' ? retention : conversion;
    t.surfaced++;
    // A disposition is the only thing that counts. `workedAt` is written by the
    // log route and by nothing else — no tap, open or dial reaches it.
    if (r.workedAt) {
      t.worked++; worked++;
      // ...but a disposition of `no_answer` is a dial, not a conversation.
      // The disposition vocabulary already draws this line; we read it rather
      // than re-deciding it here, so the two can never disagree about what
      // counts as having spoken to somebody.
      if (isConnectedOutcome(r.outcome)) { t.reached++; reached++; }
    } else { t.remaining++; }
  }

  // Rank order decides the top slice, not the order rows came back from the
  // database — an unstable sort here would make the leakage list flicker
  // between page loads and destroy trust in the one number that must be
  // trusted. Ties break on studentId so the order is total.
  const byRank = [...rows].sort((a, b) =>
    a.rank !== b.rank ? a.rank - b.rank : (a.studentId < b.studentId ? -1 : a.studentId > b.studentId ? 1 : 0));
  const top = byRank.slice(0, HIGH_PRIORITY_SLICE);
  const highPriorityStudentIds = top.filter((r) => !r.workedAt).map((r) => r.studentId);

  return {
    surfaced: rows.length,
    worked,
    reached,
    remaining: rows.length - worked,
    retention,
    conversion,
    highPriorityRemaining: highPriorityStudentIds.length,
    highPriorityStudentIds,
    coveragePercent: rows.length === 0 ? null : Math.round((worked / rows.length) * 100),
  };
}

/**
 * The line the counsellor reads at the top of their day.
 *
 * Deliberately not a percentage and deliberately not a target. It states what
 * is left, because that is the only part they can act on, and it names the
 * high-priority remainder separately because those are the ones worth staying
 * late for.
 */
export function describeCheckpoint(c: DayCheckpoint): string {
  if (c.surfaced === 0) return 'Nothing needs attention right now.';
  if (c.remaining === 0) return `All ${c.surfaced} worked. Nothing left today.`;
  const base = `${c.worked} of ${c.surfaced} worked · ${c.remaining} left`;
  return c.highPriorityRemaining > 0
    ? `${base} · ${c.highPriorityRemaining} of those are top priority`
    : base;
}
