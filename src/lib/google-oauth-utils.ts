import { google } from 'googleapis';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Get a valid access token for a user's Google Calendar
 * Automatically refreshes if expired
 */
export async function getValidGoogleAccessToken(userId: string): Promise<string> {
  const admin = createAdminClient();

  // Get user's tokens from Supabase (dedicated table, service-role access only)
  const { data: tokens, error } = await admin
    .from('google_oauth_tokens')
    .select('refresh_token, access_token, token_expires_at')
    .eq('user_id', userId)
    .single();

  if (error || !tokens?.refresh_token) {
    throw new Error('User has not connected Google Calendar');
  }

  const now = new Date();
  const expiryDate = tokens.token_expires_at
    ? new Date(tokens.token_expires_at)
    : null;

  // Check if token is still valid (with 5 min buffer)
  if (expiryDate && expiryDate.getTime() > now.getTime() + 5 * 60 * 1000) {
    return tokens.access_token;
  }

  // Token expired, refresh it
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`
  );

  oauth2Client.setCredentials({
    refresh_token: tokens.refresh_token,
  });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error('Failed to get new access token');
    }

    // Update tokens in Supabase
    await admin
      .from('google_oauth_tokens')
      .update({
        access_token: credentials.access_token,
        token_expires_at: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

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

  const { error: deleteError } = await admin
    .from('google_oauth_tokens')
    .delete()
    .eq('user_id', userId);

  const { error: updateError } = await admin
    .from('profiles')
    .update({ google_calendar_connected: false })
    .eq('id', userId);

  if (deleteError || updateError) {
    throw new Error('Failed to disconnect Google Calendar');
  }
}
