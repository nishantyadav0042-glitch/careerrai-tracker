import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createDailyRoom } from '@/lib/daily';

const ALLOWED_DURATIONS = [20, 30, 45, 60];
const ALLOWED_SESSION_TYPES = ['guidance', 'onboarding', 'review', 'doubt_solving', 'mock_review'] as const;
type SessionType = typeof ALLOWED_SESSION_TYPES[number];

interface ScheduleMeetingRequest {
  /** Optional: the buddy's own link (Meet/Zoom). Used verbatim; skips Daily. */
  meetingLink?: string;
  studentId: string;
  startTime: string; // ISO 8601
  durationMinutes: number;
  title?: string;
  sessionType?: SessionType;
}

// Video provider history (21 July postmortem):
// - Google Meet: removed — forced per-buddy Google OAuth + Google's
//   app-verification wall.
// - meet.jit.si fallback: removed — Jitsi's public server now requires the
//   first participant to LOG IN as "moderator", so anonymous links dead-end.
// - Daily.co is the ONE provider (card on file, free tier 10k participant-
//   minutes/mo): public rooms, join with a display name only, no accounts for
//   buddies or students, auto-expiring.
// Rule learned the hard way: NEVER hand out a link we can't verify — if Daily
// fails, refuse loudly so the buddy retries, instead of scheduling a session
// around a dead link that only fails at meeting time.

/**
 * POST /api/calendar/schedule-meeting
 * Buddy schedules a 1:1. Creates a video room link, saves the session, and
 * notifies the student in-app (where the join link lives). No Google needed.
 */
