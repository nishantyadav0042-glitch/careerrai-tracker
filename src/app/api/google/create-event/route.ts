import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@/lib/supabase/server';
import { getValidGoogleAccessToken } from '@/lib/google-oauth-utils';

interface CreateEventRequest {
  title: string;
  description?: string;
  studentName: string;
  startTime: string; // ISO 8601 format
  endTime: string; // ISO 8601 format
}

/**
 * POST /api/google/create-event
 * Creates a Google Calendar event with Google Meet conferencing
 * Returns the Meet link and Calendar event ID
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

    // Create OAuth2 client and set access token
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
    });

    // Create Google Calendar API client
    const calendar = google.calendar({
      version: 'v3',
      auth: oauth2Client,
    });

    // Create event with Google Meet conferencing
    const event = {
      summary: `Session: ${body.title}`,
      description: `${body.studentName} - ${body.description || 'Video session with buddy'}`,
      start: {
        dateTime: new Date(body.startTime).toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      end: {
        dateTime: new Date(body.endTime).toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      conferenceData: {
        createRequest: {
          requestId: `careerrai-${user.id}-${Date.now()}`,
          conferenceSolutionKey: {
            key: 'hangoutsMeet',
          },
        },
      },
    } as any;

    // Call Google Calendar API with proper parameters
    const response = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      resource: event,
    } as any);

    const eventData = response.data;

    // Extract Google Meet link - check multiple possible locations
    let meetLink: string | undefined;

    // Try conferenceData entryPoints (primary location)
    if (eventData.conferenceData?.entryPoints) {
      const videoEntry = eventData.conferenceData.entryPoints.find(
        (ep: any) => ep.entryPointType === 'video'
      );
      if (videoEntry?.uri) {
        meetLink = videoEntry.uri;
      }
    }

    // Fallback to hangoutLink (older API format)
    if (!meetLink && eventData.hangoutLink) {
      meetLink = eventData.hangoutLink;
    }

    // Log the full response for debugging if no link found
    if (!meetLink) {
      console.error('No Meet link generated. Full response:', JSON.stringify(eventData, null, 2));
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
