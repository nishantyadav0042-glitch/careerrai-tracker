-- ── Back-to-back sessions are allowed ──────────────────────────────────────
-- Founder, 5 Aug: "don't keep the 15 min gap — a buddy can schedule continuous
-- sessions on some free day."
--
-- The buffer existed because everyone shares the mentor's one room, so a call
-- running late could drop the next student into a live 1:1. That risk is real
-- but it is already covered by Google Meet itself: only the mentor is on the
-- invite, so every student arrives in the knock-lobby and waits to be let in.
-- The mentor decides when the room is clear.
--
-- Sessions still cannot OVERLAP. The range is half-open '[)', so 10:00-10:30
-- and 10:30-11:00 sit flush against each other and are both allowed, while
-- 10:00-10:30 and 10:15-10:45 are still refused.
create or replace function public.video_session_span()
returns trigger
language plpgsql
as $$
begin
  new.session_span := case
    when new.scheduled_at is null then null
    else tstzrange(
      new.scheduled_at,
      new.scheduled_at + make_interval(mins => coalesce(new.duration_minutes, 30)),
      '[)'
    )
  end;
  return new;
end;
$$;

update public.video_sessions
   set session_span = tstzrange(
         scheduled_at,
         scheduled_at + make_interval(mins => coalesce(duration_minutes, 30)),
         '[)')
 where scheduled_at is not null;

-- ── One strength, one weakness — every session ─────────────────────────────
alter table public.session_commitments
  add column if not exists strength text,
  add column if not exists weakness text;

comment on column public.session_commitments.strength is
  'One thing the student did well this session. Shown to the student verbatim.';
comment on column public.session_commitments.weakness is
  'One thing to fix. Shown to the student verbatim — so it must be written to be read by them.';

-- ── The 3-4 things to do before next time ──────────────────────────────────
create table if not exists public.session_assignments (
  id           uuid primary key default gen_random_uuid(),
  buddy_id     uuid not null references public.profiles(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  session_id   uuid references public.video_sessions(id) on delete set null,
  task         text not null check (length(btrim(task)) between 1 and 200),
  position     int  not null default 0,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists session_assignments_student_idx
  on public.session_assignments (student_id, created_at desc);
create index if not exists session_assignments_open_idx
  on public.session_assignments (student_id) where completed_at is null;

alter table public.session_assignments enable row level security;

-- The student may read their own tasks and tick them off — nothing else.
-- Creation is server-only (service role), so a student can never invent
-- homework or edit the text of what their mentor asked for.
drop policy if exists "Student reads own assignments" on public.session_assignments;
create policy "Student reads own assignments" on public.session_assignments
  for select using (
    student_id = (select auth.uid()) or buddy_id = (select auth.uid())
  );

comment on table public.session_assignments is
  'Tasks a mentor sets at the end of a call. Insert/update is server-only; students tick them off through /api/student/assignment.';
