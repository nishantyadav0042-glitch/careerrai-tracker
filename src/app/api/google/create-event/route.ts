import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createAdminClient } from '@/lib/supabase/admin';
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
    const admin = createAdminClient();
    const { data: { user }, error: authError } = await admin.auth.getUser();

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
          } as any,
        },
      },
      attendees: [
        { email: 'noreply@careerrai.app' }, // Placeholder for attendees
      ],
    } as any;

    // Call Google Calendar API
    const response = await calendar.events.insert(
      {
        calendarId: 'primary',
        conferenceDataVersion: 1,
        requestBody: event,
      } as any
    );

    const eventData = response.data;

    // Extract Google Meet link
    const meetLink = eventData.conferenceData?.entryPoints?.find(
      (ep: any) => ep.entryPointType === 'video'
    )?.uri || eventData.hangoutLink;

    if (!meetLink) {
      console.warn('No Meet link generated for event:', eventData);
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
