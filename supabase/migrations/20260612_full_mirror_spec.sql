-- Full Mirror Spec: Dream-first onboarding, emotional layer, brain breaks, Phase 11 schema

-- Phase 2: Dream-first onboarding fields on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS dream_colleges text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_repeater boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS starting_percentile smallint,
  ADD COLUMN IF NOT EXISTS hours_available smallint;

-- Phase 5: Emotional layer on daily_reports
ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS emotional_chips text[] DEFAULT '{}';

-- Phase 11 (schema-only): Shadow Rival + Section ELO
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS shadow_rival_id uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS section_elo jsonb DEFAULT '{"varc": 1200, "dilr": 1200, "qa": 1200}'::jsonb;

-- Phase 7: Brain break logs
CREATE TABLE IF NOT EXISTS brain_break_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_type text NOT NULL CHECK (game_type IN ('math_sprint', 'pattern_lock', 'memory_grid', 'sudoku_blitz')),
  score integer,
  duration_seconds integer,
  played_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brain_break_logs_student_day
  ON brain_break_logs(student_id, played_at);

-- RLS for brain_break_logs
ALTER TABLE brain_break_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Student sees own brain breaks" ON brain_break_logs
  FOR ALL USING (student_id = auth.uid());
