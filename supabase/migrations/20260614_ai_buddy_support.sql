-- ============================================================
-- CareerRai — Free-AI that strengthens the buddy
-- Scorecard provenance on mock_debriefs + buddy-only briefings.
-- Governing rule: AI summarizes/organizes/drafts; never diagnoses.
-- Idempotent.
-- ============================================================

-- Scorecard provenance (powers future analytics like "all IMS mocks < 80%ile").
ALTER TABLE public.mock_debriefs
  ADD COLUMN IF NOT EXISTS provider  TEXT,
  ADD COLUMN IF NOT EXISTS mock_name TEXT,
  ADD COLUMN IF NOT EXISTS mock_date DATE;

-- Buddy briefing: a facts-only, mentor-facing summary. STUDENT NEVER SEES THIS.
CREATE TABLE IF NOT EXISTS public.buddy_briefings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  buddy_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'ai',   -- 'ai' | 'fallback' (rule-based)
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, buddy_id)
);
CREATE INDEX IF NOT EXISTS idx_buddy_briefings_buddy ON public.buddy_briefings (buddy_id);

ALTER TABLE public.buddy_briefings ENABLE ROW LEVEL SECURITY;
-- The buddy may read briefings for their own students. Writes go through the
-- service-role server route. Admin uses service-role (bypasses RLS). Students
-- have NO path to this table.
DROP POLICY IF EXISTS "buddy reads own briefings" ON public.buddy_briefings;
CREATE POLICY "buddy reads own briefings" ON public.buddy_briefings
  FOR SELECT USING (auth.uid() = buddy_id);
