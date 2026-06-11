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
  startTime: string; // ISO 8601 format
  endTime: string; // ISO 8601 format
}

/** Pull the Meet link out of an event, checking both modern and legacy fields */
function extractMeetLink(event: calendar_v3.Schema$Event): string | undefined {
  const videoEntry = event.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === 'video'
  );
  return videoEntry?.uri ?? event.hangoutLink ?? undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST /api/google/create-event
 * Creates a Google Calendar event with Google Meet conferencing on the
 * buddy's calendar, adding the student as an attendee so the event shows
 * up on their calendar too. Returns the Meet link and Calendar event ID.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json() as CreateEventRequest;

    if (!body.title || !body.startTime || !body.endTime) {
      return NextResponse.json(
        { error: 'Missing required fields: title, startTime, endTime' },
        { status: 400 }
      );
    }

    // Get user's valid access token (auto-refreshes if needed)
    const accessToken = await getValidGoogleAccessToken(user.id);

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
    });

    const calendar = google.calendar({
      version: 'v3',
      auth: oauth2Client,
    });

    // Student joins as attendee — the event lands on their calendar
    // automatically, no second event needed
    const attendees = body.studentEmail
      ? [{ email: body.studentEmail, displayName: body.studentName }]
      : undefined;

    const event: calendar_v3.Schema$Event = {
      summary: `Session: ${body.title}`,
      description: `${body.studentName} - ${body.description || 'Video session with buddy'}`,
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

    let response;
    try {
      response = await calendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        sendUpdates: 'all',
        requestBody: event,
      });
    } catch (apiError) {
      console.error('Google Calendar API error:', apiError);
      return NextResponse.json(
        { error: `Calendar API error: ${apiError instanceof Error ? apiError.message : 'Unknown'}` },
        { status: 500 }
      );
    }

    let eventData = response.data;
    let meetLink = extractMeetLink(eventData);

    console.log('Initial event response:', {
      eventId: eventData.id,
      meetLink,
      conferenceStatus: eventData.conferenceData?.conferenceStatus,
      entryPoints: eventData.conferenceData?.entryPoints,
    });

    // Conference creation can come back as "pending" — the Meet link only
    // materialises after Google finishes provisioning. Re-fetch the event
    // (max 5 retries, 1.5s apart) until the link appears.
    let retries = 0;
    while (!meetLink && eventData.id && retries < 5) {
      await sleep(1500);
      const refreshed = await calendar.events.get({
        calendarId: 'primary',
        eventId: eventData.id,
      });
      eventData = refreshed.data;
      meetLink = extractMeetLink(eventData);
      retries++;
    }

    if (!meetLink) {
      // Don't hand back a success with no link — callers would store NULL
      console.error(
        'No Meet link after retries. conferenceData:',
        JSON.stringify(eventData.conferenceData, null, 2)
      );
      // Clean up the linkless event so the buddy's calendar isn't littered
      if (eventData.id) {
        await calendar.events.delete({ calendarId: 'primary', eventId: eventData.id }).catch(() => {});
      }
      return NextResponse.json(
        { error: 'Google did not return a Meet link for the event. Please try again.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      eventId: eventData.id,
      meetLink,
      eventData: {
        id: eventData.id,
        htmlLink: eventData.htmlLink,
        summary: eventData.summary,
        startTime: eventData.start?.dateTime,
        endTime: eventData.end?.dateTime,
      },
    });
  } catch (error) {
    console.error('Error creating Google Calendar event:', error);

    if (error instanceof Error && error.message.includes('User has not connected Google Calendar')) {
      return NextResponse.json(
        { error: 'Google Calendar not connected' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create calendar event' },
      { status: 500 }
    );
  }
}
