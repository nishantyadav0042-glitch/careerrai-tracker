import type { Exception } from '@/lib/os/exception';
import type { UnbookableReason } from '@/lib/session-assignment';

/**
 * ── A PAID STUDENT WHO CANNOT BOOK IS AN OPERATIONAL EXCEPTION ──────────────
 *
 * /api/sessions/schedule returns `state: 'needs_team'` and tells the student
 * "Our team will set your session time for you." Until now that promise had no
 * owner: `needs_team` was returned to the browser and written NOWHERE — no
 * notification, no queue, no alert. A student paid ₹299, could not book, and
 * the only record was a sentence on their screen.
 *
 * THIS ADDS NO NEW SYSTEM. Two things already existed and neither was used:
 *
 *   1. os/exception.ts — the Exception Contract. The founder was explicit:
 *      "Don't create another workspace. One primitive." So a blocked credit
 *      becomes an Exception, not a row in a bespoke table and not a dashboard.
 *      SCALE-CONTRACT says the same: one Exception primitive, never a new
 *      surface.
 *   2. session_credits already carries `owner`, `next_action`,
 *      `failure_reason` and `failure_at`, and the status `booking_blocked`.
 *      The schema was ready; nothing wrote to it.
 *
 * Everything here is PURE. No I/O, no clock, no database — so every rule below
 * is testable exhaustively, and the callers stay thin.
 */

/** The machine signature. Same code = same kind of problem = one incident. */
export const BLOCKED_CREDIT_CODE = 'paid_credit_unbookable';

/** The facts a caller must supply. Never inferred, never invented. */
export interface BlockedCreditInput {
  creditId: string;
  studentId: string;
  studentLabel: string;
  buddyId: string | null;
  buddyLabel: string | null;
  status: string;
  amountPaise: number | null;
  /** When the mentor was attached. Null when nobody has been assigned yet. */
  assignedAtMs: number | null;
  /** Set once the credit points at a session — then it is not blocked. */
  videoSessionId: string | null;
  /** Why the mentor cannot be booked, or null when they can. */
  reason: UnbookableReason | null;
}

/**
 * The states in which a credit is genuinely OWED a session.
 *
 * `paid` and `assigned` are the obvious ones. `booking_blocked` belongs here
 * too: it is the state a credit lands in when a mentor cancelled or nobody
 * joined — paid for, not delivered, explicitly rebookable. A credit already
 * `scheduled`, `completed` or `refunded` is not blocked, and one in
 * `assignment_failed` carries no mentor at all, which is a different recovery.
 */
const OWES_A_SESSION = new Set(['paid', 'assigned', 'booking_blocked']);

/** Severity climbs with how long a paying student has been stuck. */
const CRITICAL_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Is this credit blocked right now?
 *
 * Deterministic and total: the same facts always give the same answer, and
 * every state is decided rather than falling through.
 */
export function isBookingBlocked(input: BlockedCreditInput): boolean {
  if (input.videoSessionId) return false;      // already booked — nothing owed
  if (!OWES_A_SESSION.has(input.status)) return false;
  if (!input.buddyId) return false;            // no mentor yet is a different problem
  return input.reason !== null;
}

/** Whole days a student has been waiting, for evidence that is never invented. */
export function daysBlocked(assignedAtMs: number | null, nowMs: number): number | null {
  if (assignedAtMs === null) return null;
  return Math.max(0, Math.floor((nowMs - assignedAtMs) / 86_400_000));
}

/** What the student was told. Kept beside the exception so ops sees the promise. */
const PROMISE_MADE: Record<UnbookableReason, string> = {
  no_availability: 'Your buddy has not opened their calendar yet. Our team will set your session time for you.',
  not_taking_bookings: 'Your buddy is not taking bookings this week. Our team will arrange your session.',
  no_meeting_room: 'We are getting your buddy’s meeting room ready. Our team will confirm your session time.',
};

/**
 * Turn a blocked credit into an Exception — or null when it is not blocked.
 *
 * `destination` is required by the contract for a reason: an exception you
 * cannot drill into is a chart, and the contract forbids charts. It points at
 * the exact student.
 */
