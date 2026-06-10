import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isGoogleCalendarConnected } from '@/lib/google-oauth-utils';

interface ScheduleSessionRequest {
  studentId: string;
  title: string;
  description?: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
}

/**
 * POST /api/sessions/schedule
 * Creates a video session and optionally creates a Google Calendar event
 */
export async function POST(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json() as ScheduleSessionRequest;

    if (!body.studentId || !body.title || !body.startTime || !body.endTime) {
      return NextResponse.json(
        { error: 'Missing required fields: studentId, title, startTime, endTime' },
        { status: 400 }
      );
    }

    // Verify that the current user is a buddy (the one scheduling)
    const { data: buddyProfile } = await admin
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single();

    if (buddyProfile?.role !== 'buddy') {
      return NextResponse.json(
        { error: 'Only buddies can schedule sessions' },
        { status: 403 }
      );
    }

    // Get student name
    const { data: studentProfile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', body.studentId)
      .single();

    // Create session in database (initially without Meet link)
    const { data: session, error: sessionError } = await admin
      .from('video_sessions')
      .insert({
        buddy_id: user.id,
        student_id: body.studentId,
        title: body.title,
        description: body.description,
        scheduled_at: new Date(body.startTime).toISOString(),
        duration_minutes: Math.round(
          (new Date(body.endTime).getTime() - new Date(body.startTime).getTime()) / 60000
        ),
        session_status: 'scheduled',
        session_type: 'session',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      );
    }

    let googleEventId: string | null = null;
    let googleMeetLink: string | null = null;
    let calendarError: string | null = null;

    // Check if buddy has Google Calendar connected
    try {
      const hasCalendar = await isGoogleCalendarConnected(user.id);

      if (hasCalendar) {
        // Create Google Calendar event
        const eventResponse = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL}/api/google/create-event`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Forward the user's session cookies so create-event can authenticate
              cookie: request.headers.get('cookie') ?? '',
            },
            body: JSON.stringify({
              title: body.title,
              description: `Session with ${studentProfile?.full_name || 'student'}${body.description ? ': ' + body.description : ''}`,
              studentName: studentProfile?.full_name || 'Student',
              startTime: body.startTime,
              endTime: body.endTime,
            }),
          }
        );

        if (eventResponse.ok) {
          const eventData = await eventResponse.json();
          googleEventId = eventData.eventId;
          googleMeetLink = eventData.meetLink;

          // Update session with Google Meet link
          if (googleEventId && googleMeetLink) {
            await admin
              .from('video_sessions')
              .update({
                google_event_id: googleEventId,
                google_meet_link: googleMeetLink,
              })
              .eq('id', session.id);
          }
        } else {
          const errorData = await eventResponse.json();
          calendarError = errorData.error || 'Failed to create calendar event';
        }
      }
    } catch (error) {
      console.error('Error creating Google Calendar event:', error);
      calendarError = error instanceof Error ? error.message : 'Unknown error';
    }

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        title: session.title,
        startTime: session.scheduled_at,
        duration: session.duration_minutes,
        googleMeetLink,
      },
      calendarStatus: {
        connected: googleEventId ? true : false,
        eventId: googleEventId,
        meetLink: googleMeetLink,
        error: calendarError,
      },
    });
  } catch (error) {
    console.error('Error scheduling session:', error);
    return NextResponse.json(
      { error: 'Failed to schedule session' },
      { status: 500 }
    );
  }
}
