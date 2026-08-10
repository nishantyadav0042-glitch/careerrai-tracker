-- Chat: delete-for-everyone (10 Aug 2026 — Shreya's ask: "I should be able to
-- delete messages").
--
-- WhatsApp-style soft delete: the row survives as a tombstone ("This message
-- was deleted") so the conversation's shape stays honest, but the content and
-- any attachment are gone for both sides. Only the SENDER may delete their own
-- message; the API enforces it and the attachment object is removed from
-- storage at the same time.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
