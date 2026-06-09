# Apply Database Migrations

Your Supabase project: https://app.supabase.com/project/pobhpszlsozeonejtzqy

## Step 1: Apply Migration 014 (Google OAuth Columns)

1. Go to: https://app.supabase.com/project/pobhpszlsozeonejtzqy/sql/new
2. Copy-paste everything below and click **Run**:

```sql
-- Add Google OAuth columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS google_oauth_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS google_oauth_access_token TEXT,
ADD COLUMN IF NOT EXISTS google_oauth_token_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS google_calendar_connected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS google_calendar_connected_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_profiles_google_connected
ON public.profiles(google_calendar_connected);

CREATE POLICY "Users can read own Google OAuth tokens"
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own Google OAuth tokens"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Service role can manage Google OAuth tokens"
  ON public.profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON COLUMN public.profiles.google_oauth_refresh_token IS
'Sensitive: Google OAuth refresh token. Never exposed to client. Server-side only.';

COMMENT ON COLUMN public.profiles.google_oauth_access_token IS
'Sensitive: Google OAuth access token (short-lived). Auto-refreshed server-side.';
```

## Step 2: Apply Migration 015 (Google Meet Links)

1. Go to: https://app.supabase.com/project/pobhpszlsozeonejtzqy/sql/new
2. Copy-paste everything below and click **Run**:

```sql
-- Add Google Calendar and Meet link columns to video_sessions
ALTER TABLE video_sessions
ADD COLUMN IF NOT EXISTS google_event_id TEXT,
ADD COLUMN IF NOT EXISTS google_meet_link TEXT;

COMMENT ON COLUMN video_sessions.google_event_id IS 'Google Calendar event ID for this session';
COMMENT ON COLUMN video_sessions.google_meet_link IS 'Real Google Meet link from Calendar API (hangoutLink)';

CREATE INDEX IF NOT EXISTS idx_video_sessions_google_event_id 
ON video_sessions(google_event_id);
```

## Done! ✅

Once both migrations are applied, you're ready to deploy!
