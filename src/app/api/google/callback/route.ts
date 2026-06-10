import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/google/callback
 * Handles Google OAuth callback
 * Exchanges auth code for tokens and stores in Supabase
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // Original redirect URL
    const error = searchParams.get('error');

    // Check for OAuth errors
    if (error) {
      return NextResponse.redirect(
        `${state || process.env.NEXT_PUBLIC_APP_URL}/settings?error=google_auth_denied`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${state || process.env.NEXT_PUBLIC_APP_URL}/settings?error=missing_auth_code`
      );
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token || !tokens.access_token) {
      throw new Error('Missing refresh token or access token from Google');
    }

    // Get user from auth (cookie-based session — the user lands here from Google's redirect in their own browser)
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.redirect(
        `${state || process.env.NEXT_PUBLIC_APP_URL}/settings?error=auth_failed`
      );
    }

    // Store tokens in Supabase
    const { error: updateError } = await createAdminClient()
      .from('profiles')
      .update({
        google_oauth_refresh_token: tokens.refresh_token,
        google_oauth_access_token: tokens.access_token,
        google_oauth_token_expires_at: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : null,
        google_calendar_connected: true,
        google_calendar_connected_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error storing tokens:', updateError);
      return NextResponse.redirect(
        `${state || process.env.NEXT_PUBLIC_APP_URL}/settings?error=token_storage_failed`
      );
    }

    // Set up automated reminders in the background
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/google/setup-reminders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Forward the user's session cookies so setup-reminders can authenticate
          cookie: request.headers.get('cookie') ?? '',
        },
      });
    } catch (remindersError) {
      console.error('Warning: Failed to set up reminders:', remindersError);
      // Don't fail the OAuth flow if reminders setup fails
    }

    // Redirect back to settings with success
    return NextResponse.redirect(
      `${state || process.env.NEXT_PUBLIC_APP_URL}/settings?google_connected=true`
    );
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?error=callback_failed`
    );
  }
}
