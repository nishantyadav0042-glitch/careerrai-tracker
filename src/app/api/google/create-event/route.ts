import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface CreateEventRequest {
  title: string;
  description?: string;
  studentName: string;
  studentEmail?: string;
  startTime: string;  // RFC3339/ISO 8601 UTC with Z
  endTime: string;    // RFC3339/ISO 8601 UTC with Z
  sessionId?: string;
}

export async function POST(request: NextRequest) {
  try {
    // 1. AUTHENTICATE
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. PARSE REQUEST
    const body = await request.json() as CreateEventRequest;

    if (!body.title || !body.startTime || !body.endTime) {
      return NextResponse.json(
        { error: 'Missing required fields: title, startTime, endTime' },
        { status: 400 }
      );
    }

    // 3. CHECK IF USER HAS GOOGLE CALENDAR CONNECTED
    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('google_calendar_connected')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.google_calendar_connected) {
      return NextResponse.json(
        { error: 'Google Calendar not connected. Connect it in Settings first.' },
        { status: 403 }
      );
    }

    // 4. GET GOOGLE OAUTH TOKENS
    const { data: tokens, error: tokenError } = await admin
      .from('google_oauth_tokens')
      .select('access_token, refresh_token, token_expires_at')
      .eq('user_id', user.id)
      .single();

    if (tokenError || !tokens) {
      console.error('Tokens not found for user:', user.id);
      return NextResponse.json(
        { error: 'Google Calendar tokens not found. Please reconnect.' },
        { status: 403 }
      );
    }

    // 5. SET UP GOOGLE OAUTH CLIENT
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`
    );

    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });

    const calendar = google.calendar({
      version: 'v3',
      auth: oauth2Client,
    });

    // 6. CREATE CALENDAR EVENT WITH MEET
    const attendees = body.studentEmail
      ? [{ email: body.studentEmail, displayName: body.studentName }]
      : undefined;

    const event: calendar_v3.Schema$Event = {
      summary: `${body.title}`,
      description: body.description || '',
      start: {
        dateTime: body.startTime, // Send UTC ISO string directly
      },
      end: {
        dateTime: body.endTime, // Send UTC ISO string directly
      },
      attendees,
      conferenceData: {
        createRequest: {
          requestId: `careerrai-${user.id}-${Date.now()}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet',
          },
        },
      },
    };

    console.log('Creating event with:', {
      title: event.summary,
      startTime: body.startTime,
      endTime: body.endTime,
      hasAttendees: !!attendees?.length,
    });

    const { data: eventData } = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      sendUpdates: 'all',
      requestBody: event,
    });

    if (!eventData || !eventData.id) {
      console.error('Event creation failed');
      return NextResponse.json(
        { error: 'Failed to create calendar event' },
        { status: 502 }
      );
    }

    console.log('Event created:', { eventId: eventData.id, hasConference: !!eventData.conferenceData });

    // 7. WAIT FOR GOOGLE TO GENERATE MEET LINK, THEN FETCH IT
    // Google doesn't return the Meet link in the insert response — it generates it asynchronously
    // We must wait a moment then call events.get() to read the generated link
    let meetLink: string | null = null;
    let retries = 0;
    const maxRetries = 10;
    const retryDelayMs = 500;

    while (!meetLink && retries < maxRetries) {
      if (retries > 0) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }

      const { data: updatedEvent } = await calendar.events.get({
        calendarId: 'primary',
        eventId: eventData.id!,
      });

      // Try to extract the Meet link from the updated event
      meetLink = updatedEvent?.hangoutLink
        || updatedEvent?.conferenceData?.entryPoints
          ?.find(ep => ep.entryPointType === 'video')
          ?.uri
        || null;

      if (meetLink) {
        console.log('Meet link generated on retry', retries + 1, ':', meetLink);
        break;
      }

      retries++;
    }

    if (!meetLink) {
      console.error('No Meet link found after', maxRetries, 'retries:', {
        eventId: eventData.id,
      });

      // Clean up - delete the event if we can't get a Meet link
      try {
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: eventData.id,
        });
      } catch {
        console.warn('Could not delete event without Meet link');
      }

      return NextResponse.json(
        { error: 'Failed to generate Google Meet link' },
        { status: 502 }
      );
    }

    console.log('Meet link confirmed:', meetLink);

    return NextResponse.json({
      success: true,
      eventId: eventData.id,
      meetLink,
      eventData: {
        id: eventData.id,
        htmlLink: eventData.htmlLink,
      },
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Create event error:', errorMsg);
    return NextResponse.json(
      { error: `Failed to create event: ${errorMsg}` },
      { status: 500 }
    );
  }
}
