-- Storage: a blanket INSERT policy was cancelling every scoped one.
--
-- Postgres ORs the policies for a given command. So this:
--
--   "Authenticated can upload"  INSERT  WITH CHECK (auth.role() = 'authenticated')
--
-- sat alongside the careful one:
--
--   avatar_upload_own           INSERT  WITH CHECK (bucket_id = 'avatars'
--                                        AND (storage.foldername(name))[1] = auth.uid()::text)
--
-- and won. The scoped policy was decoration: any authenticated student could
-- insert any object, of any size and any MIME type, into ANY bucket at ANY
-- path — including `avatars`, which is PUBLIC and had no size limit and no MIME
-- allowlist. That is arbitrary file hosting on our own domain, reachable by
-- anyone who can sign up, and the 5 MB check in the buddy setup form is
-- client-side only so it stops nobody who is not using the form.
--
-- Cross-checked before dropping, per the pre-deletion rule — nothing depends
-- on the blanket policy:
--
--   chat-attachments    server mints createSignedUploadUrl with the SERVICE
--                       ROLE, which bypasses RLS. No client INSERT needed.
--   community-questions server-side upload with the service role. Same.
--   avatars             the ONLY client-side upload (buddy setup form), and
--                       avatar_upload_own already covers exactly it.
--   voice-notes         zero references anywhere in src/.
--   buddy-intros        zero references anywhere in src/.

drop policy if exists "Authenticated can upload" on storage.objects;

-- Bucket-level caps, so the ceiling is enforced by storage rather than by a
-- client-side `if` any non-browser caller skips. 5 MB matches what the buddy
-- setup form already tells the user; the MIME list matches what an avatar can
-- legitimately be.
update storage.buckets
   set file_size_limit    = 5242880,
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'avatars';

update storage.buckets
   set file_size_limit    = 5242880,
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'community-questions';

-- Unused today, but an unused bucket with no ceiling is a bucket waiting to be
-- found. Limits now, so enabling the feature later cannot enable the hole too.
update storage.buckets
   set file_size_limit    = 10485760,
       allowed_mime_types = array['audio/webm','audio/mpeg','audio/mp4','audio/ogg']
 where id = 'voice-notes';

update storage.buckets
   set file_size_limit    = 52428800,
       allowed_mime_types = array['video/mp4','video/webm']
 where id = 'buddy-intros';
