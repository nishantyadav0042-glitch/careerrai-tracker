-- Add target percentile goal to student profiles.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS target_percentile smallint DEFAULT 90
  CHECK (target_percentile >= 50 AND target_percentile <= 99);
