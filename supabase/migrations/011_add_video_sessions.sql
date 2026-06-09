-- Add video sessions table for buddy-student video calls

CREATE TABLE IF NOT EXISTS public.video_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  buddy_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Google Meet link and session details
  gmeet_link TEXT,
  session_status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, active, completed, cancelled
  session_type VARCHAR(50) DEFAULT 'session', -- session, review, doubt_solving
  duration_minutes INTEGER DEFAULT 30,

  -- Scheduling
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  -- Days since last session tracking
  last_session_date TIMESTAMPTZ,
  days_since_last_session INTEGER,

  -- Notifications
  student_notified BOOLEAN DEFAULT FALSE,
  buddy_notified BOOLEAN DEFAULT FALSE,
  reminder_sent BOOLEAN DEFAULT FALSE,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_status CHECK (session_status IN ('scheduled', 'active', 'completed', 'cancelled')),
  CONSTRAINT valid_type CHECK (session_type IN ('session', 'review', 'doubt_solving', 'mock_review'))
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_video_sessions_student ON public.video_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_buddy ON public.video_sessions(buddy_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_scheduled ON public.video_sessions(scheduled_at) WHERE session_status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_video_sessions_days_since ON public.video_sessions(student_id, last_session_date);

-- RLS Policies
ALTER TABLE public.video_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Students view own video sessions" ON public.video_sessions;
DROP POLICY IF EXISTS "Buddies manage video sessions" ON public.video_sessions;
DROP POLICY IF EXISTS "Students update own video sessions" ON public.video_sessions;

-- Students can view their own video sessions
CREATE POLICY "Students view own video sessions"
  ON public.video_sessions
  FOR SELECT
  USING (student_id = auth.uid() OR buddy_id = auth.uid());

-- Buddies can create and manage sessions
CREATE POLICY "Buddies manage video sessions"
  ON public.video_sessions
  FOR ALL
  USING (buddy_id = auth.uid())
  WITH CHECK (buddy_id = auth.uid());

-- Students can update their own sessions (accept/decline)
CREATE POLICY "Students update own video sessions"
  ON public.video_sessions
  FOR UPDATE
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Audit table for tracking session history
CREATE TABLE IF NOT EXISTS public.video_session_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.video_sessions(id) ON DELETE CASCADE,
  event_type VARCHAR(50), -- created, scheduled, started, completed, cancelled, reminder_sent
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_session_history_session ON public.video_session_history(session_id);
