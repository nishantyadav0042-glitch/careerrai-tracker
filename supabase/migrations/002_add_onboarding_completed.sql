-- Add onboarding_completed column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for faster onboarding checks
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed
ON public.profiles (onboarding_completed)
WHERE onboarding_completed = FALSE;
