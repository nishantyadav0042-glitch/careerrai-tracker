import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateGoogleMeet } from '@/lib/google-meet';
import { audit } from '@/lib/integration-audit';
import { dispatch } from '@/lib/notification-os';
import { sessionNotificationUrl } from '@/lib/session-link';
import { constraintFailure } from '@/lib/booking-constraints';
import { idempotencyKey, replayIdempotent, rememberIdempotent } from '@/lib/idempotency';

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

    const meetLink = session.google_meet_link as string | null;
    const legacyEventId = session.google_event_id as string | null;

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
    // ── THE CALENDAR FOLLOWS THE DATABASE, NEVER LEADS IT ────────────────────
    //
    // This block used to run BEFORE the update. That was safe only while
    // nothing could refuse the move: the row always accepted whatever the
    // calendar had already been told. Once availability is enforced on UPDATE
    // (20260827c, Incident #40), a refusal became reachable — and with the old
    // order the mentor's Google calendar would already be sitting on a time the
    // database had just rejected. One meeting, two truths, which is Incident
    // #17 arriving from the opposite direction.
    //
    // So the authority decides first and the calendar is reconciled after.
    //
    // Which means a calendar failure can no longer refuse the reschedule — the
    // session HAS moved, the student is about to be told so, and answering
    // "couldn't move the meeting" would be a lie about a committed write (the
    // same rule as the notifier below). Sessions booked under the permanent-room
    // design have no event of their own and never enter this branch at all; for
    // the legacy rows that do, the app row is already documented as the source
    // of truth, so a stale Google event is a reconciliation problem and not a
    // reason to fail the mentor's request.
    if (legacyEventId) {
      const moved = await updateGoogleMeet({
        buddyUserId: user.id,
        eventId: legacyEventId,
        start,
        durationMinutes: duration,
        title: session.title ?? undefined,
      });
      // 'gone' means someone deleted it inside Google, which was already
      // tolerated here. Everything else is now logged rather than returned.
      if (!moved.ok && moved.reason !== 'gone') {
        console.error(
          '[calendar/reschedule-meeting] session moved but its legacy calendar event did not',
          session.id, moved.reason, moved.error,
        );
        await audit({
          subjectId: user.id, action: 'google.api_error', ok: false,
          detail: {
            at: 'reschedule.legacy_event', sessionId: session.id,
            reason: moved.reason, to: start.toISOString(),
            note: 'session moved in the database; its legacy calendar event did not follow',
          },
        });
      }
    }

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
