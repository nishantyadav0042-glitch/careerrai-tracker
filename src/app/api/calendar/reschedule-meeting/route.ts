import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateGoogleMeet, statusFor } from '@/lib/google-meet';
import { audit } from '@/lib/integration-audit';
import { dispatch } from '@/lib/notification-os';
import { sessionNotificationUrl } from '@/lib/session-link';
import { constraintFailure } from '@/lib/booking-constraints';
import { idempotencyKey, replayIdempotent, rememberIdempotent } from '@/lib/idempotency';
import { offeredSlotProblem, type Availability, type BusySpan } from '@/lib/session-slots';

const ALLOWED_DURATIONS = [20, 30, 45, 60];

interface RescheduleRequest {
  meetingId: string;
  startTime: string; // ISO 8601
  durationMinutes?: number;
}

/**
 * POST /api/calendar/reschedule-meeting
 *
 * Moves an existing session in place: same row, same Google event, same Meet
 * link — only the time changes.
 *
 * This exists because the old "reschedule" was cancel + book again, which
 * minted a NEW room every time. That is Incident #21 in one sentence: a pair
 * ended up with four live sessions and four different rooms, and the student's
 * phone and the mentor's phone could resolve to different ones. Moving an
 * event is not the same operation as replacing it, and the app now says so.
 *
 * Only the buddy who owns the session may move it.
 */
// ── TELLING THE STUDENT IS NOT PART OF THE RESCHEDULE ───────────────────────
//
// 27 Aug, same defect as its sibling in schedule-meeting: a bare `await
// dispatch` inside the route's only try block turned a transport failure into
// 500 "Couldn't move the meeting" for a move already committed by the update
// above. The student's calendar was wrong, the mentor believed the move had
// failed, and `rememberIdempotent` never recorded the replay.
//
// The profile read is inside the try too — `.single()` throws on no row, and a
// student whose profile read fails is still a student whose session moved.
//
// NEVER fatal, never silent. Guarded by session-booking-notified.guard.test.ts.
async function tellTheStudentItMoved(
  admin: ReturnType<typeof createAdminClient>,
  opts: { sessionId: string; studentId: string; istTime: string; meetLink: string | null },
) {
  try {
    const { data: movedStudent } = await admin
      .from('profiles').select('notif_prefs').eq('id', opts.studentId).single();
    await dispatch({
      userId: opts.studentId,
      type: 'session_rescheduled',
      title: '📅 Your session moved',
      body: `New time: ${opts.istTime} IST. Same joining link — nothing else to do.`,
      url: sessionNotificationUrl('student'),
      data: { sessionId: opts.sessionId, meetLink: opts.meetLink },
      reason: 'Buddy moved a scheduled session — old time in the student\'s head is now wrong',
      expectedAction: 'view_session',
      prefs: (movedStudent?.notif_prefs as Record<string, unknown>) ?? {},
    });
  } catch (err) {
    console.error('[calendar/reschedule-meeting] reschedule notification failed', opts.sessionId, err);
  }
}

