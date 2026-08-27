import { createAdminClient } from '@/lib/supabase/admin';
import { createCalendarHold } from '@/lib/google-meet';

// ── PUTTING A BOOKED SESSION ON THE MENTOR'S CALENDAR ───────────────────────
//
// ONE implementation, both booking doors. It lived inside
// sessions/schedule/route.ts as a private function, which meant the student
// self-serve path put sessions on the mentor's calendar and the mentor-booked
// path (calendar/schedule-meeting) did not — a gap nothing surfaced, because
// every symptom of it is an ABSENCE:
//
//   · the mentor's hour was never blocked, so they saw a free slot and could
//     give it away
//   · the student was never added as an attendee, so Google never sent them
//     the invite or its reminders
//   · no google_event_id was stored, so a later cancel or reschedule had
//     nothing to move
//
// Nothing errored. The session existed, the link worked, and the calendar side
// of it simply never happened for half the bookings.
//
// A HOLD, NOT A ROOM. createCalendarHold sends no conferenceData, so the
// one-room-per-buddy invariant is untouched and the join link carried in the
// event is the buddy's existing permanent one. Minting a second room here is
// the shape of Incident #21.
//
// BEST EFFORT, AND THAT IS DELIBERATE. Until a mentor connects Google this
// returns 'not_connected' every time. That must never cost a student a booking
// they already hold: the session exists, the credit is spent, and the app row
// is the source of truth. no_overlapping_buddy_sessions is what actually
// prevents double-booking — the calendar is a courtesy to the human, not a
// lock.
//
// The event id lands on video_sessions.google_event_id, a contract
// cancel-meeting and reschedule-meeting already honour: cancel deletes it only
// when it differs from the buddy's permanent anchor, reschedule PATCHes it so
// the Meet link survives the move.

export interface SessionCalendarInput {
  sessionId: string;
  studentId: string;
  buddyId: string;
  startIso: string;
  durationMinutes: number;
  /** The buddy's permanent room link, carried into the event description. */
  meetUrl: string | null;
  /** For log lines, so two callers stay tellable apart in production. */
  source: 'sessions/schedule' | 'calendar/schedule-meeting';
}

/**
 * Never throws, never returns a failure the caller must handle: by the time
 * this runs the booking is already committed, and there is no answer it could
 * give that should change what the student is told.
 */
export async function holdTheMentorsHour(
  admin: ReturnType<typeof createAdminClient>,
  opts: SessionCalendarInput,
): Promise<void> {
  try {
    const { data: student } = await admin
      .from('profiles').select('full_name, email').eq('id', opts.studentId).maybeSingle();

    const studentFirst = ((student?.full_name as string | null) ?? 'a student').split(' ')[0];

    // THE STUDENT'S EMAIL IS THE WHOLE INVITE. createCalendarHold turns it into
    // an `attendees` entry, and the request goes out with sendUpdates=all, so
    // Google itself delivers the invitation and applies the calendar's default
    // reminders. With no email we send attendees:[] and the student gets
    // nothing — no invite, no reminder — while the event still blocks the
    // mentor's hour. That asymmetry is why student Google sign-in matters:
    // it is what puts an address here.
    const hold = await createCalendarHold({
      buddyUserId: opts.buddyId,
      title: `CareerRai 1:1 — ${studentFirst}`,
      start: new Date(opts.startIso),
      durationMinutes: opts.durationMinutes,
      meetLink: opts.meetUrl,
      studentEmail: (student?.email as string | null) ?? null,
    });

    if (!hold.ok) {
      // 'not_connected' is the EXPECTED answer until a mentor connects Google.
      // Logged at info so it does not drown the real failures.
      console.log(`[${opts.source}] calendar hold skipped`, opts.sessionId, hold.reason);
      return;
    }

    const { error } = await admin
      .from('video_sessions')
      .update({ google_event_id: hold.eventId })
      .eq('id', opts.sessionId);
    if (error) {
      // The hold exists in Google but we cannot address it later. Say so
      // loudly: a cancel will now leave a stale hold on the mentor's calendar.
      console.error(
        `[${opts.source}] hold created but id not stored`,
        opts.sessionId, hold.eventId, error.message,
      );
    }
  } catch (err) {
    console.error(`[${opts.source}] calendar hold failed`, opts.sessionId, err);
  }
}
