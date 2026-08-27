-- ── A cancelled session must not strand the ₹299 that paid for it ──────────
--
-- Rule (5) of session_credit_coherent() forbids a credit from ever changing
-- the session it is linked to. Rule (8) forbids booking_blocked from holding
-- a linked session. Together, they mean a credit whose session was CANCELLED
-- has no exit:
--
--   · it cannot be relinked to a new session          (rule 5)
--   · it cannot fall back to booking_blocked          (rules 5 + 8)
--   · sessions/schedule sees video_session_id set and answers "already
--     booked", pointing at the cancelled session
--   · hasOpenSessionCredit() counts it as open, so the student cannot buy
--     another one either
--
-- The student paid, their mentor cancelled, and the entitlement is welded to
-- a session that will never happen. 20260826b's own comment called this
-- "Phase 3's problem, not a state to fake here". That was honest when nothing
-- had been cancelled yet. It is no longer acceptable: it is a silent refund
-- the student has to notice and ask for.
--
-- THE NARROWEST POSSIBLE RELAXATION. Rule (5) still forbids every relink.
-- Exactly ONE new transition is permitted: clearing the link when the linked
-- session actually failed to deliver (cancelled or expired) AND the credit is
-- returning to booking_blocked, which rule (6) then forces to carry an owner,
-- a next_action and a failure reason. So a recovered credit is not quietly
-- reopened — it lands in the recovery queue with somebody's name on it.
--
-- What is still refused, unchanged:
--   · relinking one live session to another             (the original point)
--   · unlinking while the session is scheduled/active   (would hide a live booking)
--   · unlinking from a COMPLETED session                (delivery happened)
--   · booking_blocked while still holding a session     (rule 8, untouched)

create or replace function public.session_credit_coherent()
returns trigger
language plpgsql
as $function$
declare
  s record;
  linked_status text;
begin
  -- (1) EXISTING — a mentor is required from 'assigned' onward.
  if new.status in ('assigned', 'scheduled', 'completed') and new.buddy_id is null then
    raise exception 'session_credits: status % requires an assigned mentor', new.status
      using errcode = 'check_violation';
  end if;

  -- (2) EXISTING — a session is required from 'scheduled' onward.
  if new.status in ('scheduled', 'completed') and new.video_session_id is null then
    raise exception 'session_credits: status % requires a linked session', new.status
      using errcode = 'check_violation';
  end if;

  if new.video_session_id is not null then
    select * into s from public.video_sessions where id = new.video_session_id;
    if not found then
      raise exception 'session_credits: linked session % does not exist', new.video_session_id
        using errcode = 'check_violation';
    end if;

    -- (3) EXISTING — same student, same mentor.
    if s.student_id <> new.student_id then
      raise exception 'session_credits: linked session belongs to a different student'
        using errcode = 'check_violation';
    end if;
    if new.buddy_id is not null and s.buddy_id <> new.buddy_id then
      raise exception 'session_credits: linked session has a different mentor'
        using errcode = 'check_violation';
    end if;

    -- (4) EXISTING — video_sessions is the delivery authority.
    if new.status = 'completed' and s.session_status <> 'completed' then
      raise exception 'session_credits: cannot complete while the session is %', s.session_status
        using errcode = 'check_violation',
              hint = 'The session is the delivery authority. Complete it first.';
    end if;
  end if;

  -- (5) AMENDED 27 Aug — a credit is linked once and never relinked, with ONE
  --     exception: releasing a credit whose session failed to deliver.
  if tg_op = 'UPDATE'
     and old.video_session_id is not null
     and new.video_session_id is distinct from old.video_session_id then

    select session_status into linked_status
      from public.video_sessions where id = old.video_session_id;

    if not (
          new.video_session_id is null                    -- releasing, not relinking
      and new.status = 'booking_blocked'                  -- into the owned recovery state
      and linked_status in ('cancelled', 'expired')       -- the session really failed
    ) then
      raise exception 'session_credits: this credit is already linked to a session'
        using errcode = 'check_violation',
              hint = 'The only permitted release is a cancelled or expired session '
                     'returning the credit to booking_blocked for rebooking.';
    end if;
  end if;

  -- (6) EXISTING — a failure must be OWNED.
  if new.status in ('assignment_failed', 'booking_blocked') then
    if new.owner is null or new.next_action is null then
      raise exception 'session_credits: status % requires an owner and a next_action', new.status
        using errcode = 'check_violation',
              hint = 'A failure nobody owns is the failure this state exists to prevent.';
    end if;
    if new.failure_reason is null or new.failure_at is null then
      raise exception 'session_credits: status % requires failure_reason and failure_at', new.status
        using errcode = 'check_violation';
    end if;
  end if;

  -- (7) EXISTING — assignment_failed carries neither mentor nor session.
  if new.status = 'assignment_failed'
     and (new.buddy_id is not null or new.video_session_id is not null) then
    raise exception 'session_credits: assignment_failed cannot hold a mentor or a session'
      using errcode = 'check_violation',
            hint = 'If a mentor was assigned, the failure is booking_blocked, not assignment_failed.';
  end if;

  -- (8) EXISTING, UNCHANGED — booking_blocked: a mentor exists, the session
  --     does not. Rule (5)'s new exception nulls video_session_id in the same
  --     statement, so a released credit satisfies this rather than bypassing it.
  if new.status = 'booking_blocked' then
    if new.buddy_id is null then
      raise exception 'session_credits: booking_blocked requires an assigned mentor'
        using errcode = 'check_violation',
              hint = 'With no mentor the failure is assignment_failed.';
    end if;
    if new.video_session_id is not null then
      raise exception 'session_credits: booking_blocked cannot hold a linked session'
        using errcode = 'check_violation';
    end if;
  end if;

  -- (9) EXISTING — a finished credit owes nothing.
  if new.status in ('completed', 'refunded')
     and (new.owner is not null or new.next_action is not null) then
    raise exception 'session_credits: a % credit cannot still be owed to anyone', new.status
      using errcode = 'check_violation',
            hint = 'Clear owner and next_action when the credit reaches a terminal state.';
  end if;

  return new;
end $function$;

comment on function public.session_credit_coherent() is
  'Coherence guard for session_credits. Rule 5 amended 27 Aug 2026: a credit '
  'whose session was cancelled or expired may be released back to '
  'booking_blocked for rebooking. Every other relink remains forbidden.';
