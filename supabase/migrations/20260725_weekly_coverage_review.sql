-- Applied to production 25 July 2026. Recorded here so the repo matches the DB.
--
-- When the student last explicitly REVIEWED their coverage matrix.
--
-- Deliberately NOT topic_coverage.updated_at: that column moves every time a
-- task completion writes a status, so it answers "when did a row last change",
-- not "when did the student last look at the whole picture and confirm it".
-- Only the weekly review stamps this.
--
-- NULL means never reviewed since this shipped, so every existing student is
-- due immediately — which is correct. A matrix filled once during onboarding
-- and never revisited is exactly the stale data this exists to fix, and every
-- engine downstream (Blueprint, pace ring, revision queue, daily insight, the
-- coaching mirror) has been reading it as if it were current.
alter table public.profiles
  add column if not exists coverage_reviewed_at timestamptz;
