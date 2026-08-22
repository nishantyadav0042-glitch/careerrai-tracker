-- ── Daily challenges gain a KIND ────────────────────────────────────────────
--
-- Until now every row was the same thing: one question, four options, one
-- right answer, testing whether the student KNOWS something. The Radar drill
-- tests something different — whether they can decide WHICH question to spend
-- their forty minutes on, which is the skill a repeater who already knows the
-- syllabus is actually missing.
--
-- Mechanically both are a four-option choice against a clock, so the Radar
-- reuses the challenge table, the attempt route and challenge_attempts rather
-- than growing a parallel stack. What it needs is to be TELLABLE APART: with
-- no marker we could never ask "how do students do on selection versus
-- content", which is the entire point of collecting it.
--
-- Overloading `source` (provenance) or `topic` (syllabus) to carry type would
-- have avoided this migration and cost us that distinction later.

alter table public.daily_challenges
  add column if not exists kind text not null default 'question';

alter table public.daily_challenges
  drop constraint if exists daily_challenges_kind_check;

alter table public.daily_challenges
  add constraint daily_challenges_kind_check
  check (kind in ('question', 'radar_first', 'radar_discard'));

comment on column public.daily_challenges.kind is
  'question = knowledge MCQ. radar_first = which set would you attempt first. radar_discard = which set would you drop. Radar rows measure selection, not knowledge.';

create index if not exists daily_challenges_kind_idx
  on public.daily_challenges (kind, live_date);
