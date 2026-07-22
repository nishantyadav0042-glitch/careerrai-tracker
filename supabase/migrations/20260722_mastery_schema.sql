-- Mastery system schema (QA / DILR / VARC per-topic study plan).
--
-- These tables + profile flags were originally applied ad hoc to the live
-- project; this migration captures them as the reproducible source of truth so
-- a fresh environment (staging rebuild, DR restore, new region) provisions an
-- identical schema. Written idempotently (IF NOT EXISTS) so it is safe to run
-- against the existing project as well.
--
-- One table pair is shared by all three sections via a `section` column; the
-- primary keys are (student_id, section, topic) and (student_id, section,
-- plan_date) — exactly what the application's upsert onConflict strings assume
-- (src/lib/mastery-state.ts).

-- Per-topic mastery progress + the Section-D behaviour memory.
create table if not exists public.qa_topic_progress (
  student_id                     uuid        not null references public.profiles(id) on delete cascade,
  section                        text        not null default 'QA',
  topic                          text        not null,
  stage                          text        not null default 'concept',
  sessions_done_at_stage         integer     not null default 0,
  initial_revision_sessions_done integer     not null default 0,
  last_touched_at                timestamptz,
  concept_struggles              integer     not null default 0,
  calc_struggles                 integer     not null default 0,
  revision_misses                integer     not null default 0,
  mock_flagged                   boolean     not null default false,
  updated_at                     timestamptz not null default now(),
  primary key (student_id, section, topic)
);

-- Today's swap overrides (postpone-never-delete): one row per student/section/day.
create table if not exists public.qa_daily_plan (
  student_id        uuid        not null references public.profiles(id) on delete cascade,
  section           text        not null default 'QA',
  plan_date         date        not null,
  swapped_priority  text,
  swapped_secondary text,
  updated_at        timestamptz not null default now(),
  primary key (student_id, section, plan_date)
);

-- Rollout gate + bonus opt-in, per section. Default false: gated rollout, off
-- for everyone until explicitly enabled per account.
alter table public.profiles
  add column if not exists qa_model_enabled    boolean default false,
  add column if not exists qa_include_bonus    boolean default false,
  add column if not exists dilr_model_enabled  boolean default false,
  add column if not exists dilr_include_bonus  boolean default false,
  add column if not exists varc_model_enabled  boolean default false,
  add column if not exists varc_include_bonus  boolean default false;

-- Backfill the ON DELETE CASCADE FK on any pre-existing tables that were
-- created before this migration without it (fixes the account-erasure orphan
-- gap). Idempotent: only adds the constraint when it is missing.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'qa_topic_progress_student_id_fkey') then
    alter table public.qa_topic_progress
      add constraint qa_topic_progress_student_id_fkey
      foreign key (student_id) references public.profiles(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qa_daily_plan_student_id_fkey') then
    alter table public.qa_daily_plan
      add constraint qa_daily_plan_student_id_fkey
      foreign key (student_id) references public.profiles(id) on delete cascade;
  end if;
end $$;
