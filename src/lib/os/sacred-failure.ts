/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

// ── When a sacred action fails, the founder finds out ───────────────────────
//
// Founder, 12 Aug, after a student pressed "Save log" twenty-five times into an
// Internal Server Error and nothing anywhere raised a hand: "I told you to
// alert me always if I face any errors."
//
// Incident #30's real cost was not the type mismatch — that was a one-line fix.
// It was that the failure was INVISIBLE: it lived only in Vercel's runtime log,
// which nobody reads at 11pm, and every student who marked a task "Half" had
// been failing silently before the founder happened to see a screenshot.
//
// So the three actions a student can never be allowed to fail at — LOGGING,
// PAYING, SIGNING UP — now write their failures to the database, where
// findSacredFailures can see them and the founder-alert cron can escalate.
//
// Rules this obeys:
//  · Best-effort ALWAYS. Recording a failure must never turn a 500 into a
//    worse 500, so every path is caught and swallowed.
//  · Reuses `client_errors` (source='server'). No new table, no migration —
//    the shape already exists: fingerprint groups identical failures, path
//    names the route, student_id keeps the drill-down to a real person.
//  · Never records the student's data, only what broke.

export type SacredAction = 'log_daily' | 'payment_order' | 'signup';

/** The route each action lives at — used as the error's `path`. */
const ROUTE: Record<SacredAction, string> = {
  log_daily: '/api/logging/log-daily',
  payment_order: '/api/payments/create-order',
  signup: '/api/auth/verify-phone-otp',
};

/**
 * Record that a sacred action failed for a real student.
 *
 * Fire-and-forget by design: callers must not await this in a way that can
 * delay the student's error response, and must not let it throw.
 */
export async function recordSacredFailure(
  admin: Admin,
  action: SacredAction,
  studentId: string | null,
  error: unknown,
): Promise<void> {
  try {
    const message =
      (error as { message?: string } | null)?.message ??
      (typeof error === 'string' ? error : 'unknown error');
    await admin.from('client_errors').insert({
      student_id: studentId,
      source: 'server',
      // The fingerprint is the ACTION, not the message — so a route failing for
      // three different reasons still counts as one thing being broken, which
      // is the question the founder actually needs answered.
      fingerprint: `sacred:${action}`,
      message: String(message).slice(0, 500),
      path: ROUTE[action],
    });
  } catch {
    // A failure to record a failure must never surface to the student.
  }
}

/** Human label for an action, used in the alert headline. */
export const ACTION_LABEL: Record<SacredAction, string> = {
  log_daily: 'save their daily log',
  payment_order: 'start a payment',
  signup: 'finish signing up',
};

/** Where the founder should look first for each action. */
export const ACTION_ROUTE: Record<SacredAction, string> = {
  log_daily: '/admin/health',
  payment_order: '/admin/payments',
  signup: '/admin/leads',
};

/**
 * How many failures of one action, inside the window, before the founder is
 * interrupted.
 *
 * Two, not one: a single 500 can be a dead phone, a cancelled request or one
 * student's bad network, and a pager that fires on noise gets muted — and a
 * muted pager is worse than none (the founder-alert cron's own rule). Two
 * failures of the SAME sacred action within fifteen minutes is a pattern, and
 * on 12 Aug it would have fired within about twenty seconds.
 */
export const SACRED_FAILURE_THRESHOLD = 2;

/** The window the threshold is counted over. */
export const SACRED_FAILURE_WINDOW_MIN = 15;

export interface SacredFailureBurst {
  action: SacredAction;
  count: number;
  /** Distinct students hit — 1 could be one unlucky person, 5 is an outage. */
  studentsHit: number;
  lastMessage: string;
  firstAt: string;
}

/**
 * Pure: turn raw failure rows into per-action bursts worth alerting on.
 *
 * Kept pure and exported so the alarm itself is testable without a database —
 * the thing that failed us on 12 Aug was an untested silent path.
 */
export function burstsFrom(
  rows: { fingerprint: string | null; message: string | null; student_id: string | null; created_at: string }[],
  threshold: number = SACRED_FAILURE_THRESHOLD,
): SacredFailureBurst[] {
  const byAction = new Map<SacredAction, typeof rows>();
  for (const r of rows) {
    const fp = r.fingerprint ?? '';
    if (!fp.startsWith('sacred:')) continue;
    const action = fp.slice('sacred:'.length) as SacredAction;
    if (!(action in ROUTE)) continue;
    byAction.set(action, [...(byAction.get(action) ?? []), r]);
  }

  const out: SacredFailureBurst[] = [];
  for (const [action, list] of byAction) {
    if (list.length < threshold) continue;
    const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    out.push({
      action,
      count: list.length,
      studentsHit: new Set(list.map((r) => r.student_id).filter(Boolean)).size,
      lastMessage: sorted[sorted.length - 1].message ?? 'unknown error',
      firstAt: sorted[0].created_at,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}
