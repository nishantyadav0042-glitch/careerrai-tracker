-- ============================================================
-- CareerRai Tracker — Initial Schema
-- Run this in Supabase SQL Editor (one click: paste, run)
-- ============================================================

-- ── PROFILES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'student'
                    CHECK (role IN ('student', 'buddy', 'admin')),
  full_name       TEXT NOT NULL DEFAULT 'New User',
  phone           TEXT,
  email           TEXT,
  exam_target     TEXT,
  buddy_id        UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  avatar_seed     TEXT,
  notif_prefs     JSONB NOT NULL DEFAULT '{"daily_reminder":true,"reminder_time":"20:00","email":true,"push":false}'::jsonb,
  push_subscription JSONB
);

-- ── DAILY REPORTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_date       DATE NOT NULL,
  study_duration    NUMERIC(4,1) NOT NULL DEFAULT 0,
  topics_covered    TEXT[] NOT NULL DEFAULT '{}',
  quality_focus     SMALLINT NOT NULL DEFAULT 3 CHECK (quality_focus BETWEEN 1 AND 5),
  difficulty        SMALLINT NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  mock_taken        BOOLEAN NOT NULL DEFAULT FALSE,
  mock_name         TEXT,
  quant_score       SMALLINT,
  verbal_score      SMALLINT,
  logic_score       SMALLINT,
  total_accuracy    SMALLINT,
  confidence        SMALLINT NOT NULL DEFAULT 3 CHECK (confidence BETWEEN 1 AND 5),
  stress            SMALLINT NOT NULL DEFAULT 3 CHECK (stress BETWEEN 1 AND 5),
  sleep_quality     SMALLINT NOT NULL DEFAULT 3 CHECK (sleep_quality BETWEEN 1 AND 5),
  nutrition_exercise BOOLEAN NOT NULL DEFAULT FALSE,
  overall_energy    SMALLINT NOT NULL DEFAULT 3 CHECK (overall_energy BETWEEN 1 AND 5),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, report_date)
);

-- ── BUDDY FEEDBACK ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.buddy_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buddy_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feedback_date   DATE NOT NULL,
  feedback_text   TEXT NOT NULL,
  rating          SMALLINT NOT NULL DEFAULT 3 CHECK (rating BETWEEN 1 AND 5),
  next_steps      TEXT[] NOT NULL DEFAULT '{}',
  period_covered  TEXT NOT NULL DEFAULT 'adhoc'
                    CHECK (period_covered IN ('weekly', 'adhoc', 'monthly')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── TEST RESULTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.test_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  test_type     TEXT NOT NULL,
  test_name     TEXT NOT NULL,
  attempt_date  DATE NOT NULL,
  score         SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  percentile    SMALLINT NOT NULL CHECK (percentile BETWEEN 0 AND 99),
  breakdown     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── NOTIFICATIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  data        JSONB,
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  channel     TEXT NOT NULL DEFAULT 'in_app',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_daily_reports_student_date ON public.daily_reports (student_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_buddy_feedback_student ON public.buddy_feedback (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_results_student ON public.test_results (student_id, attempt_date DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_buddy ON public.profiles (buddy_id) WHERE buddy_id IS NOT NULL;

-- ── AUTO-UPDATED updated_at ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER daily_reports_updated_at
  BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── AUTO-CREATE PROFILE ON SIGNUP ─────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Buddy reads their students"
  ON public.profiles FOR SELECT
  USING (buddy_id = auth.uid());

CREATE POLICY "Admin reads all profiles"
  ON public.profiles FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- daily_reports
CREATE POLICY "Student manages own reports"
  ON public.daily_reports FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Buddy reads assigned student reports"
  ON public.daily_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = daily_reports.student_id AND buddy_id = auth.uid()
    )
  );

CREATE POLICY "Admin reads all reports"
  ON public.daily_reports FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- buddy_feedback
CREATE POLICY "Buddy manages own feedback"
  ON public.buddy_feedback FOR ALL
  USING (buddy_id = auth.uid())
  WITH CHECK (buddy_id = auth.uid());

CREATE POLICY "Student reads own feedback"
  ON public.buddy_feedback FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Admin reads all feedback"
  ON public.buddy_feedback FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- test_results
CREATE POLICY "Student manages own test results"
  ON public.test_results FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Buddy reads assigned student test results"
  ON public.test_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = test_results.student_id AND buddy_id = auth.uid()
    )
  );

CREATE POLICY "Admin reads all test results"
  ON public.test_results FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- notifications
CREATE POLICY "Users manage own notifications"
  ON public.notifications FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (TRUE);
