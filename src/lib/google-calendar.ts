import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import { createAdminClient } from '@/lib/supabase/admin';

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

/**
 * Single source of truth for Google Calendar access.
 * Every API route gets its calendar client from here — no duplicated
 * token logic, no internal HTTP hops.
 */

const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

export class CalendarNotConnectedError extends Error {
  constructor(message = 'Google Calendar is not connected') {
    super(message);
    this.name = 'CalendarNotConnectedError';
  }
}

export function getRedirectUri(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`;
}

export function createOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    getRedirectUri()
  );
}

export function buildAuthUrl(state: string): string {
  // access_type offline + prompt consent → Google returns a refresh_token
  // on EVERY authorization, not just the first. Without prompt:'consent',
  // reconnects silently come back without a refresh token.
  return createOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: OAUTH_SCOPES,
    state,
  });
}

interface TokenRow {
  refresh_token: string;
  access_token: string | null;
  token_expires_at: string | null;
  google_email: string | null;
}

/**
 * Returns a ready-to-use Calendar client for the user, or throws
 * CalendarNotConnectedError. Refreshed tokens are persisted back to
 * Supabase automatically via the 'tokens' listener; a failed refresh
 * marks the profile disconnected so the UI shows a Reconnect banner.
 */
export async function getCalendarClient(userId: string): Promise<{
  calendar: calendar_v3.Calendar;
  googleEmail: string | null;
}> {
  const admin = createAdminClient();

  const { data: tokens, error } = await admin
    .from('google_oauth_tokens')
    .select('refresh_token, access_token, token_expires_at, google_email')
    .eq('user_id', userId)
    .single<TokenRow>();

  if (error || !tokens?.refresh_token) {
    throw new CalendarNotConnectedError();
  }

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token ?? undefined,
    expiry_date: tokens.token_expires_at
      ? new Date(tokens.token_expires_at).getTime()
      : undefined,
  });

  // Persist refreshed tokens so the next request reuses them
  oauth2Client.on('tokens', (newTokens) => {
    const update: Record<string, string | null> = {
      updated_at: new Date().toISOString(),
    };
    if (newTokens.access_token) update.access_token = newTokens.access_token;
    if (newTokens.refresh_token) update.refresh_token = newTokens.refresh_token;
    if (newTokens.expiry_date) {
      update.token_expires_at = new Date(newTokens.expiry_date).toISOString();
    }
    admin
      .from('google_oauth_tokens')
      .update(update)
      .eq('user_id', userId)
      .then(({ error: e }) => {
        if (e) console.error('Failed to persist refreshed Google tokens:', e.message);
      });
  });

  // Force a refresh now if the access token is missing or expiring within
  // 60s, so a revoked grant surfaces here (and flips the reconnect banner)
  // instead of as a confusing mid-request 401.
  const expiresAt = tokens.token_expires_at
    ? new Date(tokens.token_expires_at).getTime()
    : 0;
  if (!tokens.access_token || expiresAt < Date.now() + 60_000) {
    try {
      await oauth2Client.getAccessToken();
    } catch (refreshError) {
      console.error('Google token refresh failed for user', userId, refreshError);
      await admin
        .from('profiles')
        .update({ google_calendar_connected: false })
        .eq('id', userId);
      throw new CalendarNotConnectedError(
        'Google Calendar access expired — please reconnect'
      );
    }
  }

  return {
    calendar: google.calendar({ version: 'v3', auth: oauth2Client }),
    googleEmail: tokens.google_email,
  };
}

/** True if the user has a stored refresh token. */
export async function isCalendarConnected(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('google_oauth_tokens')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

/** Remove stored tokens and flip the profile flag. */
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

/** Extract the Meet link from an event, checking both shapes Google uses. */
export function extractMeetLink(event: calendar_v3.Schema$Event): string | null {
  return (
    event.hangoutLink ||
    event.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === 'video'
    )?.uri ||
    null
  );
}
