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
  reason: 'session_exists' | 'buddy_double_booked';
  message: string;
}

/** Postgres error shape, as surfaced by supabase-js. */
export interface PgError { code?: string; message?: string }

const MESSAGES: Record<ConstraintFailure['reason'], Record<Audience, string>> = {
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

/**
 * A booking-rule violation, or null if this error is something else entirely.
 *
 * Returning null matters as much as returning a failure: a disk-full error
 * dressed up as "you already have a meeting" sends someone hunting for a
 * session that does not exist. Only these two codes are business rules.
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
  return null;
}
