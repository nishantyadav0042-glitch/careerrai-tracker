-- Student expanded onboarding fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS category text CHECK (category IN ('General','OBC','SC','ST','EWS')),
  ADD COLUMN IF NOT EXISTS attempt_year smallint,
  ADD COLUMN IF NOT EXISTS exam_date date,
  ADD COLUMN IF NOT EXISTS course_year smallint,
  ADD COLUMN IF NOT EXISTS is_working_professional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS work_ex_months smallint,
  ADD COLUMN IF NOT EXISTS coaching_enrolled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS baseline_varc smallint,
  ADD COLUMN IF NOT EXISTS baseline_dilr smallint,
  ADD COLUMN IF NOT EXISTS baseline_qa smallint,
  ADD COLUMN IF NOT EXISTS baseline_mocks_taken smallint,
  ADD COLUMN IF NOT EXISTS baseline_locked boolean NOT NULL DEFAULT false;

-- Buddy storefront profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_attempt_percentile smallint,
  ADD COLUMN IF NOT EXISTS cat_year smallint,
  ADD COLUMN IF NOT EXISTS iim_converted text,
  ADD COLUMN IF NOT EXISTS current_company text,
  ADD COLUMN IF NOT EXISTS biggest_mistake text,
  ADD COLUMN IF NOT EXISTS younger_self_advice text,
  ADD COLUMN IF NOT EXISTS strongest_section text CHECK (strongest_section IN ('VARC','DILR','QA')),
  ADD COLUMN IF NOT EXISTS student_types_helped text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS how_i_work text,
  ADD COLUMN IF NOT EXISTS buddy_onboarding_completed boolean NOT NULL DEFAULT false;

-- Mark existing buddies (those who completed the old audio-only setup) as onboarding-complete
-- so they aren't redirected to the new setup flow.
UPDATE public.profiles
SET buddy_onboarding_completed = true
WHERE role = 'buddy'
  AND intro_audio_url IS NOT NULL;
