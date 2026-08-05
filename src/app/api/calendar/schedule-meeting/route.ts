import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureBuddyRoom } from '@/lib/buddy-room';

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

// Video provider history:
// - Jitsi: removed — its public server now makes the first participant log in
//   as "moderator", so anonymous links dead-end.
// - Daily.co: removed (5 Aug) — it was never at fault for Incident #21, but
//   the founder chose Meet for familiarity.
// - Google Meet, one PERMANENT room per buddy: the current design. The room is
//   minted once at Google connect, not per booking.
//
// Rule learned the hard way: NEVER hand out a link we can't verify. Refuse the
// booking loudly rather than save a session around a link that only fails at
// meeting time.

/**
 * POST /api/calendar/schedule-meeting
 * Buddy schedules a 1:1 on their permanent Meet room, saves the session, and
 * notifies the student in-app. Refuses if the pair already has a live session,
 * or if it would double-book the buddy.
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
      .select('full_name, buddy_id, free_onboarding_used, email')
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

    // ── One live session per pair ────────────────────────────────
    // Founder rule, 5 Aug: a pair may have exactly ONE live session. Booking
    // another REFUSES — it does not silently supersede — so the mentor and the
    // student always agree on which call is the call.
    //
    // This check exists for the message. The guarantee comes from the
    // `one_live_session_per_pair` unique index, handled below: two taps in the
    // same second cannot both pass a SELECT, but they cannot both pass the
    // index either.
    const { data: existing } = await admin
      .from('video_sessions')
      .select('id, scheduled_at')
      .eq('buddy_id', user.id)
      .eq('student_id', studentId)
      .in('session_status', ['scheduled', 'active'])
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        error: 'You already have an active meeting with this student. Cancel or complete it before booking another session.',
        reason: 'session_exists',
        existingSessionId: existing.id,
        existingStartTime: existing.scheduled_at,
      }, { status: 409 });
    }

    // ── The link: the buddy's ONE permanent room ─────────────────
    // Founder decision, 5 Aug: no new Meet per booking. The room is minted
    // once when a mentor connects Google and reused forever, so their link
    // never changes and a student's saved link never rots. See buddy-room.ts
    // for why the shared room is safe (it rests on the overlap constraint).
    let meetLink: string;

    const manualLink = typeof body.meetingLink === 'string' ? body.meetingLink.trim() : '';
    if (manualLink) {
      // A mentor may still paste their own room (a personal Meet, Zoom).
      if (!/^https:\/\/\S+$/i.test(manualLink)) {
        return NextResponse.json({ error: 'That meeting link does not look like a valid https link.' }, { status: 400 });
      }
      meetLink = manualLink;
    } else {
      const room = await ensureBuddyRoom(user.id);
      if (!room.ok) {
        const status = room.reason === 'not_connected' ? 428 : 502;
        return NextResponse.json({ error: room.error, reason: room.reason }, { status });
      }
      meetLink = room.meetUrl;
    }

    // ── Persist session ──────────────────────────────────────────
    // No per-booking calendar event is created. The two database constraints
    // below are the real rules; everything above only produces better error
    // messages than Postgres would.
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
      // 23505 — one_live_session_per_pair. 23P01 — no_overlapping_buddy_sessions.
      // These are the authoritative answers, and they fire on races the SELECT
      // above cannot see.
      if (sessionError?.code === '23505') {
        return NextResponse.json({
          error: 'You already have an active meeting with this student. Cancel or complete it before booking another session.',
          reason: 'session_exists',
        }, { status: 409 });
      }
      if (sessionError?.code === '23P01') {
        return NextResponse.json({
          error: 'You already have another session at that time. Because every session of yours runs in the same room, two students can never be booked into the same slot — pick a time at least 15 minutes clear of your other calls.',
          reason: 'buddy_double_booked',
        }, { status: 409 });
      }
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