export function blockedCreditException(
  input: BlockedCreditInput,
  nowMs: number,
): Exception | null {
  if (!isBookingBlocked(input)) return null;

  const reason = input.reason!;
  const days = daysBlocked(input.assignedAtMs, nowMs);
  const rupees = input.amountPaise === null ? null : Math.round(input.amountPaise / 100);

  // Money already taken plus a student who cannot use it is the definition of
  // 'critical' in this vocabulary — but only once they have actually waited.
  // Flagging a booking blocked for ten minutes as critical trains people to
  // ignore critical.
  const stuckLong = days !== null && nowMs - (input.assignedAtMs ?? nowMs) >= CRITICAL_AFTER_MS;
  const severity = stuckLong ? 'critical' : 'high';

  return {
    id: `${BLOCKED_CREDIT_CODE}:${input.creditId}`,
    code: BLOCKED_CREDIT_CODE,
    domain: 'revenue',
    entity: { kind: 'student', id: input.studentId, label: input.studentLabel },
    severity,
    reason: rupees === null
      ? `Paid session cannot be booked — ${reason.replace(/_/g, ' ')}.`
      : `₹${rupees} paid, session cannot be booked — ${reason.replace(/_/g, ' ')}.`,
    detectedAtMs: nowMs,
    evidence: {
      creditId: input.creditId,
      amountRupees: rupees,
      daysBlocked: days,
      unbookableReason: reason,
      buddy: input.buddyLabel,
      creditStatus: input.status,
      promiseShownToStudent: PROMISE_MADE[reason],
    },
    // ONE action, and deliberately not "reassign". Reassignment overrides a
    // human decision and cuts whatever conversation is already in flight; that
    // is a judgement call for a person, not a suggested default.
    suggestedAction: {
      label: input.buddyLabel
        ? `Open ${input.buddyLabel}'s availability`
        : 'Open mentor availability',
      route: '/admin/buddies/roster',
    },
    // Nothing self-heals here: the fix is a human opening a calendar. Claiming
    // 'attempted' would be a lie in a field ops uses to decide whether to act.
    recovery: { attempted: false, status: 'none' },
    owner: 'founder',
    destination: `/sales/student/${input.studentId}`,
    lifecycle: 'detected',
  };
}

/** The producer: many credits in, the blocked ones out, newest problem last. */
export function blockedCreditExceptions(
  inputs: readonly BlockedCreditInput[],
  nowMs: number,
): Exception[] {
  return inputs
    .map((i) => blockedCreditException(i, nowMs))
    .filter((e): e is Exception => e !== null);
}

/**
 * The durable half — what to write on the credit so the state outlives the
 * request that noticed it and is answerable in SQL.
 *
 * Returns null when there is nothing to change. That is what makes repeated
 * detection idempotent: a credit already marked blocked for the SAME reason is
 * left alone, so `failure_at` keeps meaning "since when", not "last time
 * anyone looked". Overwriting it every sweep would erase the age that decides
 * severity — the one fact ops needs most.
 */
export interface CreditBlockPatch {
  status: 'booking_blocked';
  owner: 'ops';
  /** A sentence, matching the release path's convention — ops reads this, not an enum. */
  next_action: string;
  failure_reason: UnbookableReason;
  failure_at: string;
}

/** What ops is actually being asked to do, per unbookable reason. */
export const NEXT_ACTION_FOR: Record<UnbookableReason, string> = {
  no_availability: 'Mentor has no calendar — set their availability, then tell the student',
  not_taking_bookings: 'Mentor is not taking bookings — reopen their calendar or arrange the session by hand',
  no_meeting_room: 'Mentor has no meeting room — connect their Google account or set a room, then tell the student',
};

export function creditBlockPatch(
  current: { status: string; failure_reason: string | null; failure_at: string | null },
  reason: UnbookableReason,
  nowIso: string,
): CreditBlockPatch | null {
  const alreadyRecorded =
    current.status === 'booking_blocked' &&
    current.failure_reason === reason &&
    current.failure_at !== null;
  if (alreadyRecorded) return null;

  return {
    status: 'booking_blocked',
    owner: 'ops',
    next_action: NEXT_ACTION_FOR[reason],
    failure_reason: reason,
    // Preserved when the reason is unchanged — see above. Only a NEW reason or
    // a first detection stamps a new time.
    failure_at: current.failure_reason === reason && current.failure_at
      ? current.failure_at
      : nowIso,
  };
}

/**
 * Should we alert about this credit on this run?
 *
 * One alert per credit per day. A paying student stuck for a week deserves a
 * daily reminder that they are still stuck — but not one every fifteen minutes,
 * which is how an alert channel becomes noise nobody reads.
 */
export function shouldAlert(
  lastAlertedIsoForCredit: string | null,
  todayStudyDay: string,
): boolean {
  return lastAlertedIsoForCredit !== todayStudyDay;
}
