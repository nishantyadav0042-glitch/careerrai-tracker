import { createCalendarHold } from './google-meet';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── ONE PLACE A BOOKED SESSION REACHES GOOGLE CALENDAR ───────────────────────
//
// 28 Aug. A session could be booked two ways and only one of them told Google.
// /api/sessions/schedule (the student picking their own slot) placed a BUSY
// hold on the mentor's calendar and stored its event id;
// /api/calendar/schedule-meeting (the mentor booking for a student) made ZERO
// Calendar calls. Same product event, two different outcomes.
//
// That asymmetry is not cosmetic, because the rest of the lifecycle assumes the
// event exists: reschedule-meeting moves `google_event_id` and cancel-meeting
// deletes it. A mentor-created booking therefore produced a session with
// nothing to move and nothing to delete — the mentor's own hour never showed as
// busy, so they could give the slot away to someone else, which is precisely
// the failure the hold was introduced to prevent.
//
// It has cost nothing so far only because google_oauth_tokens has been empty
// for the product's entire life. The moment one mentor connects, the two paths
// start behaving differently. So this is the single authority both call, and
// `session-calendar.guard.test.ts` fails if a third booking path ever skips it.
//
// A HOLD, NOT A ROOM. createCalendarHold sends no conferenceData, so the
// one-room-per-buddy invariant is untouched and the join link carried in the
// hold is the buddy's existing permanent one.
//
// BEST EFFORT, AND DELIBERATELY SO. A booking is already committed by the time
// this runs — the session exists and, on the student path, the credit is spent.
// Failing the request because Google was slow would take away something the
// student already holds. The database constraint no_overlapping_buddy_sessions
// is what actually prevents double-booking; the calendar is a courtesy to the
// human, not a lock. Never fatal, and never silent either: a silent failure
// here is the defect this module exists to close.

export interface SessionCalendarHold {
  sessionId: string;
  studentId: string;
  buddyId: string;
  /** Session start, ISO 8601. */
  startIso: string;
  durationMinutes: number;
  /** The buddy's permanent room, carried into the hold so the invite has it. */
  meetUrl: string | null;
  /** Event title. Defaults to the student's first name, as the student path has always used. */
  title?: string;
}

export type CalendarHoldResult =
  /** The hold exists on the mentor's calendar and its id is stored. */
  | { held: true; eventId: string }
  /**
   * No hold. `reason` is 'not_connected' until a mentor connects Google, which
   * is the EXPECTED answer today and not an error.
   */
  | { held: false; reason: string };

/**
 * Put a booked session on the mentor's Google Calendar, and remember the event.
 *
 * Callers must not branch on the result to decide whether the booking counts —
 * the booking is already real. It is returned so a caller can log or report
 * honestly, and so tests can assert the outcome.
 */
export async function holdSessionOnCalendar(
  admin: { from: (t: string) => any },
  opts: SessionCalendarHold,
): Promise<CalendarHoldResult> {
  try {
    const { data: student } = await admin
      .from('profiles').select('full_name, email').eq('id', opts.studentId).maybeSingle();

    const studentFirst = ((student?.full_name as string | null) ?? 'a student').split(' ')[0];

    const hold = await createCalendarHold({
      buddyUserId: opts.buddyId,
      title: opts.title ?? `CareerRai 1:1 — ${studentFirst}`,
      start: new Date(opts.startIso),
      durationMinutes: opts.durationMinutes,
      meetLink: opts.meetUrl,
      // The student's calendar invite depends on us knowing their address. When
      // we do not, the hold is still placed — the mentor's hour is protected
      // either way, and the student still has the link in-app.
      studentEmail: (student?.email as string | null) ?? null,
    });

    if (!hold.ok) {
      // Logged at info, not error: 'not_connected' is the normal answer until a
      // mentor connects Google, and shouting about it would drown the failures
      // that actually matter.
      console.log('[session-calendar] hold skipped', opts.sessionId, hold.reason);
      return { held: false, reason: hold.reason };
    }

    const { error } = await admin
      .from('video_sessions')
      .update({ google_event_id: hold.eventId })
      .eq('id', opts.sessionId);

    if (error) {
      // The hold exists in Google but we cannot address it again. Say so
      // loudly: cancel and reschedule both key off google_event_id, so from
      // here a cancellation leaves a stale hold on the mentor's calendar.
      console.error(
        '[session-calendar] hold created but id not stored',
        opts.sessionId, hold.eventId, error.message,
      );
      return { held: false, reason: 'id_not_stored' };
    }

    return { held: true, eventId: hold.eventId };
  } catch (err) {
    console.error('[session-calendar] hold failed', opts.sessionId, err);
    return { held: false, reason: 'threw' };
  }
}
