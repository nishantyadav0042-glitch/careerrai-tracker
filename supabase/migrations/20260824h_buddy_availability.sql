-- ── Scheduling becomes a real scheduling system ─────────────────────────────
--
-- RECON FINDING (24 Aug): CareerRai had no availability model at all. A
-- session existed only because a MENTOR opened a modal and typed a time —
-- /api/calendar/schedule-meeting authenticates as the buddy. A student could
-- pay ₹299 and then had no way to choose when the call happened. There was
-- nothing to build a student-facing slot picker on top of.
--
-- What DID exist, and is kept:
--   · the GIST exclusion constraint no_overlapping_buddy_sessions — real,
--     DB-enforced double-booking prevention, already the strongest part of
--     the system;
--   · one permanent Meet room per mentor (founder decision, 5 Aug) — links
--     never rot, so this is NOT replaced with per-booking rooms;
--   · lib/booking-constraints, which already turns a constraint violation
--     into a sentence a human can act on.
--
-- What this adds is the missing half: what a mentor's week actually looks
-- like, so bookable slots can be COMPUTED rather than guessed, and so a slot
-- outside a mentor's working hours is refused by the database rather than by
-- whichever caller remembered to check.

create table if not exists public.buddy_availability (
  buddy_id uuid primary key references public.profiles(id) on delete cascade,

  -- Stored explicitly rather than assumed. Every mentor today is in IST, but
  -- "everyone is in one timezone" is the assumption that silently books a
  -- 3am call the first time it stops being true.
  timezone text not null default 'Asia/Kolkata',

  -- ISO weekdays: 1 = Monday … 7 = Sunday.
  work_days smallint[] not null,

  -- Minutes from local midnight. Integers, not times, because the whole
  -- computation downstream is arithmetic and a time type would only invite
  -- a timezone to sneak back in.
  start_minute smallint not null,
  end_minute smallint not null,

  slot_minutes smallint not null default 45,

  -- The gap a mentor needs between calls. Enforced in the session span
  -- itself (below), not merely offered as advice — the previous error
  -- message promised "at least 15 minutes clear of your other calls" while
  -- the constraint behind it permitted back-to-back bookings.
  buffer_minutes smallint not null default 15,

  -- A ceiling on a human being's day. NULL means "no explicit limit", which
  -- is different from zero and must never be read as it.
  max_per_day smallint,

  -- How far ahead a student may book, and how little notice is acceptable.
  horizon_days smallint not null default 14,
  min_notice_minutes smallint not null default 120,

  active boolean not null default true,
  updated_at timestamptz not null default now(),

  constraint buddy_availability_window check (end_minute > start_minute),
  constraint buddy_availability_day_bounds check (start_minute >= 0 and end_minute <= 24 * 60),
  -- array_length on an empty array returns NULL, and a CHECK passes on NULL —
  -- the exact hole that let an empty work_days through on the rep-config
  -- table earlier this month. coalesce closes it.
  constraint buddy_availability_has_days check (coalesce(array_length(work_days, 1), 0) between 1 and 7),
  constraint buddy_availability_days_valid check (work_days <@ array[1,2,3,4,5,6,7]::smallint[]),
  constraint buddy_availability_slot_sane check (slot_minutes between 15 and 180),
  constraint buddy_availability_buffer_sane check (buffer_minutes between 0 and 120),
  constraint buddy_availability_slot_fits check (slot_minutes <= end_minute - start_minute),
  constraint buddy_availability_horizon check (horizon_days between 1 and 90),
  constraint buddy_availability_notice check (min_notice_minutes between 0 and 10080),
  constraint buddy_availability_max_per_day check (max_per_day is null or max_per_day between 1 and 20)
);

comment on table public.buddy_availability is
  'A mentor''s bookable week. Absence of a row means the mentor is NOT bookable by students — never "bookable with defaults".';

-- ── Schema parity: the constraint the repo never declared ───────────────────
--
-- no_overlapping_buddy_sessions is the single strongest rule in the session
-- system — it is what makes double-booking impossible under concurrency
-- rather than merely unlikely. It exists in production and was NEVER in a
-- migration, so the test database did not have it, and neither would any
-- rebuilt environment.
--
-- Found by probing: a double-booking test PASSED against test (the insert was
-- allowed) while the same insert is refused in production. A probe run against
-- a schema that does not match production proves nothing, and would have let a
-- real double-booking bug through as "verified".
--
-- Declared here so the repo can rebuild it. Idempotent against production,
-- where it already exists.

create extension if not exists btree_gist;

