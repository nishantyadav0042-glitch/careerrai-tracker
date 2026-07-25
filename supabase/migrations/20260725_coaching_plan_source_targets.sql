-- Applied to production 25 July 2026. Recorded here so the repo matches the DB.

-- Which plan a student follows.
--   'careerrai' — our engine decides the order (default; every existing student).
--   'coaching'  — follow the coaching's sequence: their topics are prioritised
--                 and, when the uploaded document actually PRINTS a syllabus end
--                 date, that date drives the target instead of our projection.
alter table public.profiles
  add column if not exists plan_source text not null default 'careerrai';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_plan_source_check') then
    alter table public.profiles add constraint profiles_plan_source_check
      check (plan_source in ('careerrai', 'coaching'));
  end if;
end $$;

alter table public.student_timetables
  add column if not exists kind text not null default 'weekly',
  add column if not exists syllabus_end_date date,
  -- Coaching TARGETS, not just class times.
  --
  -- Real evidence (founder's Rodha R8 batch message, 25 Jul): what coaching
  -- actually sends is a production quota with NO day-of-week and NO class times
  -- anywhere in it — "15-20 Sectional of Quant", "100-150+ topic test",
  -- "Lrdi: 200 sets". A timetable-only parser returns zero rows on that and
  -- tells the student their upload failed.
  --
  -- Coaching gives a TEACHING plan and a quota; the student still has to work
  -- out what to do today. Storing the quota is what later makes "you're at 37
  -- of 200 LRDI sets, that's 7/day from here" possible.
  add column if not exists targets jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'student_timetables_kind_check') then
    alter table public.student_timetables add constraint student_timetables_kind_check
      check (kind in ('weekly', 'monthly', 'syllabus'));
  end if;
end $$;
