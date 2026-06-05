-- Phase 1: Infrastructure - Streak Tracking and Alerts

-- Create streak_data table for tracking study streaks
CREATE TABLE IF NOT EXISTS public.streak_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_log_date DATE,
  milestone_sent_7 BOOLEAN DEFAULT FALSE,
  milestone_sent_21 BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(student_id)
);

-- Create mock_drop_alerts table for tracking score drop interventions
CREATE TABLE IF NOT EXISTS public.mock_drop_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  buddy_notified BOOLEAN DEFAULT FALSE
);

-- Add new fields to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS study_target_hours DECIMAL(2,1) DEFAULT 2;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS intro_audio_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS buddy_bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS college VARCHAR(100);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cat_percentile DECIMAL(5,2);

-- Add new fields to feedback table
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS voice_note_url TEXT;
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS feedback_type VARCHAR(50) DEFAULT 'text';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_streak_data_student_id ON public.streak_data(student_id);
CREATE INDEX IF NOT EXISTS idx_streak_data_last_log_date ON public.streak_data(last_log_date);
CREATE INDEX IF NOT EXISTS idx_mock_drop_alerts_student_id ON public.mock_drop_alerts(student_id);
CREATE INDEX IF NOT EXISTS idx_mock_drop_alerts_triggered_at ON public.mock_drop_alerts(triggered_at);

-- Update RLS policies for new tables
ALTER TABLE public.streak_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_drop_alerts ENABLE ROW LEVEL SECURITY;

-- RLS: Students can only read/write their own streak_data
CREATE POLICY "Students can read own streak_data" ON public.streak_data
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Students can update own streak_data" ON public.streak_data
  FOR UPDATE USING (student_id = auth.uid());

-- RLS: Buddies can read assigned students' streak_data
CREATE POLICY "Buddies can read assigned students streak_data" ON public.streak_data
  FOR SELECT USING (
    student_id IN (
      SELECT id FROM public.profiles WHERE buddy_id = auth.uid()
    )
  );

-- RLS: Admins can read all
CREATE POLICY "Admins can read all streak_data" ON public.streak_data
  FOR SELECT USING (
    auth.jwt() ->> 'role' = 'authenticated' AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- RLS: Students can read alerts about themselves
CREATE POLICY "Students can read own mock_drop_alerts" ON public.mock_drop_alerts
  FOR SELECT USING (student_id = auth.uid());

-- RLS: Buddies can read alerts for assigned students
CREATE POLICY "Buddies can read assigned students alerts" ON public.mock_drop_alerts
  FOR SELECT USING (
    student_id IN (
      SELECT id FROM public.profiles WHERE buddy_id = auth.uid()
    )
  );

-- RLS: Admins can read all alerts
CREATE POLICY "Admins can read all mock_drop_alerts" ON public.mock_drop_alerts
  FOR SELECT USING (
    auth.jwt() ->> 'role' = 'authenticated' AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Grant permissions
GRANT ALL ON public.streak_data TO authenticated;
GRANT ALL ON public.mock_drop_alerts TO authenticated;
