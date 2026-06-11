import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import type { calendar_v3 } from 'googleapis';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getCalendarClient,
  extractMeetLink,
  CalendarNotConnectedError,
} from '@/lib/google-calendar';

const ALLOWED_DURATIONS = [20, 30, 45, 60];

interface ScheduleMeetingRequest {
  studentId: string;
  startTime: string; // ISO 8601
  durationMinutes: number;
  title?: string;
}

/**
 * POST /api/calendar/schedule-meeting
 * Creates a Google Calendar event with a REAL Meet link on the buddy's
 * calendar (in-process — no internal HTTP), mirrors it to the student's
 * calendar when they're connected, persists to video_sessions, and
 * notifies the student in-app.
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
      .select('full_name, role, college, email')
      .eq('id', user.id)
      .single();
    if (!buddy || buddy.role !== 'buddy') {
      return NextResponse.json(
        { error: 'Only buddies can schedule sessions.' },
        { status: 403 }
      );
    }

    // ── Validate input ───────────────────────────────────────────
    let body: ScheduleMeetingRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const { studentId, startTime, durationMinutes } = body;
    if (!studentId || !startTime || !durationMinutes) {
      return NextResponse.json(
        { error: 'studentId, startTime and durationMinutes are required.' },
        { status: 400 }
      );
    }
    if (!ALLOWED_DURATIONS.includes(durationMinutes)) {
      return NextResponse.json(
        { error: 'Duration must be 20, 30, 45 or 60 minutes.' },
        { status: 400 }
      );
    }

    const start = new Date(startTime);
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: 'Invalid start time.' }, { status: 400 });
    }
    if (start.getTime() < Date.now() + 60_000) {
      return NextResponse.json(
        { error: 'Pick a time in the future.' },
        { status: 400 }
      );
    }
    const end = new Date(start.getTime() + durationMinutes * 60_000);

    // ── Student must belong to this buddy ────────────────────────
    const { data: student } = await admin
      .from('profiles')
      .select('full_name, email, buddy_id')
      .eq('id', studentId)
      .single();
    if (!student) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }
    if (student.buddy_id !== user.id) {
      return NextResponse.json(
        { error: 'This student is not assigned to you.' },
        { status: 403 }
      );
    }

    // ── Buddy's calendar client ──────────────────────────────────
    let buddyCalendar: calendar_v3.Calendar;
    let buddyGoogleEmail: string | null;
    try {
      const client = await getCalendarClient(user.id);
      buddyCalendar = client.calendar;
      buddyGoogleEmail = client.googleEmail;
    } catch (err) {
      if (err instanceof CalendarNotConnectedError) {
        return NextResponse.json(
          { error: 'Connect Google Calendar in Settings first.', code: 'NOT_CONNECTED' },
          { status: 403 }
        );
      }
      throw err;
    }

    // ── Build event ──────────────────────────────────────────────
    const title = body.title?.trim()
      || `CareerRai: ${buddy.full_name.split(' ')[0]} × ${student.full_name.split(' ')[0]}`;

    // Student's Google-connected email wins; profiles.email is the fallback.
    // Missing email never blocks the meeting — the in-app widget covers it.
    const { data: studentTokens } = await admin
      .from('google_oauth_tokens')
      .select('google_email')
      .eq('user_id', studentId)
      .maybeSingle();
    const studentEmail = studentTokens?.google_email || student.email || null;

    const attendees: calendar_v3.Schema$EventAttendee[] = [];
    if (buddyGoogleEmail) attendees.push({ email: buddyGoogleEmail });
    if (studentEmail) {
      attendees.push({ email: studentEmail, displayName: student.full_name });
    }

    const description = [
      `1:1 prep session on CareerRai`,
      ``,
      `Mentor: ${buddy.full_name}${buddy.college ? ` (IIM ${buddy.college} Alumni)` : ' (IIM Alumni)'}`,
      `Student: ${student.full_name}`,
      ``,
      `Agenda: progress check-in, doubts, and next steps for CAT prep.`,
      ``,
      `${process.env.NEXT_PUBLIC_APP_URL}`,
    ].join('\n');

    const eventBody = (requestId: string): calendar_v3.Schema$Event => ({
      summary: title,
      description,
      start: { dateTime: start.toISOString(), timeZone: 'Asia/Kolkata' },
      end: { dateTime: end.toISOString(), timeZone: 'Asia/Kolkata' },
      attendees: attendees.length ? attendees : undefined,
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'popup', minutes: 10 },
          { method: 'email', minutes: 60 },
        ],
      },
    });

    // ── Create on buddy's calendar; retry once with fresh requestId ──
    let event: calendar_v3.Schema$Event | null = null;
    let meetLink: string | null = null;
    for (let attempt = 0; attempt < 2 && !meetLink; attempt++) {
      const { data } = await buddyCalendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        sendUpdates: 'all',
        requestBody: eventBody(randomUUID()),
      });
      event = data;
      meetLink = extractMeetLink(data);

      // The conference is occasionally still pending in the insert
      // response — one fetch usually resolves it.
      if (!meetLink && data.id) {
        await new Promise((r) => setTimeout(r, 800));
        const { data: fetched } = await buddyCalendar.events.get({
          calendarId: 'primary',
          eventId: data.id,
        });
        meetLink = extractMeetLink(fetched);
        if (meetLink) event = fetched;
      }

      if (!meetLink && data.id) {
        // clean up the linkless event before retrying
        await buddyCalendar.events
          .delete({ calendarId: 'primary', eventId: data.id, sendUpdates: 'none' })
          .catch(() => {});
        event = null;
      }
    }

    if (!meetLink || !event?.id) {
      return NextResponse.json(
        { error: "Google didn't return a Meet link — try again in a moment." },
        { status: 502 }
      );
    }

    // ── Mirror onto student's calendar (non-fatal) ───────────────
    let studentEventId: string | null = null;
    try {
      const { calendar: studentCalendar } = await getCalendarClient(studentId);
      const { data: mirror } = await studentCalendar.events.insert({
        calendarId: 'primary',
        sendUpdates: 'none',
        requestBody: {
          summary: title,
          description: `${description}\n\nJoin: ${meetLink}`,
          start: { dateTime: start.toISOString(), timeZone: 'Asia/Kolkata' },
          end: { dateTime: end.toISOString(), timeZone: 'Asia/Kolkata' },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 30 },
              { method: 'popup', minutes: 10 },
            ],
          },
        },
      });
      studentEventId = mirror.id ?? null;
    } catch {
      // Student hasn't connected Google — invite email (if any) covers them.
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
        session_type: 'session',
        google_event_id: event.id,
        google_meet_link: meetLink,
        student_google_event_id: studentEventId,
      })
      .select('id')
      .single();

    if (sessionError || !session) {
      console.error('video_sessions insert failed:', sessionError);
      // Roll back the calendar event so we don't strand a meeting
      await buddyCalendar.events
        .delete({ calendarId: 'primary', eventId: event.id, sendUpdates: 'all' })
        .catch(() => {});
      return NextResponse.json(
        { error: "Couldn't save the session — try again." },
        { status: 500 }
      );
    }

    // ── Notify student in-app (non-fatal) ────────────────────────
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
        title: `📅 Session with ${buddy.full_name.split(' ')[0]}`,
        body: `${istTime} IST — your buddy booked a 1:1. Join from your dashboard.`,
        data: { sessionId: session.id, meetLink },
      })
      .then(({ error: e }) => {
        if (e) console.error('Notification insert failed:', e.message);
      });

    return NextResponse.json({
      success: true,
      meetingId: session.id,
      meetLink,
      invitesSent: attendees.length > 0,
    });
  } catch (error) {
    // Surface Google API errors precisely instead of a generic 500
    const apiError = error as {
      message?: string;
      errors?: Array<{ reason?: string; message?: string }>;
      response?: { data?: { error?: { errors?: Array<{ reason?: string }>; message?: string } } };
    };
    const reason =
      apiError.errors?.[0]?.reason ||
      apiError.response?.data?.error?.errors?.[0]?.reason;
    const detail =
      apiError.response?.data?.error?.message || apiError.message || String(error);
    console.error('schedule-meeting error:', reason, detail);

    if (reason === 'accessNotConfigured' || detail.includes('SERVICE_DISABLED') || detail.includes('has not been used in project')) {
      return NextResponse.json(
        {
          error:
            'Google Calendar API is disabled in the app’s Google Cloud project. Founder: enable it at console.cloud.google.com → APIs & Services → Google Calendar API → Enable, then retry.',
          code: 'CALENDAR_API_DISABLED',
        },
        { status: 502 }
      );
    }
    if (reason === 'insufficientPermissions' || detail.includes('insufficient')) {
      return NextResponse.json(
        { error: 'Google Calendar permissions are missing — disconnect and reconnect Google Calendar in Settings.', code: 'INSUFFICIENT_SCOPE' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: "Couldn't reach Google Calendar — try again." },
      { status: 500 }
    );
  }
}
