-- ============================================================================
-- CAREERRAI - COMPLETE SUPABASE SETUP & FIXES
-- Copy this entire script and run in Supabase SQL Editor
-- ============================================================================

-- Step 1: Ensure onboarding_completed column exists
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Step 2: Update any null values
UPDATE public.profiles
SET onboarding_completed = FALSE
WHERE onboarding_completed IS NULL;

-- Step 3: Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed
ON public.profiles(onboarding_completed);

-- Step 4: Ensure buddy_id column exists and is properly set
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS buddy_id UUID;

-- Step 5: Add foreign key constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_buddy_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_buddy_id_fkey
    FOREIGN KEY (buddy_id)
    REFERENCES public.profiles(id);
  END IF;
END $$;

-- Step 6: Verify all critical columns exist
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS full_name TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS role TEXT,
ADD COLUMN IF NOT EXISTS college TEXT,
ADD COLUMN IF NOT EXISTS cat_percentile NUMERIC,
ADD COLUMN IF NOT EXISTS intro_audio_url TEXT,
ADD COLUMN IF NOT EXISTS buddy_bio TEXT,
ADD COLUMN IF NOT EXISTS username TEXT;

-- Step 7: Create daily_reports table if not exists
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id),
  report_date DATE NOT NULL,
  study_duration NUMERIC,
  topics_covered TEXT[],
  confidence NUMERIC,
  stress NUMERIC,
  quality_focus NUMERIC,
  mock_taken BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_student_id
ON public.daily_reports(student_id);

CREATE INDEX IF NOT EXISTS idx_daily_reports_date
ON public.daily_reports(report_date);

-- Step 8: Create streak_data table if not exists
CREATE TABLE IF NOT EXISTS public.streak_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id),
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_logged_date DATE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(student_id)
);

CREATE INDEX IF NOT EXISTS idx_streak_data_student_id
ON public.streak_data(student_id);

-- Step 9: Create test_results table if not exists
CREATE TABLE IF NOT EXISTS public.test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id),
  test_type TEXT,
  score NUMERIC,
  percentile NUMERIC,
  test_date TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_results_student_id
ON public.test_results(student_id);

-- Step 10: Create feedback table if not exists
CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id),
  buddy_id UUID REFERENCES public.profiles(id),
  feedback_type TEXT,
  content TEXT,
  voice_note_url TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_student_id
ON public.feedback(student_id);

-- Step 11: Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streak_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Step 12: Create RLS policies for profiles
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- Step 13: Create RLS policies for daily_reports
CREATE POLICY "Students can view their own reports"
ON public.daily_reports FOR SELECT
USING (auth.uid() = student_id);

CREATE POLICY "Students can insert their own reports"
ON public.daily_reports FOR INSERT
WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Buddies can view assigned student reports"
ON public.daily_reports FOR SELECT
USING (
  student_id IN (
    SELECT id FROM public.profiles
    WHERE buddy_id = auth.uid()
  )
);

-- Step 14: Create RLS policies for streak_data
CREATE POLICY "Users can view their own streak"
ON public.streak_data FOR SELECT
USING (auth.uid() = student_id);

CREATE POLICY "Users can update their own streak"
ON public.streak_data FOR UPDATE
USING (auth.uid() = student_id);

-- Step 15: Create RLS policies for test_results
CREATE POLICY "Users can view their own test results"
ON public.test_results FOR SELECT
USING (auth.uid() = student_id);

CREATE POLICY "Users can insert their own test results"
ON public.test_results FOR INSERT
WITH CHECK (auth.uid() = student_id);

-- Step 16: Create RLS policies for feedback
CREATE POLICY "Users can view feedback about them"
ON public.feedback FOR SELECT
USING (auth.uid() = student_id OR auth.uid() = buddy_id);

CREATE POLICY "Users can create feedback"
ON public.feedback FOR INSERT
WITH CHECK (auth.uid() = buddy_id);

-- Step 17: Ensure storage buckets exist (if not already)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('buddy-intros', 'buddy-intros', true),
  ('voice-notes', 'voice-notes', true)
ON CONFLICT (id) DO NOTHING;

-- Step 18: Create storage policies
CREATE POLICY "Public read buddy-intros"
ON storage.objects FOR SELECT
USING (bucket_id = 'buddy-intros');

CREATE POLICY "Public read voice-notes"
ON storage.objects FOR SELECT
USING (bucket_id = 'voice-notes');

CREATE POLICY "Authenticated can upload"
ON storage.objects FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- VERIFICATION QUERIES (Run these to verify everything is set up correctly)
-- ============================================================================

-- Check if onboarding_completed column exists
SELECT column_name FROM information_schema.columns
WHERE table_name='profiles' AND column_name='onboarding_completed';

-- Check if tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_type='BASE TABLE'
ORDER BY table_name;

-- Check if storage buckets exist
SELECT id, name, public FROM storage.buckets;

-- ============================================================================
-- SUCCESS! All tables, columns, and RLS policies are now properly configured
-- ============================================================================