alter table public.video_sessions drop constraint if exists no_overlapping_buddy_sessions;
alter table public.video_sessions
  add constraint no_overlapping_buddy_sessions
  exclude using gist (buddy_id with =, session_span with &&)
  where (session_status in ('scheduled', 'active'));

-- ── Time off ────────────────────────────────────────────────────────────────
-- A recurring weekly pattern cannot express "I am at a wedding on Thursday".
create table if not exists public.buddy_time_off (
  id bigserial primary key,
  buddy_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint buddy_time_off_ordered check (ends_at > starts_at)
);
create index if not exists buddy_time_off_lookup
  on public.buddy_time_off (buddy_id, starts_at, ends_at);

-- ── The buffer becomes structural ───────────────────────────────────────────
--
-- session_span drives the exclusion constraint. Extending it by the mentor's
-- buffer is what turns "please leave a gap" into a rule Postgres enforces on
-- races the application cannot see.
--
-- The buffer is read at WRITE time and baked into the span. A mentor who
-- later changes their buffer does not retroactively invalidate sessions
-- already booked — which is correct: the gap they agreed to is the gap that
-- applied when the booking was made.

create or replace function public.video_session_span()
returns trigger
language plpgsql
as $$
declare
  v_buffer int;
begin
  if new.scheduled_at is null then
    new.session_span := null;
    return new;
  end if;

  select buffer_minutes into v_buffer
    from public.buddy_availability
   where buddy_id = new.buddy_id;

  -- No availability row configured → no buffer assumed. A mentor who has not
  -- described their week gets exactly the old behaviour, so this migration
  -- cannot change the meaning of an existing booking.
  v_buffer := coalesce(v_buffer, 0);

  new.session_span := tstzrange(
    new.scheduled_at,
    new.scheduled_at + make_interval(mins => coalesce(new.duration_minutes, 30) + v_buffer),
    '[)'
  );
  return new;
end;
$$;

-- The existing trigger fires on INSERT OR UPDATE OF scheduled_at,
-- duration_minutes. buddy_id belongs in that list too: moving a session to a
-- different mentor must recompute the span under THAT mentor's buffer.
drop trigger if exists set_video_session_span on public.video_sessions;
create trigger set_video_session_span
  before insert or update of scheduled_at, duration_minutes, buddy_id
  on public.video_sessions
  for each row
  execute function public.video_session_span();

-- ── A slot outside the mentor's week is refused by the database ─────────────
--
-- The application computes bookable slots; this makes sure a request that
-- bypasses that computation (a crafted POST, a stale page, a future caller)
-- cannot land a 3am call on a mentor's calendar. DATABASE PRECONDITION over
-- APPLICATION INTENTION — the same rule the capacity work established.

create or replace function public.video_session_within_availability()
returns trigger
language plpgsql
as $$
declare
  a public.buddy_availability%rowtype;
  local_ts timestamp;
  dow smallint;
  start_min int;
  end_min int;
begin
  if new.scheduled_at is null then return new; end if;

  select * into a from public.buddy_availability where buddy_id = new.buddy_id;
  -- Not configured → this mentor is not on the student-facing booking path,
  -- and their existing mentor-scheduled flow is unaffected.
  if not found then return new; end if;

  if not a.active then
    raise exception 'This mentor is not currently taking bookings.'
      using errcode = 'check_violation';
  end if;

  local_ts := new.scheduled_at at time zone a.timezone;
  dow := extract(isodow from local_ts)::smallint;
  start_min := (extract(hour from local_ts) * 60 + extract(minute from local_ts))::int;
  end_min := start_min + coalesce(new.duration_minutes, a.slot_minutes);

  if not (dow = any(a.work_days)) then
    raise exception 'This mentor does not take sessions on that day.'
      using errcode = 'check_violation';
  end if;

  if start_min < a.start_minute or end_min > a.end_minute then
    raise exception 'That time is outside this mentor''s hours.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.buddy_time_off t
     where t.buddy_id = new.buddy_id
       and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(
             new.scheduled_at,
             new.scheduled_at + make_interval(mins => coalesce(new.duration_minutes, a.slot_minutes)),
             '[)')
  ) then
    raise exception 'This mentor is away at that time.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists video_session_within_availability_guard on public.video_sessions;
create trigger video_session_within_availability_guard
  before insert on public.video_sessions
  for each row
  execute function public.video_session_within_availability();

comment on function public.video_session_within_availability() is
  'Refuses a booking outside the mentor''s configured week, on a day they do not work, or during time off. A mentor with no availability row is unaffected. Added 24 Aug 2026 with the student-facing slot picker.';
