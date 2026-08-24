-- ── The ₹299 session must be deliverable before anyone is asked to sell it ──
--
-- 24 Aug 2026. 16 sessions have ever existed: 9 expired, 7 cancelled, ZERO
-- completed. Every one of them carried a working google_meet_link, so the
-- failure was never "nothing to join".
--
-- The real hole: `active` was an UNREACHABLE STATE. The CHECK has allowed
-- scheduled/active/completed/cancelled/expired since the table was created,
-- but no line of code has ever written `active` or `started_at`. A session
-- could only sit at `scheduled` until the stale-release cron expired it. So
-- "did the session actually happen?" had no answer, and completion rate had
-- no numerator.
--
-- WHY A TRIGGER AND NOT A NEW WRITER:
-- four call sites already write session_status (buddy debrief close-out,
-- orientation complete, admin cancel, stale-release cron). Adding lifecycle
-- rules to each is four places to forget. A BEFORE UPDATE trigger binds the
-- rules to the TABLE, so every writer — including ones not yet written — gets
-- them, and no existing authority acquires a competing one.

create or replace function public.video_session_lifecycle()
returns trigger
language plpgsql
as $$
declare
  old_s text := old.session_status;
  new_s text := new.session_status;
begin
  -- ── A recorded time is a fact about the past; it cannot be rewritten ──────
  -- Without this, a second close-out silently moves the timestamp and the
  -- duration of a real session becomes fiction.
  if old.started_at is not null and new.started_at is distinct from old.started_at then
    raise exception 'video_sessions: started_at is already recorded (%) and cannot be changed', old.started_at
      using errcode = 'check_violation';
  end if;
  if old.ended_at is not null and new.ended_at is distinct from old.ended_at then
    raise exception 'video_sessions: ended_at is already recorded (%) and cannot be changed', old.ended_at
      using errcode = 'check_violation';
  end if;

  if new_s is distinct from old_s then
    -- Terminal is terminal. This is what makes "duplicate completion"
    -- impossible rather than merely discouraged.
    if old_s in ('completed', 'cancelled', 'expired') then
      raise exception 'video_sessions: % is terminal — cannot move to %', old_s, new_s
        using errcode = 'check_violation';
    end if;

    if not (
         (old_s = 'scheduled' and new_s in ('active', 'completed', 'cancelled', 'expired'))
      or (old_s = 'active'    and new_s in ('completed', 'cancelled', 'expired'))
    ) then
      raise exception 'video_sessions: illegal transition % -> %', old_s, new_s
        using errcode = 'check_violation';
    end if;

    -- The timestamps are stamped HERE, by the database, at the moment the
    -- state actually changes — not by whichever caller remembered to.
    if new_s = 'active' and new.started_at is null then
      new.started_at := now();
    end if;

    -- Only `completed` stamps ended_at. A cancelled or expired session never
    -- happened, and stamping it would make count(ended_at) — the most natural
    -- "sessions delivered" query anyone will ever write — silently wrong.
    if new_s = 'completed' and new.ended_at is null then
      new.ended_at := now();
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists video_session_lifecycle_guard on public.video_sessions;
create trigger video_session_lifecycle_guard
  before update on public.video_sessions
  for each row
  execute function public.video_session_lifecycle();

-- ── Structural facts, independent of the trigger ────────────────────────────

-- A session cannot end before it began.
alter table public.video_sessions drop constraint if exists video_sessions_ends_after_start;
alter table public.video_sessions
  add constraint video_sessions_ends_after_start
  check (ended_at is null or started_at is null or ended_at >= started_at);

-- `completed` is a claim that the session concluded. Without an end time it is
-- an unfalsifiable one, and completion rate would count rows that assert
-- nothing.
alter table public.video_sessions drop constraint if exists video_sessions_completed_has_end;
alter table public.video_sessions
  add constraint video_sessions_completed_has_end
  check (session_status <> 'completed' or ended_at is not null);

-- DELIBERATELY NOT ENFORCED: completed => started_at is not null.
-- A mentor who ran the call but never tapped "start" has still delivered the
-- session. Requiring an observed start would push them to fabricate one. The
-- MIS instead reports completed-with-observed-start as FACT and the remainder
-- as "start not recorded" — an honest gap beats a manufactured timestamp.

-- Finding "how many sessions were delivered" and "what is live right now" are
-- the two queries the founder view runs on every load.
create index if not exists video_sessions_status_sched_idx
  on public.video_sessions (session_status, scheduled_at desc);

comment on function public.video_session_lifecycle() is
  'Binds the session lifecycle to the table: legal transitions only, terminal states terminal, timestamps stamped by the DB, recorded times immutable. Added 24 Aug 2026 after 16 sessions produced 0 completions because `active` was unreachable.';
