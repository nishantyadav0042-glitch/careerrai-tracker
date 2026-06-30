import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
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

/**
 * A video room link that needs ZERO accounts, ZERO OAuth and ZERO verification —
 * for the buddy or the student. A unique Jitsi room both sides just tap to join
 * in the browser. (Replaced Google Meet, which forced every buddy to connect a
 * Google account and pass Google's app-verification wall.)
 */
function createVideoLink(): string {
  return `https://meet.jit.si/CareerRai-${randomUUID()}`;
}

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

    // Prefer a Daily.co room (best quality, one server key, no per-user auth);
    // fall back to a no-account Jitsi link if Daily isn't configured or errors,
    // so scheduling never breaks.
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    const roomExp = new Date(end.getTime() + 6 * 60 * 60 * 1000); // expire 6h after the session
    const meetLink = (await createDailyRoom({ expiresAt: roomExp })) ?? createVideoLink();

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
