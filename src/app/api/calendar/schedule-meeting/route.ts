import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createDailyRoom } from '@/lib/daily';

const ALLOWED_DURATIONS = [20, 30, 45, 60];
const ALLOWED_SESSION_TYPES = ['guidance', 'onboarding', 'review', 'doubt_solving', 'mock_review'] as const;
type SessionType = typeof ALLOWED_SESSION_TYPES[number];

interface ScheduleMeetingRequest {
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
    const meetLink = await createDailyRoom({ expiresAt: roomExp });
    if (!meetLink) {
      return NextResponse.json(
        { error: 'The video system is unavailable right now — please try again in a minute. (Admin: check /api/admin/video-health.)' },
        { status: 503 }
      );
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

    // Push the mentee too — an in-app row only helps a student who is already
    // in the app. The first real orientation (4 Aug) sat unseen for hours
    // because the invite never buzzed a phone. Fire-and-forget.
    void import('@/lib/push')
      .then(({ sendPushToUser }) =>
        sendPushToUser(studentId, {
          title: isOrientation
            ? `🎯 Orientation with ${buddy.full_name.split(' ')[0]} — ${istTime} IST`
            : `📅 1:1 with ${buddy.full_name.split(' ')[0]} — ${istTime} IST`,
          body: 'Your session is booked. Join from your dashboard.',
          url: '/student/buddy',
        })
      )
      .catch((e) => console.error('[schedule-meeting] push failed', e));

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