// ── A RESCHEDULE IS A BOOKING, AND MUST PASS THE SAME DOOR ──────────────────
//
// 27 Aug. This route moved a session with no availability check of any kind.
// It validated that the new time parsed, was in the future, and had a legal
// duration — and then wrote it. A mentor could move a student's session onto a
// day they do not work, outside their hours, or into their own time off, and
// nothing anywhere refused it.
//
// It looked covered, and that is why it survived. Two DATABASE guards sit on
// video_sessions, and only one of them reaches an UPDATE:
//
//   set_video_session_span                  before insert OR UPDATE OF
//                                           scheduled_at, duration_minutes,
//                                           buddy_id   → the GIST exclusion
//                                           still refuses a double-booking
//                                           on a reschedule. Covered.
//
//   video_session_within_availability_guard before INSERT          ← only
//                                           → work days, hours and time off
//                                           are NOT re-checked when a session
//                                           MOVES. The hole.
//
// So the defect was never "no rules exist", it was "the rules are attached to
// the wrong verb". The overlap half was safe the whole time, which is exactly
// what made the availability half look safe too.
//
// The rule itself lives in lib/session-slots' offeredSlotProblem() rather than
// being restated here — Incident #23, a rule written in N places drifts N−1
// times. This function is only the DB reads around it. The new time must be a
// slot we would have OFFERED a student: same working days, same hours, same
// buffer, same notice and horizon, same max_per_day.
//
// A mentor with no availability row is unaffected, which is the policy the
// database guard already states in its own comment. Fail-open is deliberate
// here: a mentor who never configured a week has no window to be outside of,
// and refusing every reschedule for them would strand real sessions.
async function refuseOutsideAvailability(
  admin: ReturnType<typeof createAdminClient>,
  opts: { buddyId: string; sessionId: string; start: Date; durationMinutes: number },
): Promise<{ error: string; reason: string } | null> {
  const [{ data: avail }, { data: busy }] = await Promise.all([
    admin.from('buddy_availability').select('*').eq('buddy_id', opts.buddyId).maybeSingle(),
    admin.from('video_sessions')
      .select('id, scheduled_at, duration_minutes')
      .eq('buddy_id', opts.buddyId)
      .in('session_status', ['scheduled', 'active'])
      .gte('scheduled_at', new Date(Date.now() - 86_400_000).toISOString()),
  ]);

  if (!avail) return null;

  const a: Availability = {
    timezone: avail.timezone as string,
    workDays: (avail.work_days as number[]) ?? [],
    startMinute: avail.start_minute as number,
    endMinute: avail.end_minute as number,
    slotMinutes: avail.slot_minutes as number,
    bufferMinutes: avail.buffer_minutes as number,
    maxPerDay: (avail.max_per_day as number | null) ?? null,
    horizonDays: avail.horizon_days as number,
    minNoticeMinutes: avail.min_notice_minutes as number,
    active: avail.active as boolean,
  };

  // THE SESSION BEING MOVED IS NOT AN OBSTACLE TO ITSELF. Leaving it in the
  // busy list would block every slot within its own buffer — so a mentor
  // nudging a 3pm session to 3.30pm would be refused by the session they are
  // holding — and would spend one of its own day's max_per_day places.
  const spans: BusySpan[] = (busy ?? [])
    .filter((b) => b.id !== opts.sessionId)
    .map((b) => {
      const startMs = Date.parse(b.scheduled_at as string);
      return {
        startMs,
        endMs: startMs + (((b.duration_minutes as number) ?? 30) + a.bufferMinutes) * 60_000,
      };
    });

  const problem = offeredSlotProblem(
    a, spans, opts.start.getTime(), opts.durationMinutes, Date.now(),
  );
  if (!problem) return null;

  // The mentor is the one reading this, so it names what THEY control. The
  // student never sees it: a reschedule they did not ask for cannot fail in
  // their face.
  return {
    reason: 'outside_availability',
    error: problem === 'overruns_day'
      ? `A ${opts.durationMinutes}-minute session starting then would run past the end of your day.`
      : 'That time is outside your availability — pick a slot you actually offer.',
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    }

    let body: RescheduleRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const { meetingId, startTime } = body;
    if (!meetingId || !startTime) {
      return NextResponse.json({ error: 'meetingId and startTime are required.' }, { status: 400 });
    }

    const start = new Date(startTime);
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: 'Invalid start time.' }, { status: 400 });
    }
    if (start.getTime() < Date.now() + 60_000) {
      return NextResponse.json({ error: 'Pick a time in the future.' }, { status: 400 });
    }

    const idemKey = idempotencyKey(request);
    const replay = await replayIdempotent(user.id, 'reschedule-meeting', idemKey);
    if (replay) return replay;

    const admin = createAdminClient();
    const { data: session } = await admin
      .from('video_sessions')
      .select('id, buddy_id, student_id, title, session_status, duration_minutes, scheduled_at, google_event_id, google_meet_link')
      .eq('id', meetingId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    if (session.buddy_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the buddy who scheduled this session can move it.' },
        { status: 403 },
      );
    }
    if (session.session_status !== 'scheduled') {
      return NextResponse.json(
        { error: `This session is ${session.session_status} — book a new one instead.` },
        { status: 409 },
      );
    }

    const duration = body.durationMinutes ?? session.duration_minutes ?? 30;
    if (!ALLOWED_DURATIONS.includes(duration)) {
      return NextResponse.json({ error: 'Duration must be 20, 30, 45 or 60 minutes.' }, { status: 400 });
    }

    // BEFORE the calendar is touched and before the row moves: refusing after
    // updateGoogleMeet() would leave the mentor's calendar on a time the
    // database rejected.
    const outside = await refuseOutsideAvailability(admin, {
      buddyId: user.id,
      sessionId: session.id as string,
      start,
      durationMinutes: duration,
    });
    if (outside) {
      await audit({
        subjectId: user.id, action: 'booking.rejected', ok: false,
        detail: {
          reason: outside.reason, sessionId: session.id,
          studentId: session.student_id, startTime: start.toISOString(),
        },
      });
      return NextResponse.json({ error: outside.error, reason: outside.reason }, { status: 409 });
    }

    const meetLink = session.google_meet_link as string | null;
    const legacyEventId = session.google_event_id as string | null;

    // Sessions booked under the permanent-room design have NO calendar event of
    // their own — the link belongs to the buddy, not to this booking, so moving
    // the session is a pure database operation and the link cannot change.
    //
    // Rows from before that change still carry their own event. Move it too, so
    // the mentor's calendar does not disagree with the app.
    if (legacyEventId) {
      const moved = await updateGoogleMeet({
        buddyUserId: user.id,
        eventId: legacyEventId,
        start,
        durationMinutes: duration,
        title: session.title ?? undefined,
      });
      // 'gone' means someone deleted it inside Google. That is not a reason to
      // refuse a reschedule: the join link still works and the app row is the
      // source of truth.
      if (!moved.ok && moved.reason !== 'gone') {
        return NextResponse.json({ error: moved.error, reason: moved.reason }, { status: statusFor(moved.reason) });
      }
    }

    const { data: movedRows, error: updateError } = await admin
      .from('video_sessions')
      .update({
        scheduled_at: start.toISOString(),
        duration_minutes: duration,
        updated_at: new Date().toISOString(),
      })
      .eq('id', meetingId)
      // STATUS-GUARDED (audit, 27 Aug). This write had no status filter, and
      // neither lifecycle trigger fires on it: video_session_lifecycle only
      // checks when session_status changes, and the terminal-reassert guard is
      // `before update OF session_status`, which this SET list does not touch.
      // So the check at the top was a read-then-write with an open window — a
      // session cancelled in between was still moved, and the student was told
      // "your session moved, same joining link" about a session that was
      // already called off. Two concurrent reschedules also both succeeded,
      // last-write-wins, with two different times announced.
      .in('session_status', ['scheduled'])
      .select('id');

    if (updateError) {
      // Same two rules, same shared wording. Moving a session into a slot the
      // buddy's room is already booked for would put two students in one call.
      const refused = constraintFailure(updateError, 'buddy');
      if (refused) {
        await audit({
          subjectId: user.id, action: 'booking.rejected', ok: false,
          detail: { reason: refused.reason, sessionId: session.id, to: start.toISOString(), viaConstraint: true },
        });
        return NextResponse.json({ error: refused.message, reason: refused.reason }, { status: refused.status });
      }
      console.error('reschedule update failed:', updateError);
      return NextResponse.json({ error: "Couldn't save the new time — try again." }, { status: 500 });
    }

    const istTime = start.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    // Only the caller that actually moved the session may announce it.
    if ((movedRows?.length ?? 0) === 0) {
      return NextResponse.json(
        { error: 'This session changed while you were rescheduling it — reload and try again.' },
        { status: 409 },
      );
    }

    // Through dispatch() — SESSION_RESCHEDULED, P0 must-reach. The copy still
    // says the link is unchanged: a student who saved the old one assumes it
    // is dead and asks, which is the support ticket this line prevents.
    await tellTheStudentItMoved(admin, {
      sessionId: session.id,
      studentId: session.student_id,
      istTime,
      meetLink,
    });

    await audit({
      subjectId: user.id, action: 'booking.rescheduled',
      detail: { sessionId: session.id, studentId: session.student_id, from: session.scheduled_at ?? null, to: start.toISOString() },
    });

    const payload = { success: true, meetingId: session.id, meetLink, startTime: start.toISOString() };
    await rememberIdempotent(user.id, 'reschedule-meeting', idemKey, 200, payload);

    return NextResponse.json(payload);
  } catch (error) {
    console.error('reschedule-meeting error:', error);
    return NextResponse.json({ error: "Couldn't move the meeting — try again." }, { status: 500 });
  }
}
