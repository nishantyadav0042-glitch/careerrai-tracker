-- Add voice note support to buddy_feedback table

-- Add columns if they don't exist
ALTER TABLE public.buddy_feedback
ADD COLUMN IF NOT EXISTS voice_note_url TEXT,
ADD COLUMN IF NOT EXISTS feedback_type VARCHAR(50) DEFAULT 'text',
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Make feedback_text nullable to allow voice-only feedback
ALTER TABLE public.buddy_feedback
ALTER COLUMN feedback_text DROP NOT NULL;

-- Make feedback_date nullable (voice notes don't need specific date)
ALTER TABLE public.buddy_feedback
ALTER COLUMN feedback_date DROP NOT NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_buddy_feedback_voice_notes
ON public.buddy_feedback (student_id, created_at DESC)
WHERE voice_note_url IS NOT NULL;

-- Update RLS policies to allow voice note inserts
DROP POLICY IF EXISTS "Buddy manages own feedback" ON public.buddy_feedback;

CREATE POLICY "Buddy manages own feedback"
  ON public.buddy_feedback FOR ALL
  USING (buddy_id = auth.uid())
  WITH CHECK (buddy_id = auth.uid());
