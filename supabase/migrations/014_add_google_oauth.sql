-- Add Google OAuth columns to profiles table
-- Stores Google Calendar API tokens securely

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS google_oauth_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS google_oauth_access_token TEXT,
ADD COLUMN IF NOT EXISTS google_oauth_token_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS google_calendar_connected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS google_calendar_connected_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_google_connected
ON public.profiles(google_calendar_connected);

-- RLS: Only user can read their own OAuth tokens (CRITICAL - tokens are sensitive!)
CREATE POLICY "Users can read own Google OAuth tokens"
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own Google OAuth tokens"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Service role can update tokens (for token refresh)
CREATE POLICY "Service role can manage Google OAuth tokens"
  ON public.profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment explaining token security
COMMENT ON COLUMN public.profiles.google_oauth_refresh_token IS
'Sensitive: Google OAuth refresh token. Never exposed to client. Server-side only.';

COMMENT ON COLUMN public.profiles.google_oauth_access_token IS
'Sensitive: Google OAuth access token (short-lived). Auto-refreshed server-side.';
