-- ── "I don't know" must not be permanent ────────────────────────────────────
--
-- 15 Sep 2026. The founder confirmed that sessions our records showed as
-- undelivered HAD been delivered, on time, by the mentor. They were never
-- closed out in the app, so the stale-release cron marked them `expired` — and
-- `expired` was terminal, enforced by two triggers. There was no legal way,
-- anywhere in the system, to ever record that those calls happened.
--
-- The contradiction was already written down. release-stale-sessions says:
--
--     'expired' says only what is true: the window passed, nobody recorded an
--     outcome, and it no longer blocks anyone. A mentor can still mark it
--     completed afterwards.
--
-- That last sentence was false. The DB refused it. And the same file refuses
-- to write `cancelled` precisely because that "asserts it did NOT happen" —
-- so the codebase already understood that expiry is an absence of evidence,
-- then stored it as a verdict.
--
-- 11 of the first 18 sessions ever created carry this status.
--
-- ── WHAT CHANGES, AND WHAT DELIBERATELY DOES NOT ───────────────────────────
--
-- `expired` stops being terminal. It is the cron saying "I don't know", and a
-- state that means "nobody has told us yet" must stay answerable or the record
-- is permanently and knowably wrong.
--
-- Terminal now means what it always should have: a HUMAN ASSERTION about what
-- happened. `completed` ("it did") and `cancelled` ("it did not") stay
-- absolutely immutable — those are claims a person made, and 20260824g exists
-- to stop them being re-asserted.
--
-- ONE new transition only: expired -> completed. NOT expired -> active (there
-- is nothing live to resume, and it would let the stale-release cron's own
-- work be undone), NOT expired -> cancelled (nobody called it off at the time;
-- leaving it expired is the honest record of an absence), and nothing out of
-- `cancelled` at all — completing what was called off is the one resurrection
-- this must never permit.
--
-- Every existing protection is untouched: ended_at and started_at remain
-- immutable once written, `completed` still requires an end time, and a
-- completed session still cannot be reopened.
--
-- A completion recorded this way has no observed start, which the system
-- already models honestly: deliveryCounts reports it as
-- `completedStartUnknown` — "real delivery, weaker evidence" — rather than
-- letting it pass as a watched session. That distinction is the whole reason
-- this is safe to allow.

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
    -- Terminal is a HUMAN ASSERTION about what happened, and stays absolute.
    -- `expired` is not one of those: it is the absence of an answer.
    if old_s in ('completed', 'cancelled') then
      raise exception 'video_sessions: % is terminal — cannot move to %', old_s, new_s
        using errcode = 'check_violation';
    end if;

    if not (
         (old_s = 'scheduled' and new_s in ('active', 'completed', 'cancelled', 'expired'))
      or (old_s = 'active'    and new_s in ('completed', 'cancelled', 'expired'))
      -- The one recovery: somebody ran the call and is telling us late.
      or (old_s = 'expired'   and new_s in ('completed'))
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
    --
    -- A late close-out may supply its own ended_at (the session ended when it
    -- ended, not when somebody got round to saying so). now() is only the
    -- fallback for a caller that offers nothing.
    if new_s = 'completed' and new.ended_at is null then
      new.ended_at := now();
    end if;
  end if;

  return new;
end
$$;

-- ── Re-asserting a state is still a false claim ─────────────────────────────
--
-- 20260824g stopped `completed -> completed` succeeding silently. That holds
-- for the two human assertions. For `expired` the only thing to reject is
-- re-asserting expiry; moving it to completed is the recovery this migration
-- exists to allow.
create or replace function public.video_session_terminal_reassert()
returns trigger
language plpgsql
as $$
begin
  if old.session_status in ('completed', 'cancelled') then
    raise exception 'video_sessions: this session is already % — its state cannot be set again', old.session_status
      using errcode = 'check_violation',
            hint = 'A finished session is history. Nothing further can be asserted about its state.';
  end if;
  if old.session_status = 'expired' and new.session_status = 'expired' then
    raise exception 'video_sessions: this session is already expired — its state cannot be set again'
      using errcode = 'check_violation',
            hint = 'An expired session can only be moved to completed, by someone recording that the call happened.';
  end if;
  return new;
end
$$;

comment on function public.video_session_lifecycle() is
  'Binds the session lifecycle to the table: legal transitions only, human assertions (completed/cancelled) terminal, timestamps stamped by the DB, recorded times immutable. 15 Sep 2026: expired -> completed allowed, because expired means "nobody recorded an outcome" and that must stay answerable.';

comment on function public.video_session_terminal_reassert() is
  'Rejects re-asserting session_status on a session that already carries a human assertion, and rejects re-expiring an expired one. Expired -> completed is the one permitted recovery.';
