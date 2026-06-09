import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/zoom/create-meeting
 * Creates a real Zoom meeting
 */
export async function POST(request: NextRequest) {
  try {
    const { topic, duration, type = 2 } = await request.json();

    if (!topic) {
      return NextResponse.json(
        { error: 'topic required' },
        { status: 400 }
      );
    }

    // Get Zoom credentials from environment
    const zoomAccountId = process.env.ZOOM_ACCOUNT_ID;
    const zoomClientId = process.env.ZOOM_CLIENT_ID;
    const zoomClientSecret = process.env.ZOOM_CLIENT_SECRET;

    if (!zoomAccountId || !zoomClientId || !zoomClientSecret) {
      console.error('Missing Zoom credentials in environment');
      return NextResponse.json(
        { error: 'Zoom not configured' },
        { status: 500 }
      );
    }

    // Get access token from Zoom
    const tokenResponse = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${zoomClientId}:${zoomClientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=account_credentials&account_id=' + zoomAccountId,
    });

    if (!tokenResponse.ok) {
      throw new Error(`Failed to get Zoom token: ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Create meeting
    const meetingResponse = await fetch(
      `https://api.zoom.us/v2/users/me/meetings`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: topic,
          type: type, // 2 = Scheduled meeting
          duration: duration || 30,
          timezone: 'Asia/Kolkata',
          settings: {
            host_video: true,
            participant_video: true,
            join_before_host: false,
            auto_recording: 'cloud',
            waiting_room: false,
          },
        }),
      }
    );

    if (!meetingResponse.ok) {
      const error = await meetingResponse.text();
      console.error('Zoom meeting creation error:', error);
      throw new Error(`Failed to create Zoom meeting: ${meetingResponse.statusText}`);
    }

    const meeting = await meetingResponse.json();

    return NextResponse.json({
      id: meeting.id,
      join_url: meeting.join_url,
      start_url: meeting.start_url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error creating Zoom meeting:', message);
    return NextResponse.json(
      { error: message || 'Failed to create Zoom meeting' },
      { status: 500 }
    );
  }
}
