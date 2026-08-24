import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteGoogleMeet } from '@/lib/google-meet';
import { audit } from '@/lib/integration-audit';

/**
 * POST /api/calendar/cancel-meeting
 * Buddy cancels a scheduled session: removes the event from Google Calendar
 * (which also emails the invited student), marks the row cancelled, and
 * notifies the student in-app.
 *
 * Order matters. Google goes FIRST: if the calendar delete fails we still
 * cancel the row, because a session the student can no longer be told about
 * is worse than a stale entry on the mentor's calendar. But we never do the
 * reverse — silently leaving a live Meet on the calendar of a session the app
 * believes is cancelled is how a mentor ends up sitting in an empty room.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    }

    let meetingId: string | undefined;
    try {
      ({ meetingId } = await request.json());
    } catch {
      // fall through to validation
    }
    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId is required.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: session } = await admin
      .from('video_sessions')
      .select('id, buddy_id, student_id, title, session_status, google_event_id')
      .eq('id', meetingId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    if (session.buddy_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the buddy who scheduled this session can cancel it.' },
        { status: 403 }
      );
    }
    if (session.session_status === 'cancelled') {
      return NextResponse.json({ success: true, alreadyCancelled: true });
    }

    // Sessions booked on the permanent-room design have no calendar event of
    // their own, so there is usually nothing to delete. Older rows do.
    //
    // The guard is not optional: the buddy's PERMANENT room is also a calendar
    // event, and deleting it would destroy the link every one of their students
    // uses. A cancel must never be able to reach it.
    const { data: buddyProfile } = await admin
      .from('profiles')
      .select('buddy_meet_event_id')
      .eq('id', session.buddy_id)
      .single();

    const perSessionEventId =
      session.google_event_id && session.google_event_id !== buddyProfile?.buddy_meet_event_id
        ? session.google_event_id
        : null;

    let calendarRemoved = false;
    let calendarError: string | null = null;
    if (perSessionEventId) {
      // sendUpdates=all means an invited student gets Google's own cancellation
      // email; an already-deleted event counts as success, so a hand-deleted
      // event can never wedge a cancel.
      const removed = await deleteGoogleMeet(user.id, perSessionEventId);
      if (removed.ok) {
        calendarRemoved = true;
      } else {
        calendarError = removed.error;
        console.error('Google event delete failed:', removed.reason, removed.error);
      }
    }

    // Terminal is terminal (migration 20260824e). Without the status filter the
    // DB trigger refuses the transition and this route tells the mentor to
    // "try again" — advice that can never work, for a session that is already
    // finished. A zero-row update instead means there was nothing to cancel.
    const { data: cancelled, error: updateError } = await admin
      .from('video_sessions')
      .update({ session_status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', meetingId)
      .in('session_status', ['scheduled', 'active'])
      .select('id');

    if (updateError) {
      console.error('Cancel update failed:', updateError);
      return NextResponse.json(
        { error: "Couldn't update the session — try again." },
        { status: 500 }
      );
    }
    // Zero rows means it had already finished or been cancelled. Not an error
    // — the caller's intent (this session should not go ahead) already holds.
    const alreadySettled = (cancelled?.length ?? 0) === 0;

    await admin
      .from('notifications')
      .insert({
        user_id: session.student_id,
        type: 'session_cancelled',
        title: 'Session cancelled',
        body: `${session.title || 'Your upcoming session'} was cancelled by your buddy. They'll reschedule soon.`,
        data: { sessionId: session.id },
      })
      .then(({ error: e }) => {
        if (e) console.error('Notification insert failed:', e.message);
      });

    // The cancel succeeded. calendarError is reported, not thrown — the mentor
    // should know their calendar still shows it, without the cancel appearing
    // to have failed when it didn't.
    await audit({
      subjectId: user.id, action: 'booking.cancelled',
      detail: { sessionId: session.id, studentId: session.student_id, calendarRemoved, calendarError },
    });

    return NextResponse.json({ success: true, calendarRemoved, calendarError, alreadySettled });
  } catch (error) {
    console.error('cancel-meeting error:', error);
    return NextResponse.json(
      { error: "Couldn't cancel the meeting — try again." },
      { status: 500 }
    );
  }
}
