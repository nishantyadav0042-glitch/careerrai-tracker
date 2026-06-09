-- Fix: Add missing columns to streak_data table
-- The columns were defined in 20260605_add_streak_and_alerts_tables.sql but may not have been applied

ALTER TABLE public.streak_data
ADD COLUMN IF NOT EXISTS last_log_date DATE,
ADD COLUMN IF NOT EXISTS milestone_sent_7 BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS milestone_sent_21 BOOLEAN DEFAULT FALSE;

-- Verify columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'streak_data'
ORDER BY ordinal_position;
