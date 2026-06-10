-- SECURITY FIX: Google OAuth tokens were stored on public.profiles, where the
-- "Buddy reads their students" SELECT policy (buddy_id = auth.uid()) exposed
-- students' refresh tokens to their buddy's browser client. Additionally,
-- migration 014's "Service role can manage Google OAuth tokens" policy was
-- FOR ALL USING (true) with no TO clause, granting every authenticated user
-- full read/write on every profile row (service role bypasses RLS and never
-- needed a policy).
--
-- Fix: move tokens to a dedicated table that only the owner can SELECT and
-- only the service role can write, then drop the token columns and the bad
-- policies from profiles. google_calendar_connected stays on profiles (it is
-- non-sensitive and read client-side by the settings pages).

-- Step 1: Dedicated token table
CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Owner may read their own row. No INSERT/UPDATE/DELETE policies: all writes
-- go through the service-role admin client, which bypasses RLS.
DROP POLICY IF EXISTS "Owner reads own google tokens" ON public.google_oauth_tokens;
CREATE POLICY "Owner reads own google tokens"
  ON public.google_oauth_tokens FOR SELECT
  USING (user_id = auth.uid());

COMMENT ON TABLE public.google_oauth_tokens IS
'Sensitive: Google OAuth tokens. Server-side (service role) writes only; owner-only SELECT via RLS.';

-- Step 2: Copy existing tokens from profiles
INSERT INTO public.google_oauth_tokens (user_id, refresh_token, access_token, token_expires_at)
SELECT id, google_oauth_refresh_token, google_oauth_access_token, google_oauth_token_expires_at
FROM public.profiles
WHERE google_oauth_refresh_token IS NOT NULL
ON CONFLICT (user_id) DO UPDATE
  SET refresh_token = EXCLUDED.refresh_token,
      access_token = EXCLUDED.access_token,
      token_expires_at = EXCLUDED.token_expires_at,
      updated_at = now();

-- Step 3: Drop the policies added by migration 014.
-- "Service role can manage..." was a critical hole (see header). The two
-- "Users can ..." policies duplicate 001's own-profile policies.
DROP POLICY IF EXISTS "Service role can manage Google OAuth tokens" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own Google OAuth tokens" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own Google OAuth tokens" ON public.profiles;

-- Step 4: Remove token columns from profiles
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS google_oauth_refresh_token,
  DROP COLUMN IF EXISTS google_oauth_access_token,
  DROP COLUMN IF EXISTS google_oauth_token_expires_at;
