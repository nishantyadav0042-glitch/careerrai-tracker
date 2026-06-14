-- ============================================================
-- CareerRai — Free Orientation Session + Dashboard Cleanup
-- Idempotent. Run in Supabase SQL Editor.
-- ============================================================

-- ── PART A: Add 'onboarding' to session_type constraint ──
-- Drop the existing constraint and recreate with the new value.
ALTER TABLE public.video_sessions
  DROP CONSTRAINT IF EXISTS valid_type,
  DROP CONSTRAINT IF EXISTS video_sessions_session_type_check;

ALTER TABLE public.video_sessions
  ADD CONSTRAINT video_sessions_session_type_check
  CHECK (session_type IN ('session', 'review', 'doubt_solving', 'mock_review', 'onboarding', 'guidance'));

-- ── PART A: Track whether student has used their free orientation ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS free_onboarding_used BOOLEAN NOT NULL DEFAULT false;

-- ── PART B: Index for the 7-day dashboard filter ──
-- session_status + scheduled_at compound index — the dashboard query
-- filters on both so this avoids a seq scan on large tables.
CREATE INDEX IF NOT EXISTS idx_video_sessions_status_time
  ON public.video_sessions (student_id, session_status, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_sessions_buddy_status_time
  ON public.video_sessions (buddy_id, session_status, scheduled_at DESC);
