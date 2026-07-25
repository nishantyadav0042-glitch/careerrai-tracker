-- Applied to production 25 July 2026. Recorded here so the repo matches the DB.
--
-- Progress against a coaching target, in the coaching's own units.
--
-- We track hours, topics and mocks. We do NOT track "LRDI sets" or "topic
-- tests", so "you're at 37 of 200 sets" is not derivable from anything we
-- already store. This table is that missing number, and the student is the only
-- honest source for it.
--
-- Keyed by kind+section, NOT by the target's label. Coaching re-sends its plan
-- constantly with reworded text and revised numbers ("200 sets" becomes "250
-- sets"). Keying on the label would reset a student's progress to zero every
-- time their coaching rephrased a line. kind+section survives that, so a
-- re-upload merges instead of wiping.
create table if not exists public.coaching_target_progress (
  student_id  uuid        not null references public.profiles(id) on delete cascade,
  target_key  text        not null,
  done        integer     not null default 0 check (done >= 0 and done <= 100000),
  updated_at  timestamptz not null default now(),
  primary key (student_id, target_key)
);

alter table public.coaching_target_progress enable row level security;

drop policy if exists "student manages own target progress" on public.coaching_target_progress;
create policy "student manages own target progress" on public.coaching_target_progress
  for all
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

drop policy if exists "buddy reads assigned target progress" on public.coaching_target_progress;
create policy "buddy reads assigned target progress" on public.coaching_target_progress
  for select
  using (student_id in (select p.id from public.profiles p where p.buddy_id = (select auth.uid())));

drop policy if exists "admin reads all target progress" on public.coaching_target_progress;
create policy "admin reads all target progress" on public.coaching_target_progress
  for select
  using (exists (select 1 from public.profiles p
                 where p.id = (select auth.uid()) and p.role = 'admin'));
