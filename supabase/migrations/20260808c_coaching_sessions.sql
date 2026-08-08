-- What the student's coaching ACTUALLY taught, kept permanently.
--
-- student_timetables holds ONE row per student and replaces `blocks` on every
-- upload, so uploading month 2 destroyed month 1 — and with it the only record
-- of what coaching had already covered. That is the most valuable thing a
-- coaching student can give us, and we were deleting it monthly.
--
-- This table is append-and-refine instead: one row per (student, date), written
-- from the anchored month at save time. Re-uploading the same month updates
-- those dates; uploading the next month adds to them. Nothing is ever lost.
create table if not exists coaching_sessions (
  student_id  uuid not null references profiles(id) on delete cascade,
  session_date date not null,
  topics      text[] not null default '{}',
  sections    text[] not null default '{}',
  labels      text[] not null default '{}',
  minutes     integer,
  source      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (student_id, session_date)
);

create index if not exists coaching_sessions_student_date_idx
  on coaching_sessions (student_id, session_date desc);

comment on table coaching_sessions is
  'Permanent record of what a student''s coaching taught on each date, built from the anchored month (lib/timetable-month). Append-and-refine: a new upload never erases an earlier month.';

alter table coaching_sessions enable row level security;

-- Students read their own history; all writes go through the service role in
-- lib/timetable-apply, the one place that owns saving a timetable.
drop policy if exists coaching_sessions_own_read on coaching_sessions;
create policy coaching_sessions_own_read on coaching_sessions
  for select using (auth.uid() = student_id);
