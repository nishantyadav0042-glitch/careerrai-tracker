import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import { createClient } from '@/lib/supabase/server';
import { getValidGoogleAccessToken } from '@/lib/google-oauth-utils';

interface CreateEventRequest {
  title: string;
  description?: string;
  studentName: string;
  studentEmail?: string;
  startTime: string;
  endTime: string;
}

function extractMeetLink(event: calendar_v3.Schema$Event): string | undefined {
  const videoEntry = event.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === 'video'
  );
  return videoEntry?.uri ?? event.hangoutLink ?? undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as CreateEventRequest;

    if (!body.title || !body.startTime || !body.endTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const accessToken = await getValidGoogleAccessToken(user.id);

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`
    );

    oauth2Client.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({
      version: 'v3',
      auth: oauth2Client,
    });

    const attendees = body.studentEmail
      ? [{ email: body.studentEmail, displayName: body.studentName }]
      : undefined;

    // Simple approach: use ISO UTC times directly
    // Google Calendar understands RFC3339 format (what toISOString() produces)
    const event: calendar_v3.Schema$Event = {
      summary: `Session: ${body.title}`,
      description: `${body.studentName}${body.description ? ': ' + body.description : ''}`,
      start: {
        dateTime: body.startTime,
      },
      end: {
        dateTime: body.endTime,
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

    console.log('Creating Google Calendar event:', {
      title: event.summary,
      startTime: event.start?.dateTime,
      endTime: event.end?.dateTime,
      hasAttendee: !!attendees?.[0],
    });

    const response = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      sendUpdates: 'all',
      requestBody: event,
    });

    let eventData = response.data;
    let meetLink = extractMeetLink(eventData);

    console.log('Event created:', {
      eventId: eventData.id,
      hasMeetLink: !!meetLink,
      conferenceStatus: eventData.conferenceData?.conferenceStatus,
    });

    // Wait for Meet link generation (Google may return it pending)
    let retries = 0;
    while (!meetLink && eventData.id && retries < 10) {
      await sleep(800);
      const refreshed = await calendar.events.get({
        calendarId: 'primary',
        eventId: eventData.id,
      });
      eventData = refreshed.data;
      meetLink = extractMeetLink(eventData);
      retries++;

      if (retries % 3 === 0) {
        console.log(`Waiting for Meet link... attempt ${retries}`);
      }
    }

    if (!meetLink) {
      console.error('No Meet link generated', {
        eventId: eventData.id,
        conferenceData: eventData.conferenceData,
        retries,
      });

      // Clean up
      if (eventData.id) {
        await calendar.events.delete({ calendarId: 'primary', eventId: eventData.id }).catch(() => {});
      }

      return NextResponse.json(
        { error: 'Failed to generate Google Meet link. Please try scheduling again.' },
        { status: 502 }
      );
    }

    console.log('Meet link generated successfully:', meetLink);

    return NextResponse.json({
      success: true,
      eventId: eventData.id,
      meetLink,
      eventData: {
        id: eventData.id,
        htmlLink: eventData.htmlLink,
        summary: eventData.summary,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Create event error:', errorMessage);
    return NextResponse.json(
      { error: `Failed to create calendar event: ${errorMessage}` },
      { status: 500 }
    );
  }
}
