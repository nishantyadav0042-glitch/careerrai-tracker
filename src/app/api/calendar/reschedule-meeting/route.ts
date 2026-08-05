import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateGoogleMeet, statusFor } from '@/lib/google-meet';
import { audit } from '@/lib/integration-audit';

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

    const { error: updateError } = await admin
      .from('video_sessions')
      .update({
        scheduled_at: start.toISOString(),
        duration_minutes: duration,
        updated_at: new Date().toISOString(),
      })
      .eq('id', meetingId);

    if (updateError) {
      if (updateError.code === '23P01') {
        // no_overlapping_buddy_sessions. Every session runs in the buddy's one
        // room, so an overlap would put two students in it together.
        return NextResponse.json({
          error: 'You have another session at that time. Pick a slot at least 15 minutes clear of your other calls.',
          reason: 'buddy_double_booked',
        }, { status: 409 });
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
    await admin
      .from('notifications')
      .insert({
        user_id: session.student_id,
        type: 'session_rescheduled',
        title: '📅 Your session moved',
        // Say the link is unchanged — otherwise a student who saved the old one
        // assumes it is dead and asks, which is the support ticket we are here
        // to prevent.
        body: `New time: ${istTime} IST. Same joining link — nothing else to do.`,
        data: { sessionId: session.id, meetLink },
      })
      .then(({ error: e }) => {
        if (e) console.error('Notification insert failed:', e.message);
      });

    await audit({
      subjectId: user.id, action: 'booking.rescheduled',
      detail: { sessionId: session.id, studentId: session.student_id, from: session.scheduled_at ?? null, to: start.toISOString() },
    });

    return NextResponse.json({ success: true, meetingId: session.id, meetLink, startTime: start.toISOString() });
  } catch (error) {
    console.error('reschedule-meeting error:', error);
    return NextResponse.json({ error: "Couldn't move the meeting — try again." }, { status: 500 });
  }
}
