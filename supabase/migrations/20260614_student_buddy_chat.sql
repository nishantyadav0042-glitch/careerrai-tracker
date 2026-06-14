-- ============================================================
-- CareerRai — Student ↔ Buddy 1:1 Chat (text, Supabase-native)
-- Realtime + Postgres only. ₹0. Strict matched-pair isolation.
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  buddy_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at    TIMESTAMPTZ
);

-- Thread fetch (newest first) and unread counting.
CREATE INDEX IF NOT EXISTS idx_chat_messages_pair   ON public.chat_messages (student_id, buddy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread ON public.chat_messages (student_id, buddy_id) WHERE read_at IS NULL;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Read: only the two people in the pair. (Realtime receive relies on this.)
DROP POLICY IF EXISTS "pair members read messages" ON public.chat_messages;
CREATE POLICY "pair members read messages" ON public.chat_messages
  FOR SELECT USING (auth.uid() = student_id OR auth.uid() = buddy_id);

-- Writes (send + mark-read) go through server API routes on the service-role
-- client, which validates the pairing. No client INSERT/UPDATE policy by design.
-- Admin moderation also uses the service-role client (bypasses RLS).

-- Realtime: publish row changes so the other party gets live delivery.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;
