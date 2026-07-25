-- Applied to production 25 July 2026. Recorded here so the repo matches the DB.
--
-- A student's coaching-class timetable, extracted from a photo/PDF they upload
-- once and then confirm by hand. One row per student.
--
-- blocks: [{ day:0-6 (0=Mon), start:'18:00', end:'20:00', section:'QA'|'VARC'|
--            'DILR'|null, topic:<one of our locked topics>|null, label:<raw text> }]
--
-- topic is ALWAYS either a name from our own taxonomy or null. The extractor is
-- forbidden from inventing topic names, and lib/timetable.ts drops anything not
-- in the list before it is stored — an invented topic would silently corrupt
-- the Blueprint, Revision Queue and Health engines that key off it.
create table if not exists public.student_timetables (
  student_id   uuid primary key references public.profiles(id) on delete cascade,
  blocks       jsonb       not null default '[]'::jsonb,
  source       text        not null default 'photo',
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.student_timetables enable row level security;

-- auth.uid() wrapped in a subselect throughout: evaluated once per query rather
-- than once per row (matches the 25 Jul RLS InitPlan pass).
drop policy if exists "student manages own timetable" on public.student_timetables;
create policy "student manages own timetable" on public.student_timetables
  for all
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

drop policy if exists "buddy reads assigned student timetable" on public.student_timetables;
create policy "buddy reads assigned student timetable" on public.student_timetables
  for select
  using (student_id in (select p.id from public.profiles p where p.buddy_id = (select auth.uid())));

drop policy if exists "admin reads all timetables" on public.student_timetables;
create policy "admin reads all timetables" on public.student_timetables
  for select
  using (exists (select 1 from public.profiles p
                 where p.id = (select auth.uid()) and p.role = 'admin'));
