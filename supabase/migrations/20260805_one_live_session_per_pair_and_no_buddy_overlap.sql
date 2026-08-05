-- Founder rule, 5 Aug: a buddy+student pair may have exactly ONE live session
-- at a time, and a buddy may never be double-booked.
--
-- Enforced in the DATABASE, not only in the API. Incident #21 happened because
-- the only guard was application code: one pair ended up with four live
-- sessions and four different rooms. A partial unique index cannot be raced,
-- forgotten by a new endpoint, or bypassed by an admin script.
--
-- Live statuses are 'scheduled' and 'active' — this table has no
-- pending/confirmed (see the valid_status check constraint).

create extension if not exists btree_gist;

-- ── One live session per pair ──────────────────────────────────────────────
create unique index if not exists one_live_session_per_pair
  on public.video_sessions (buddy_id, student_id)
  where session_status in ('scheduled', 'active');

-- ── A buddy is never in two places at once ─────────────────────────────────
-- The span carries a 15-minute tail buffer. That is not politeness: with ONE
-- permanent Meet room per buddy, a session that runs late and a session that
-- starts on time would put two different students in the SAME room together.
-- Sessions are where a student says their real percentile and their real
-- fears. The buffer is the privacy guarantee.
--
-- Maintained by a trigger rather than GENERATED: `timestamptz + interval` is
-- only STABLE (it consults the session time zone for DST) and a generated
-- column demands IMMUTABLE. A trigger has no such restriction, and the column
-- is never written by application code.
alter table public.video_sessions
  add column if not exists session_span tstzrange;

create or replace function public.video_session_span()
returns trigger
language plpgsql
as $$
begin
  new.session_span := case
    when new.scheduled_at is null then null
    else tstzrange(
      new.scheduled_at,
      new.scheduled_at + make_interval(mins => coalesce(new.duration_minutes, 30) + 15),
      '[)'
    )
  end;
  return new;
end;
$$;

drop trigger if exists set_video_session_span on public.video_sessions;
create trigger set_video_session_span
  before insert or update of scheduled_at, duration_minutes
  on public.video_sessions
  for each row execute function public.video_session_span();

update public.video_sessions
   set session_span = tstzrange(
         scheduled_at,
         scheduled_at + make_interval(mins => coalesce(duration_minutes, 30) + 15),
         '[)')
 where scheduled_at is not null
   and session_span is null;

alter table public.video_sessions
  drop constraint if exists no_overlapping_buddy_sessions;

alter table public.video_sessions
  add constraint no_overlapping_buddy_sessions
  exclude using gist (buddy_id with =, session_span with &&)
  where (session_status in ('scheduled', 'active'));

-- ── The buddy's one permanent room ─────────────────────────────────────────
-- Minted once, when a buddy connects Google. Every session they ever run uses
-- this link, so the mentor learns one URL and the student's saved link never
-- goes stale.
alter table public.profiles
  add column if not exists buddy_meet_url text,
  add column if not exists buddy_meet_event_id text;

comment on column public.profiles.buddy_meet_url is
  'Permanent Google Meet URL for this buddy. Minted once at Google connect; reused by every session.';
comment on column public.profiles.buddy_meet_event_id is
  'Google Calendar event id backing buddy_meet_url. Never deleted by session cancellation.';
