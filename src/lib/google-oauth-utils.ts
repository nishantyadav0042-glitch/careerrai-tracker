import { google } from 'googleapis';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Get a valid access token for a user's Google Calendar
 * Automatically refreshes if expired
 */
export async function getValidGoogleAccessToken(userId: string): Promise<string> {
  const admin = createAdminClient();

  // Get user's tokens from Supabase
  const { data: profile, error } = await admin
    .from('profiles')
    .select('google_oauth_refresh_token, google_oauth_access_token, google_oauth_token_expires_at')
    .eq('id', userId)
    .single();

  if (error || !profile?.google_oauth_refresh_token) {
    throw new Error('User has not connected Google Calendar');
  }

  const now = new Date();
  const expiryDate = profile.google_oauth_token_expires_at
    ? new Date(profile.google_oauth_token_expires_at)
    : null;

  // Check if token is still valid (with 5 min buffer)
  if (expiryDate && expiryDate.getTime() > now.getTime() + 5 * 60 * 1000) {
    return profile.google_oauth_access_token;
  }

  // Token expired, refresh it
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`
  );

  oauth2Client.setCredentials({
    refresh_token: profile.google_oauth_refresh_token,
  });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error('Failed to get new access token');
    }

    // Update tokens in Supabase
    await admin
      .from('profiles')
      .update({
        google_oauth_access_token: credentials.access_token,
        google_oauth_token_expires_at: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
      })
      .eq('id', userId);

    return credentials.access_token;
  } catch (error) {
    console.error('Failed to refresh Google token:', error);
    // Mark calendar as disconnected if refresh fails
    await admin
      .from('profiles')
      .update({ google_calendar_connected: false })
      .eq('id', userId);
    throw new Error('Failed to refresh Google Calendar token');
  }
}

/**
 * Check if user has connected Google Calendar
 */
export async function isGoogleCalendarConnected(userId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('profiles')
    .select('google_calendar_connected')
    .eq('id', userId)
    .single();

  if (error) return false;
  return data?.google_calendar_connected ?? false;
}

/**
 * Disconnect Google Calendar
 */
export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from('profiles')
    .update({
      google_oauth_refresh_token: null,
      google_oauth_access_token: null,
      google_oauth_token_expires_at: null,
      google_calendar_connected: false,
    })
    .eq('id', userId);

  if (error) {
    throw new Error('Failed to disconnect Google Calendar');
  }
}
