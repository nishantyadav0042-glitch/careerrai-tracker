-- Daily Tracker Infrastructure
-- Adds puzzle system, TODO tracking, and streak shields

-- Streak shields (allow students to skip a day without losing streak)
CREATE TABLE IF NOT EXISTS public.streak_shields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  used_on DATE,
  granted_by UUID REFERENCES public.profiles(id),
  reason TEXT CHECK (reason IN ('student_used', 'buddy_granted')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(student_id, used_on)
);

-- Daily LRDI puzzles (one per day)
CREATE TABLE IF NOT EXISTS public.daily_lrdi_puzzles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_date DATE NOT NULL UNIQUE,
  puzzle_type TEXT NOT NULL CHECK (puzzle_type IN ('seating', 'blood_relation', 'constraint', 'arrangement', 'logic')),
  puzzle_content JSONB NOT NULL,
  difficulty INT NOT NULL CHECK (difficulty >= 1 AND difficulty <= 10),
  difficulty_description TEXT,
  estimated_time_minutes INT DEFAULT 15,
  solution TEXT,
  explanation TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- LRDI puzzle attempts (track student attempts)
CREATE TABLE IF NOT EXISTS public.lrdi_puzzle_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  puzzle_id UUID NOT NULL REFERENCES public.daily_lrdi_puzzles(id) ON DELETE CASCADE,
  solved BOOLEAN NOT NULL DEFAULT FALSE,
  time_taken_seconds INT,
  accuracy DECIMAL(3, 2) CHECK (accuracy >= 0 AND accuracy <= 1),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(student_id, puzzle_id)
);

-- TODO items for students
CREATE TABLE IF NOT EXISTS public.todo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('buddy_suggested', 'student_custom', 'daily_puzzle', 'mock_review', 'session')),
  due_date DATE,
  due_time TIME,
  priority INT DEFAULT 0 CHECK (priority >= -1 AND priority <= 1),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Analytics events for tracking user behavior
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_streak_shields_student ON public.streak_shields(student_id);
CREATE INDEX IF NOT EXISTS idx_streak_shields_date ON public.streak_shields(used_on);
CREATE INDEX IF NOT EXISTS idx_daily_lrdi_puzzles_date ON public.daily_lrdi_puzzles(puzzle_date DESC);
CREATE INDEX IF NOT EXISTS idx_lrdi_attempts_student ON public.lrdi_puzzle_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_lrdi_attempts_puzzle ON public.lrdi_puzzle_attempts(puzzle_id);
CREATE INDEX IF NOT EXISTS idx_lrdi_attempts_student_puzzle ON public.lrdi_puzzle_attempts(student_id, puzzle_id);
CREATE INDEX IF NOT EXISTS idx_todo_items_student ON public.todo_items(student_id);
CREATE INDEX IF NOT EXISTS idx_todo_items_due_date ON public.todo_items(due_date);
CREATE INDEX IF NOT EXISTS idx_todo_items_completed ON public.todo_items(student_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_student ON public.analytics_events(student_id, created_at DESC);

-- Enable RLS on all tables
ALTER TABLE public.streak_shields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_lrdi_puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lrdi_puzzle_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for streak_shields
CREATE POLICY "Students can read own shields" ON public.streak_shields
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Students can insert own shields" ON public.streak_shields
  FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "Buddies can read assigned students shields" ON public.streak_shields
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.profiles WHERE buddy_id = auth.uid())
  );

-- RLS Policies for daily_lrdi_puzzles (public read)
CREATE POLICY "Anyone can read daily puzzles" ON public.daily_lrdi_puzzles
  FOR SELECT USING (true);

-- RLS Policies for lrdi_puzzle_attempts
CREATE POLICY "Students can read own attempts" ON public.lrdi_puzzle_attempts
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Students can insert own attempts" ON public.lrdi_puzzle_attempts
  FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own attempts" ON public.lrdi_puzzle_attempts
  FOR UPDATE USING (student_id = auth.uid());

CREATE POLICY "Buddies can read assigned students attempts" ON public.lrdi_puzzle_attempts
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.profiles WHERE buddy_id = auth.uid())
  );

-- RLS Policies for todo_items
CREATE POLICY "Students can read own todos" ON public.todo_items
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Students can insert own todos" ON public.todo_items
  FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own todos" ON public.todo_items
  FOR UPDATE USING (student_id = auth.uid());

CREATE POLICY "Students can delete own todos" ON public.todo_items
  FOR DELETE USING (student_id = auth.uid());

CREATE POLICY "Buddies can read assigned students todos" ON public.todo_items
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.profiles WHERE buddy_id = auth.uid())
  );

CREATE POLICY "Buddies can insert todos for assigned students" ON public.todo_items
  FOR INSERT WITH CHECK (
    student_id IN (SELECT id FROM public.profiles WHERE buddy_id = auth.uid())
  );

-- RLS Policies for analytics_events
CREATE POLICY "Students can insert own events" ON public.analytics_events
  FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "Buddies can read assigned students events" ON public.analytics_events
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.profiles WHERE buddy_id = auth.uid())
  );

-- Grants
GRANT ALL ON public.streak_shields TO authenticated;
GRANT ALL ON public.daily_lrdi_puzzles TO authenticated;
GRANT ALL ON public.lrdi_puzzle_attempts TO authenticated;
GRANT ALL ON public.todo_items TO authenticated;
GRANT ALL ON public.analytics_events TO authenticated;
