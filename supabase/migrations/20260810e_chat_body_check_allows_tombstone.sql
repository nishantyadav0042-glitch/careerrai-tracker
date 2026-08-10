-- Delete-for-everyone was 500ing (Shreya, 10 Aug: "Could not delete — try
-- again"). Root cause found by replaying the exact UPDATE in a rolled-back
-- transaction: chat_messages_body_check requires a message to carry text or an
-- attachment, and the soft-delete tombstone (body = '', attachments nulled)
-- violates it — the route's UPDATE failed on the constraint and surfaced as a
-- 500. The constraint now recognises the third legitimate state: a deleted
-- message. (Applied in prod 10 Aug; verified with a BEGIN/ROLLBACK dry-run on
-- the real failing message.)
ALTER TABLE public.chat_messages DROP CONSTRAINT chat_messages_body_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_body_check
  CHECK (
    char_length(body) <= 2000
    AND (char_length(body) >= 1 OR attachment_path IS NOT NULL OR deleted_at IS NOT NULL)
  );
