-- All buddies created before the storefront setup flow existed are pre-approved.
-- New buddies (created after this migration) will go through the 5-step setup.
UPDATE public.profiles
SET buddy_onboarding_completed = true
WHERE role = 'buddy'
  AND buddy_onboarding_completed = false;
