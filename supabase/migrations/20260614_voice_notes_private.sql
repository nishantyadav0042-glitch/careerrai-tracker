-- Make the voice-notes storage bucket private.
-- Audio is now served via /api/voice-notes/signed-url which enforces
-- student/buddy ownership before generating a 1-hour signed URL.
-- This replaces the previous public-URL approach where any URL that leaked
-- would be permanently accessible without authentication.

UPDATE storage.buckets
SET public = false
WHERE id = 'voice-notes';

-- Ensure no public read policy remains on this bucket's objects.
DROP POLICY IF EXISTS "Public read voice notes" ON storage.objects;
DROP POLICY IF EXISTS "voice_notes_public_read" ON storage.objects;

-- Service-role (used server-side in API routes) bypasses RLS, so no new
-- storage policy is needed for uploads or signed-URL generation.
-- Client-side code must always go through /api/voice-notes/signed-url.
