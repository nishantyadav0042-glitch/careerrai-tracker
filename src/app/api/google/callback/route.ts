import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { createOAuthClient } from '@/lib/google-calendar';
import { createAutomatedReminders } from '@/lib/google-reminder-utils';

/**
 * GET /api/google/callback
 * Google redirects here after consent. Exchanges the code for tokens,
 * captures the connected Gmail, stores everything server-side, then
 * sends the user back where they started (state = relative path).
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const state = request.nextUrl.searchParams.get('state');
  // state is a same-app relative path; anything else falls back to root
  const landing = state && state.startsWith('/') ? state : '/';
  const fail = (reason: string) =>
    NextResponse.redirect(`${appUrl}${landing}?google_connect=failed&reason=${reason}`);

  try {
    const code = request.nextUrl.searchParams.get('code');
    if (request.nextUrl.searchParams.get('error')) return fail('denied');
    if (!code) return fail('missing_code');

    // Who is connecting? (cookie session — user arrives in their own browser)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail('not_signed_in');

    // Exchange code for tokens
    const oauth2Client = createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token || !tokens.access_token) {
      // Happens if a previous grant exists without prompt:'consent'
      return fail('no_refresh_token');
    }
    oauth2Client.setCredentials(tokens);

    // The primary calendar's id IS the account email — no extra scope needed
    let googleEmail: string | null = null;
    try {
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      const { data: primary } = await calendar.calendars.get({ calendarId: 'primary' });
      googleEmail = primary.id ?? null;
    } catch {
      // non-fatal — email is cosmetic
    }

    const admin = createAdminClient();
    const { error: tokenError } = await admin.from('google_oauth_tokens').upsert({
      user_id: user.id,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      token_expires_at: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      google_email: googleEmail,
      updated_at: new Date().toISOString(),
    });
    if (tokenError) {
      console.error('Error storing Google tokens:', tokenError);
      return fail('storage');
    }

    await admin
      .from('profiles')
      .update({
        google_calendar_connected: true,
        google_calendar_connected_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    // Daily reminders — in-process, best-effort
    try {
      const { data: profile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      const role = profile?.role === 'buddy' ? 'buddy' : 'student';
      await createAutomatedReminders(user.id, role);
    } catch (remindersError) {
      console.error('Reminder setup failed (non-fatal):', remindersError);
    }

    return NextResponse.redirect(`${appUrl}${landing}?google_connect=success`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    return fail('callback_error');
  }
}
