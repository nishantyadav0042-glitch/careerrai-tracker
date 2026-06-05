-- Ensure onboarding_completed column exists on profiles table
-- This migration is safe to run multiple times (uses IF NOT EXISTS)

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed
ON public.profiles(onboarding_completed);

-- Update existing records to have onboarding_completed = false if null
UPDATE public.profiles
SET onboarding_completed = FALSE
WHERE onboarding_completed IS NULL;
