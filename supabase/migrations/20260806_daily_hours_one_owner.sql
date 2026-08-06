-- One number, one owner, one place it can change.
--
-- Founder, 6 Aug: "keep one thing fixed, that is daily hours... one number, one
-- owner, one place it can change... zero mismatch."
--
-- Until today, rescheduling a finish date silently rewrote study_target_hours to
-- whatever the new date demanded, and hours_available was a second copy updated
-- by a different set of writers. This migration:
--   1. makes study_target_hours the single value, backfilled from either column
--   2. records WHERE the value came from, so "who set this?" is answerable
--   3. renames daily_routines.generated_pace_hours to generated_hours, because
--      it now stores the daily hours a plan was built to, not a date-derived pace

alter table public.profiles
  add column if not exists study_hours_source text,
  add column if not exists study_hours_set_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_study_hours_source_check;
alter table public.profiles
  add constraint profiles_study_hours_source_check
  check (study_hours_source is null or study_hours_source in ('student', 'signup', 'derived_legacy'));

-- Backfill the canonical column from the legacy duplicate where it is missing.
update public.profiles
set study_target_hours = hours_available
where study_target_hours is null and hours_available is not null and hours_available > 0;

-- Everything that already has a value predates provenance tracking. We cannot
-- tell a number the student chose from one a date change imposed on them — the
-- original was overwritten in place. Marking them 'derived_legacy' is the honest
-- answer, and it is what makes the in-app confirmation prompt appear exactly
-- once per student. Confirming flips it to 'student' and it never returns.
update public.profiles
set study_hours_source = 'derived_legacy'
where study_hours_source is null and study_target_hours is not null;

-- The staleness comparator used to watch a date-derived pace. It now watches the
-- hours the plan was actually built to, so the name has to say that: a column
-- whose name describes something it no longer holds is how the next person
-- reintroduces the bug.
alter table public.daily_routines
  rename column generated_pace_hours to generated_hours;

comment on column public.profiles.study_target_hours is
  'The student''s daily study hours. Set ONLY by lib/daily-hours.ts setDailyHours(), only from an action the student themselves took. Never derived from a date, capacity, or behaviour.';
comment on column public.profiles.hours_available is
  'LEGACY MIRROR of study_target_hours, kept only for exports/CRM payloads that still select it. Never an input.';
comment on column public.profiles.study_hours_source is
  'student = they set it and we can prove it. signup = collected during onboarding. derived_legacy = predates provenance; the app asks them to confirm once.';
comment on column public.daily_routines.generated_hours is
  'The daily hours today''s plan was sized to. Compared against the student''s current hours to decide whether a plan built earlier today is stale.';
