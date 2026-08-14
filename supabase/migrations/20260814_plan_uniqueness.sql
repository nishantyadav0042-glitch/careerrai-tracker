-- ONE STUDENT = ONE PLAN PER DAY, declared in version control.
--
-- Founder, 14 Aug: "There must never be two competing authoritative study
-- plans... student_id + plan_date must resolve to exactly ONE authoritative
-- plan. If it can resolve to two: FAIL."
--
-- It cannot, today. The 14 Aug audit verified the live database already
-- carries `daily_routines_student_id_routine_date_key UNIQUE (student_id,
-- routine_date)`, and 722 plan rows across 325 students contained zero
-- duplicates. The problem is that no migration in this repo ever declared it:
-- the table was created outside version control, so the invariant existed only
-- in production.
--
-- That is a real risk, not a tidiness complaint. Both writers of daily_routines
-- (api/routine/today and lib/routine-plan) upsert with
-- `onConflict: 'student_id,routine_date'`. Without a backing unique index that
-- conflict target matches nothing, every upsert silently degrades to a plain
-- INSERT, and a rebuilt environment — `supabase db reset`, a preview branch, a
-- restored project, a local stack — starts producing duplicate same-day plans
-- with no code change at all. The most load-bearing rule in the product was
-- one environment rebuild away from disappearing.
--
-- IF NOT EXISTS both ways: this is a no-op against production and a
-- declaration everywhere else.

-- The plan row itself.
create unique index if not exists daily_routines_student_id_routine_date_key
  on public.daily_routines (student_id, routine_date);

-- A tick must identify exactly one task within one student's day, or the same
-- work can be completed twice and the day's progress stops being countable.
create unique index if not exists routine_task_completions_student_date_task_key
  on public.routine_task_completions (student_id, routine_date, task_id);

-- One coverage row per student per topic. Two rows for the same topic would
-- let the planner read a status the student never set, which is the
-- "scheduled as first contact after completion" failure class.
create unique index if not exists topic_coverage_student_section_topic_key
  on public.topic_coverage (student_id, section, topic);
