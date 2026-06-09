-- CareerRai Streak & Rewards System
-- Gamification with daily logging motivation and milestone rewards

-- Add streak columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS best_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_log_date DATE,
ADD COLUMN IF NOT EXISTS total_logs_completed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS premium_extension_days INTEGER DEFAULT 0;

-- Create streak history table
CREATE TABLE IF NOT EXISTS public.streak_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Streak tracking
  streak_count INTEGER NOT NULL,
  streak_started_at DATE NOT NULL,
  streak_ended_at DATE,
  reason_ended VARCHAR(100), -- 'missed_day', 'manual_reset', null if ongoing

  -- Reward tracking
  reward_earned VARCHAR(100), -- e.g., '7_day_badge', '30_day_extension', etc.
  extension_days_granted INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create milestones/rewards table
CREATE TABLE IF NOT EXISTS public.streak_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Milestone definition
  milestone_days INTEGER UNIQUE NOT NULL, -- 3, 7, 14, 30, 60, 90, 100
  reward_name VARCHAR(100) NOT NULL,
  reward_description TEXT,
  icon VARCHAR(50), -- emoji

  -- Rewards granted
  extension_days INTEGER DEFAULT 0, -- days of free extension
  badge_name VARCHAR(100),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert milestone definitions
INSERT INTO public.streak_rewards (milestone_days, reward_name, reward_description, icon, extension_days, badge_name)
VALUES
  (3, 'Hot Start 🔥', 'You''re on fire! Complete 3 days in a row', '🔥', 0, 'hot_start'),
  (7, 'Weekly Warrior', '1 week of consistent effort! Get 3 days free', '⚔️', 3, 'weekly_warrior'),
  (14, 'Fortnight Fighter', '2 weeks straight! You''re unstoppable', '💪', 0, 'fortnight_fighter'),
  (30, 'Month Master', '🎉 30 days! Unlock 1 MONTH FREE EXTENSION', '👑', 30, 'month_master'),
  (60, 'Legend Status', '60 days! You''re a CAT prep legend', '⭐', 10, 'legend_status'),
  (90, 'Centurion Path', '90 days! Almost there!', '🏆', 15, 'centurion_path'),
  (100, 'Immortal', '100 DAYS OF PERFECTION! 🚀', '🌟', 30, 'immortal')
ON CONFLICT (milestone_days) DO NOTHING;

-- Create student reward claims table
CREATE TABLE IF NOT EXISTS public.reward_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL REFERENCES public.streak_rewards(id) ON DELETE CASCADE,

  -- Claim details
  streak_count INTEGER NOT NULL,
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  extension_days_applied INTEGER DEFAULT 0,

  -- Track if extension was applied
  extension_applied BOOLEAN DEFAULT FALSE,
  applied_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_profiles_current_streak ON public.profiles(current_streak DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_last_log_date ON public.profiles(last_log_date DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_best_streak ON public.profiles(best_streak DESC);
CREATE INDEX IF NOT EXISTS idx_streak_history_student ON public.streak_history(student_id);
CREATE INDEX IF NOT EXISTS idx_streak_history_reward ON public.streak_history(reward_earned);
CREATE INDEX IF NOT EXISTS idx_reward_claims_student ON public.reward_claims(student_id);
CREATE INDEX IF NOT EXISTS idx_reward_claims_milestone ON public.reward_claims(milestone_id);

-- RLS Policies
ALTER TABLE public.streak_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_claims ENABLE ROW LEVEL SECURITY;

-- Students can view their own streak data
CREATE POLICY "Students view own streak history"
  ON public.streak_history
  FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Students view own reward claims"
  ON public.reward_claims
  FOR SELECT
  USING (student_id = auth.uid());

-- Service role can update
CREATE POLICY "Service role manages streaks"
  ON public.streak_history
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role manages rewards"
  ON public.reward_claims
  FOR ALL
  USING (true)
  WITH CHECK (true);