export async function POST(request: NextRequest) {
  try {
    // ── Auth: caller must be a buddy ─────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: buddy } = await admin
      .from('profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .single();
    if (!buddy || buddy.role !== 'buddy') {
      return NextResponse.json({ error: 'Only buddies can schedule sessions.' }, { status: 403 });
    }

    // ── Validate input ───────────────────────────────────────────
    let body: ScheduleMeetingRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const { studentId, startTime, durationMinutes, sessionType = 'guidance' } = body;
    if (!studentId || !startTime || !durationMinutes) {
      return NextResponse.json(
        { error: 'studentId, startTime and durationMinutes are required.' },
        { status: 400 }
      );
    }
    if (!ALLOWED_DURATIONS.includes(durationMinutes)) {
      return NextResponse.json({ error: 'Duration must be 20, 30, 45 or 60 minutes.' }, { status: 400 });
    }
    if (!ALLOWED_SESSION_TYPES.includes(sessionType)) {
      return NextResponse.json({ error: 'Invalid session type.' }, { status: 400 });
    }

    const start = new Date(startTime);
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: 'Invalid start time.' }, { status: 400 });
    }
    if (start.getTime() < Date.now() + 60_000) {
      return NextResponse.json({ error: 'Pick a time in the future.' }, { status: 400 });
    }

    // ── Student must belong to this buddy ────────────────────────
    const { data: student } = await admin
      .from('profiles')
      .select('full_name, buddy_id, free_onboarding_used')
      .eq('id', studentId)
      .single();
    if (!student) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }
    if (student.buddy_id !== user.id) {
      return NextResponse.json({ error: 'This student is not assigned to you.' }, { status: 403 });
    }

    const isOrientation = sessionType === 'onboarding';
    if (isOrientation && student.free_onboarding_used) {
      return NextResponse.json(
        { error: 'This student has already completed their free orientation.' },
        { status: 409 }
      );
    }

    const title = body.title?.trim() || (
      isOrientation
        ? `Free Orientation — CareerRai with ${buddy.full_name.split(' ')[0]}`
        : `CareerRai: ${buddy.full_name.split(' ')[0]} × ${student.full_name.split(' ')[0]}`
    );

    // Daily.co room — the one provider (see postmortem above). If it fails,
    // refuse the booking with a clear message rather than saving a dead link.
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    const roomExp = new Date(end.getTime() + 6 * 60 * 60 * 1000); // expire 6h after the session
    // A buddy may bring their OWN link (Google Meet, Zoom, anything). Founder,
    // 5 Aug — after a first session that fell apart, a mentor should never be
    // trapped inside our provider. A pasted link is used verbatim and NO Daily
    // room is created for it.
    const manualLink = typeof body.meetingLink === 'string' ? body.meetingLink.trim() : '';
    if (manualLink && !/^https:\/\/\S+$/i.test(manualLink)) {
      return NextResponse.json({ error: 'That meeting link does not look like a valid https link.' }, { status: 400 });
    }
    const meetLink = manualLink || await createDailyRoom({ expiresAt: roomExp });
    if (!meetLink) {
      return NextResponse.json(
        { error: 'The video system is unavailable right now — please try again in a minute. (Admin: check /api/admin/video-health.)' },
        { status: 503 }
      );
    }

    // ── Supersede, don't duplicate ───────────────────────────────
    // Incident #21 (5 Aug): "reschedule" only ever INSERTED, leaving every
    // earlier session live. One pair accumulated FOUR live sessions with FOUR
    // different rooms in a single evening. Because every surface picks the
    // first row by scheduled_at — and two of them shared the SAME minute, so
    // the tie-break was undefined — the student's phone and the mentor's phone
    // could resolve to DIFFERENT rooms from identical data. The mentor said it
    // out loud: "I am in separate meeting with Harsh." Each re-render could
    // land somewhere else, which is what she experienced as "getting dropped
    // off multiple times". The provider was never the problem.
    //
    // A pair has at most ONE live session. Booking a new one cancels the rest,
    // BEFORE the insert, so there is no window where two are live at once.
    const { error: supersedeError } = await admin
      .from('video_sessions')
      .update({ session_status: 'cancelled' })
      .eq('buddy_id', user.id)
      .eq('student_id', studentId)
      .eq('session_status', 'scheduled');
    if (supersedeError) {
      console.error('superseding prior sessions failed:', supersedeError.message);
      return NextResponse.json({ error: "Couldn't replace the earlier session — try again." }, { status: 500 });
    }

    // ── Persist session ──────────────────────────────────────────
    const { data: session, error: sessionError } = await admin
      .from('video_sessions')
      .insert({
        buddy_id: user.id,
        student_id: studentId,
        title,
        scheduled_at: start.toISOString(),
        duration_minutes: durationMinutes,
        session_status: 'scheduled',
        session_type: isOrientation ? 'onboarding' : 'guidance',
        google_meet_link: meetLink, // reused as the generic "join link" column
      })
      .select('id')
      .single();

    if (sessionError || !session) {
      console.error('video_sessions insert failed:', sessionError);
      return NextResponse.json({ error: "Couldn't save the session — try again." }, { status: 500 });
    }

    // ── Notify student in-app (this is where they get the join link) ──
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
        user_id: studentId,
        type: 'session_scheduled',
        title: isOrientation
          ? `🎯 Free Orientation with ${buddy.full_name.split(' ')[0]}`
          : `📅 Session with ${buddy.full_name.split(' ')[0]}`,
        body: isOrientation
          ? `${istTime} IST — your free orientation is booked. Join from your dashboard.`
          : `${istTime} IST — your buddy booked a 1:1. Join from your dashboard.`,
        data: { sessionId: session.id, meetLink, sessionType: isOrientation ? 'onboarding' : 'guidance' },
      })
      .then(({ error: e }) => {
        if (e) console.error('Notification insert failed:', e.message);
      });

    return NextResponse.json({
      success: true,
      meetingId: session.id,
      meetLink,
    });
  } catch (error) {
    console.error('schedule-meeting error:', error);
    return NextResponse.json({ error: "Couldn't create the session — try again." }, { status: 500 });
  }
}
