import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/zoom/meeting/[id]
 * Get Zoom meeting details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const meetingId = resolvedParams.id;

    if (!meetingId) {
      return NextResponse.json(
        { error: 'Meeting ID required' },
        { status: 400 }
      );
    }

    // Get Zoom credentials from environment
    const zoomAccountId = process.env.ZOOM_ACCOUNT_ID;
    const zoomClientId = process.env.ZOOM_CLIENT_ID;
    const zoomClientSecret = process.env.ZOOM_CLIENT_SECRET;

    if (!zoomAccountId || !zoomClientId || !zoomClientSecret) {
      return NextResponse.json(
        { error: 'Zoom not configured' },
        { status: 500 }
      );
    }

    // Get access token
    const tokenResponse = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${zoomClientId}:${zoomClientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=account_credentials&account_id=' + zoomAccountId,
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get Zoom token');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Get meeting details
    const meetingResponse = await fetch(
      `https://api.zoom.us/v2/meetings/${meetingId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!meetingResponse.ok) {
      throw new Error(`Meeting not found: ${meetingResponse.statusText}`);
    }

    const meeting = await meetingResponse.json();

    return NextResponse.json({
      id: meeting.id,
      join_url: meeting.join_url,
      start_url: meeting.start_url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error fetching Zoom meeting:', message);
    return NextResponse.json(
      { error: message || 'Failed to fetch meeting' },
      { status: 500 }
    );
  }
}
