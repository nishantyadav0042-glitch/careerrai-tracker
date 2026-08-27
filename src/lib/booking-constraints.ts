// Turning a Postgres constraint violation into something a human can act on.
//
// The rules that govern booking live in the database — that is deliberate, and
// it is what makes them hold under a race (see Incident #21). The cost of
// putting a rule down there is that Postgres states it as `23P01`, and a route
// that does not recognise the code answers `500 Couldn't save the session`.
//
// A 500 is wrong twice over. It tells the user something is broken when
// nothing is, and it invites a retry that can only fail the same way forever.
// A business rule is a 409: "this is not allowed, and here is what to do".
//
// One module, so the two write paths cannot drift apart on wording — and so
// the NEXT write path someone adds has an obvious thing to call.

/** Who is reading the message. The same rule reads differently from each side. */
export type Audience = 'buddy' | 'student';

export interface ConstraintFailure {
  status: 409;
  reason: 'session_exists' | 'buddy_double_booked' | 'outside_availability';
  message: string;
}

/** Postgres error shape, as surfaced by supabase-js. */
export interface PgError { code?: string; message?: string }

// Only the reasons whose wording is FIXED here. `outside_availability` is
// deliberately absent: its sentence comes from the trigger that refused the
// write, so there is nothing for this table to hold.
type FixedWordingReason = Exclude<ConstraintFailure['reason'], 'outside_availability'>;

const MESSAGES: Record<FixedWordingReason, Record<Audience, string>> = {
  // one_live_session_per_pair
  session_exists: {
    buddy: 'You already have an active meeting with this student. Cancel or complete it before booking another session.',
    student: 'You already have an active meeting with this mentor. Cancel or complete it before booking another session.',
  },
  // no_overlapping_buddy_sessions
  buddy_double_booked: {
    buddy: 'You already have another session at that time. Every session of yours runs in the same room, so two students can never share a slot — pick a time at least 15 minutes clear of your other calls.',
    student: 'This mentor is no longer available for the selected time. Please pick another slot.',
  },
};

// Only reached if Postgres hands back a check_violation with no message at
// all. The rule still has to be reported, and reported as a rule.
const FALLBACK_AVAILABILITY: Record<Audience, string> = {
  buddy: 'That time is outside your availability. Pick a slot inside your working hours, on a day you work, and clear of your time off.',
  student: 'This mentor is not available at that time. Please pick another slot.',
};

/**
 * A booking-rule violation, or null if this error is something else entirely.
 *
 * Returning null matters as much as returning a failure: a disk-full error
 * dressed up as "you already have a meeting" sends someone hunting for a
 * session that does not exist. Only these three codes are business rules.
 */
export function constraintFailure(
  error: PgError | null | undefined,
  audience: Audience = 'buddy',
): ConstraintFailure | null {
  if (error?.code === '23505') {
    return { status: 409, reason: 'session_exists', message: MESSAGES.session_exists[audience] };
  }
  if (error?.code === '23P01') {
    return { status: 409, reason: 'buddy_double_booked', message: MESSAGES.buddy_double_booked[audience] };
  }
  // 23514 — video_session_within_availability(). Unlike the two above, this
  // rule has no fixed wording here: the trigger raises a different sentence for
  // a non-working day, for hours, for time off and for a mentor who has paused
  // bookings, and each is already written for a human. Restating them in this
  // module would be a second definition of the mentor's week that drifts the
  // first time someone edits the migration (Incident #23).
  //
  // book_session_credit() makes the same choice for the same reason — its
  // check_violation handler returns `sqlerrm` verbatim, because "their messages
  // are already written for a student".
  if (error?.code === '23514') {
    return {
      status: 409,
      reason: 'outside_availability',
      message: error.message?.trim() || FALLBACK_AVAILABILITY[audience],
    };
  }
  return null;
}
