-- Phase 5: Enhance mock_drop_alerts table with detailed drop information

ALTER TABLE public.mock_drop_alerts
  ADD COLUMN IF NOT EXISTS previous_percentile DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS current_percentile DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS drop_points DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS test_score INT;

-- Add index for student_id to speed up queries
CREATE INDEX IF NOT EXISTS idx_mock_drop_alerts_student_triggered
  ON public.mock_drop_alerts(student_id, triggered_at DESC);
