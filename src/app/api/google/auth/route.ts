import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

/**
 * POST /api/google/auth
 * Initiates Google OAuth flow
 * Returns authorization URL for user to visit
 */
export async function POST(request: NextRequest) {
  try {
    // Get user info from request
    const { redirectUrl } = await request.json();

    if (!redirectUrl) {
      return NextResponse.json(
        { error: 'redirectUrl required' },
        { status: 400 }
      );
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`
    );

    // Generate authorization URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Get refresh token
      scope: [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar',
      ],
      state: redirectUrl, // Where to redirect after callback
      prompt: 'consent', // Force consent screen to get refresh token
    });

    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error('Error initiating Google OAuth:', error);
    return NextResponse.json(
      { error: 'Failed to initiate authentication' },
      { status: 500 }
    );
  }
}
