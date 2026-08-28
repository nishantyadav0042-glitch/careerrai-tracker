// ── The single session's state machine ────────────────────────────────────────
//
// One vocabulary, one transition table, shared by every caller. The DATABASE
// is the enforcer (trigger video_session_lifecycle_guard, migration
// 20260824e); this module exists so the application can ask the same questions
// without duplicating the answers, and so the guard test can prove the two
// agree.
//
// The 24 Aug finding this exists to fix: 16 sessions, 9 expired, 7 cancelled,
// ZERO completed — because `active` was an unreachable state. Nothing in the
// codebase ever wrote it, so "did the call actually happen?" had no answer and
// conversion had no honest numerator.

export const SESSION_STATUSES = [
  'scheduled', 'active', 'completed', 'cancelled', 'expired',
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** Reached and never left. A terminal session is history, not state. */
export const TERMINAL_STATUSES = ['completed', 'cancelled', 'expired'] as const;

/**
 * The transition table. Mirrors the DB trigger exactly — the guard test reads
 * the migration and asserts they cannot drift.
 *
 * scheduled → completed is legal ON PURPOSE: a mentor who ran the call but
 * never tapped "start" has still delivered the session. Requiring an observed
 * start would only teach them to fabricate one.
 */
export const LEGAL_TRANSITIONS: Readonly<Record<SessionStatus, readonly SessionStatus[]>> = {
  scheduled: ['active', 'completed', 'cancelled', 'expired'],
  active: ['completed', 'cancelled', 'expired'],
  completed: [],
  cancelled: [],
  expired: [],
};

export function isSessionStatus(v: unknown): v is SessionStatus {
  return typeof v === 'string' && (SESSION_STATUSES as readonly string[]).includes(v);
}

export function isTerminal(s: SessionStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(s);
}

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

/**
 * Why a transition is refused, in words a human can act on. The DB raises the
 * authoritative error; this produces the message the caller shows.
 */
export function transitionRefusal(from: SessionStatus, to: SessionStatus): string | null {
  if (canTransition(from, to)) return null;
  if (from === to) return `This session is already ${from}.`;
  if (isTerminal(from)) return `This session is already ${from} and cannot be reopened.`;
  return `A ${from} session cannot become ${to}.`;
}

// ── Delivery, counted honestly ──────────────────────────────────────────────

export interface SessionRow {
  session_status: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface DeliveryCounts {
  total: number;
  scheduled: number;
  active: number;
  completed: number;
  cancelled: number;
  expired: number;
  /** Completed AND we observed the start — the strongest evidence we hold. */
  completedWithObservedStart: number;
  /** Completed but nobody tapped start. Real delivery, weaker evidence. */
  completedStartUnknown: number;
  /**
   * Sessions that reached a terminal state — the only honest denominator for
   * a completion rate. Counting `scheduled` rows that simply have not happened
   * yet as failures is how a young product invents a crisis.
   */
  settled: number;
}

export function deliveryCounts(rows: readonly SessionRow[]): DeliveryCounts {
  const c = (s: string) => rows.filter((r) => r.session_status === s).length;
  const completedRows = rows.filter((r) => r.session_status === 'completed');
  const withStart = completedRows.filter((r) => r.started_at != null).length;
  return {
    total: rows.length,
    scheduled: c('scheduled'),
    active: c('active'),
    completed: completedRows.length,
    cancelled: c('cancelled'),
    expired: c('expired'),
    completedWithObservedStart: withStart,
    completedStartUnknown: completedRows.length - withStart,
    settled: c('completed') + c('cancelled') + c('expired'),
  };
}

/**
 * Completion rate, or null when the sample cannot carry one.
 *
 * The founder MIS renders null as UNAVAILABLE rather than 0%. With 16 sessions
 * ever created, "0% completion" reads as a damning product fact when it is
 * really a sample too small to have a rate at all — and the same number would
 * appear if the table were simply new.
 */
export const MIN_SESSIONS_FOR_RATE = 10;

export function completionRate(counts: DeliveryCounts): number | null {
  if (counts.settled < MIN_SESSIONS_FOR_RATE) return null;
  return counts.completed / counts.settled;
}
