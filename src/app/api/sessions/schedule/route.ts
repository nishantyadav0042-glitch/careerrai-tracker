import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface ScheduleSessionRequest {
  studentId: string;
  title: string;
  startTime: string; // ISO 8601 UTC
  endTime: string;   // ISO 8601 UTC
  description?: string;
}

export async function POST(request: NextRequest) {
  try {
    // 1. AUTHENTICATE THE BUDDY
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 2. PARSE & VALIDATE INPUT
    const body = await request.json() as ScheduleSessionRequest;

    if (!body.studentId || !body.title || !body.startTime || !body.endTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 3. VERIFY BUDDY OWNS THIS STUDENT
    const admin = createAdminClient();
    const { data: student, error: studentError } = await admin
      .from('profiles')
      .select('full_name, email, buddy_id')
      .eq('id', body.studentId)
      .single();

    if (studentError || !student) {
      return NextResponse.json(
        { error: 'Student not found' },
        { status: 404 }
      );
    }

    if (student.buddy_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized - student not assigned to this buddy' },
        { status: 403 }
      );
    }

    // 4. CREATE SESSION IN DATABASE
    const { data: session, error: sessionError } = await admin
      .from('video_sessions')
      .insert({
        buddy_id: user.id,
        student_id: body.studentId,
        title: body.title || 'Session',
        description: body.description || null,
        scheduled_at: body.startTime,
        duration_minutes: Math.round(
          (new Date(body.endTime).getTime() - new Date(body.startTime).getTime()) / 60000
        ),
        session_status: 'scheduled',
        session_type: 'session',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id, created_at')
      .single();

    if (sessionError || !session) {
      console.error('Session creation error:', sessionError);
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      );
    }

    // 5. TRY TO CREATE GOOGLE CALENDAR EVENT (OPTIONAL)
    let googleMeetLink: string | null = null;
    let googleEventId: string | null = null;
    let calendarError: string | null = null;

    try {
      const eventResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/google/create-event`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({
            title: body.title,
            description: `Session with ${student.full_name}${body.description ? ': ' + body.description : ''}`,
            studentName: student.full_name,
            studentEmail: student.email,
            startTime: body.startTime,
            endTime: body.endTime,
            sessionId: session.id,
          }),
        }
      );

      if (eventResponse.ok) {
        const eventData = await eventResponse.json();
        googleEventId = eventData.eventId;
        googleMeetLink = eventData.meetLink;

        // Update session with Meet link
        if (googleMeetLink && googleEventId) {
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
        calendarError = errorData.error;
        console.warn('Calendar event creation failed:', calendarError);
      }
    } catch (error) {
      calendarError = error instanceof Error ? error.message : 'Unknown error';
      console.warn('Calendar event creation error:', calendarError);
    }

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        title: body.title,
        startTime: body.startTime,
        endTime: body.endTime,
        googleMeetLink: googleMeetLink || undefined,
      },
      calendar: {
        connected: !!googleEventId,
        meetLink: googleMeetLink || undefined,
        error: calendarError || undefined,
      },
    });

  } catch (error) {
    console.error('Schedule session error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
