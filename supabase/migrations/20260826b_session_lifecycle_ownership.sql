-- ── PHASE 2B: give a stuck credit a STATE, an OWNER and a NEXT ACTION ────────
--
-- THE INCIDENT THIS ANSWERS. Dhruv paid ₹299 on 24 Aug at 18:34 IST. The
-- credit was minted 14 seconds later as 'paid'. Then: no mentor, no session,
-- no reminder, for 24 hours. Nothing was broken. Every row was valid. The
-- ledger balanced. The student simply fell out of the lifecycle and the schema
-- had no way to say so, because 'paid' means BOTH "just arrived, fine" and
-- "arrived a day ago and nobody ever came". One state, two utterly different
-- realities, and no column anywhere that answers the only two questions that
-- matter operationally: WHO owns this, and WHAT has to happen next.
--
-- The probes run before this migration proved the schema was already stronger
-- than assumed: of 13 adversarial writes, 9 were already refused (5 by
-- session_credit_coherent_guard, 2 by unique indexes, 1 by status_check, 1 by
-- the guard catching the FK's SET NULL cascade). So this migration is roughly
-- 40% of what the Phase 1 architecture implied. It adds only what the probes
-- proved MISSING:
--
--   1. two failure states the lifecycle cannot currently express
--   2. five operational columns (ownership, next action, failure trail)
--   3. one FK hardening, as a pure backstop
--
-- WHAT IT DELIBERATELY DOES NOT DO:
--   · it does not replace session_credit_coherent(). Every existing rule below
--     is reproduced VERBATIM from production's pg_get_functiondef output and
--     kept as the authority. The new rules are appended, never substituted.
--   · it does not add a second trigger for the video_session relationship.
--     The FK becomes RESTRICT purely as a database backstop; the guard remains
--     the one place that reasons about that link.
--   · it does not touch coaching_sessions, profiles.buddy_id, premium
--     entitlement, or video_sessions.session_status. video_sessions remains
--     the delivery authority; session_credits remains the entitlement
--     authority. Two state machines, still deliberately separate.
--   · it does not make next_action an enum. `owner` is a closed set — there
--     are only four kinds of party who can be on the hook. `next_action` is
--     operational prose written by whoever is looking at the problem, and
--     freezing it into an enum now would mean inventing the vocabulary of an
--     operations team that does not exist yet.

-- ── 1. WHO OWNS IT ──────────────────────────────────────────────────────────
--
-- A closed set, because "unowned" is the failure this whole phase exists to
-- eliminate and a free-text owner would let it back in through a typo.
--   ops     — a human on the operations side must act
--   founder — escalated; needs a decision only the founder can make
--   system  — an automatic retry owns it; no human should be paged yet
--   mentor  — the assigned mentor is the blocker (no availability, no OAuth)

do $$
begin
  if not exists (select 1 from pg_type where typname = 'session_credit_owner') then
    create type public.session_credit_owner as enum ('ops', 'founder', 'system', 'mentor');
  end if;
end $$;

alter table public.session_credits
  add column if not exists owner           public.session_credit_owner,
  add column if not exists next_action     text,
  add column if not exists failure_reason  text,
  add column if not exists failure_at      timestamptz,
  add column if not exists last_attempt_at timestamptz;

comment on column public.session_credits.owner is
  'Who is on the hook right now. NULL means nothing is owed — see next_action.';
comment on column public.session_credits.next_action is
  'Operational text, deliberately not an enum: what exactly must happen next.';
comment on column public.session_credits.failure_reason is
  'Why the lifecycle stalled. Set with failure_at when entering a failure state.';
comment on column public.session_credits.last_attempt_at is
  'Telemetry for the retry loop. Intentionally unconstrained — a retry that has
   not run yet is a legitimate state, and a clock rule here would only ever
   fire on clock skew.';

-- ── 2. THE TWO STATES THE LIFECYCLE COULD NOT EXPRESS ───────────────────────
--
--   assignment_failed — we took the money and could not attach a mentor.
--   booking_blocked   — a mentor is attached and the session could not be made.
--
-- These are not cosmetic. Dhruv sat in 'paid' for 24 hours; had these existed,
-- he would have been in 'assignment_failed' with owner='ops' inside 15 minutes
-- and visible to anyone who looked. The detector that WRITES these states is
-- Phase 3's job — this migration only makes them expressible, because a state
-- machine that cannot name a failure will never report one.

alter table public.session_credits drop constraint if exists session_credits_status_check;
alter table public.session_credits
  add constraint session_credits_status_check
  check (status = any (array[
    'paid'::text, 'assigned'::text, 'scheduled'::text, 'completed'::text, 'refunded'::text,
    'assignment_failed'::text, 'booking_blocked'::text
  ]));

-- ── 3. SHAPE RULES, AS CONSTRAINTS RATHER THAN TRIGGER CODE ─────────────────
--
-- These are row-local: they need no lookup and no knowledge of status, so they
-- belong in a CHECK, where the database enforces them without any code path
-- being able to disable them. The state-dependent rules go in the guard below.
--
-- The pairing rule is the load-bearing one. An owner with no action is a name
-- with nothing attached to it; an action with no owner is precisely Dhruv —
-- work that everyone could see and nobody held.

alter table public.session_credits drop constraint if exists session_credits_ownership_paired;
alter table public.session_credits
  add constraint session_credits_ownership_paired
  check (
    (owner is null) = (next_action is null)
    and (next_action is null or length(btrim(next_action)) > 0)
    and (failure_reason is null or length(btrim(failure_reason)) > 0)
  );

-- ── 4. THE FOREIGN KEY, HARDENED TO A BACKSTOP ──────────────────────────────
--
-- It was ON DELETE SET NULL. Probe 13 showed that deleting a linked session
-- WAS in fact refused — but by the GUARD, not the FK: SET NULL silently
-- unlinked the credit, and only then did rule (2) or rule (5) fire on the
-- resulting row. Right outcome, wrong mechanism.
--
-- Measured, not assumed. With SET NULL restored and the guard DISABLED, probe
-- 32 deleted a session out from under a scheduled credit and was ACCEPTED —
-- the credit was orphaned, silently. With RESTRICT and the guard still
-- disabled, probe 33 was refused by the foreign key alone. That is the entire
-- value of this change, stated exactly: it does not close a hole the guard
-- leaves open in normal operation (there isn't one), it removes the guard's
-- monopoly on preventing an orphan. A trigger can be disabled — this repo
-- disabled it four times in the last hour to prove these probes were not
-- vacuous. A foreign key cannot be disabled by accident.
--
-- No second trigger is added for this relationship. The guard keeps sole
-- authority over what the link MEANS; the FK only guarantees it still exists.

alter table public.session_credits drop constraint if exists session_credits_video_session_id_fkey;
alter table public.session_credits
  add constraint session_credits_video_session_id_fkey
  foreign key (video_session_id) references public.video_sessions(id) on delete restrict;

-- ── 5. THE COHERENCE GUARD, EXTENDED ────────────────────────────────────────
--
-- Rules 1–5 below are the existing function, unchanged, character for
-- character. Rules 6–9 are new. If you are reviewing this diff, the test that
-- matters is: does every probe that passed before this migration still pass?

create or replace function public.session_credit_coherent()
returns trigger
language plpgsql
as $function$
declare
  s public.video_sessions%rowtype;
begin
  -- (1) EXISTING — a mentor is required from 'assigned' onward.
  if new.status in ('assigned', 'scheduled', 'completed') and new.buddy_id is null then
    raise exception 'session_credits: status % requires an assigned buddy', new.status
      using errcode = 'check_violation';
  end if;

  -- (2) EXISTING — a session is required from 'scheduled' onward.
  if new.status in ('scheduled', 'completed') and new.video_session_id is null then
    raise exception 'session_credits: status % requires a linked session', new.status
      using errcode = 'check_violation';
  end if;

  -- (3) EXISTING — the linked session must exist, belong to the same student,
  --     and be held by the same mentor.
  if new.video_session_id is not null then
    select * into s from public.video_sessions where id = new.video_session_id;
    if not found then
      raise exception 'session_credits: linked session does not exist'
        using errcode = 'check_violation';
    end if;
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

  -- (5) EXISTING — a credit is linked to a session once, and never relinked.
  if tg_op = 'UPDATE'
     and old.video_session_id is not null
     and new.video_session_id is distinct from old.video_session_id then
    raise exception 'session_credits: this credit is already linked to a session'
      using errcode = 'check_violation';
  end if;

  -- ── NEW FROM HERE ─────────────────────────────────────────────────────────

  -- (6) NEW — a failure must be OWNED. This is the whole point of the phase.
  --     A credit is allowed to be broken. It is not allowed to be broken and
  --     unattributed, because that is indistinguishable from working.
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

  -- (7) NEW — assignment_failed means we never got a mentor. It therefore
  --     cannot carry one, and cannot carry a session either: if a session
  --     exists, assignment did not fail.
  if new.status = 'assignment_failed'
     and (new.buddy_id is not null or new.video_session_id is not null) then
    raise exception 'session_credits: assignment_failed cannot hold a mentor or a session'
      using errcode = 'check_violation',
            hint = 'If a mentor was assigned, the failure is booking_blocked, not assignment_failed.';
  end if;

  -- (8) NEW — booking_blocked is the mirror: a mentor exists, the session does
  --     not. A credit that once reached 'scheduled' cannot come back here,
  --     because rule (5) forbids unlinking. That is deliberate and its limit
  --     is stated rather than hidden: a session that is created and then
  --     CANCELLED is a delivery failure, and video_sessions owns it. Re-booking
  --     a cancelled session is Phase 3's problem, not a state to fake here.
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

  -- (9) NEW — a finished credit owes nothing. Leaving an owner on a completed
  --     or refunded credit is how a recovery queue silently fills with work
  --     that was already done, until nobody trusts the queue.
  if new.status in ('completed', 'refunded')
     and (new.owner is not null or new.next_action is not null) then
    raise exception 'session_credits: a % credit cannot still be owed to anyone', new.status
      using errcode = 'check_violation',
            hint = 'Clear owner and next_action when the credit reaches a terminal state.';
  end if;

  return new;
end $function$;

-- ── 6. BACKFILL — TWO ROWS, BOTH NAMED ──────────────────────────────────────
--
-- Written as a migration and not a console UPDATE, because a manual flip is
-- exactly how Dhruv got is_premium=true in the first place: a side effect
-- nobody could later account for. These two statements are the entire
-- production data change in this phase, and both are idempotent.
--
-- Row 1 — the refunded credit (student fea4a910…, 20 Aug). Terminal, settled,
-- nothing owed. Rule (9) already forbids an owner here; this states it.
--
-- Row 2 — Dhruv Vakadia (student b8da2a36…, credit 36730468…). Paid 24 Aug,
-- mentor Shreya Bendigeri now attached, session still not created. Status
-- stays 'assigned' — it is factually correct and this migration does not
-- rewrite history. What changes is that the row now SAYS who owes what:
-- ops owes him a scheduled session. It is the first credit in this database's
-- life to carry that.

update public.session_credits
   set owner = null, next_action = null
 where status = 'refunded'
   and (owner is not null or next_action is not null);

update public.session_credits
   set owner = 'ops'::public.session_credit_owner,
       next_action = 'schedule'
 where status = 'assigned'
   and video_session_id is null
   and owner is null;

-- ── 7. THE OPERATIONAL READ PATH ────────────────────────────────────────────
--
-- Phase 0 found two partial indexes on this table built for an orphan query
-- that had no reader. This one gets a reader in the same phase it is created,
-- or it does not get created. It is the index behind "what is owed right now",
-- which is the only question the recovery surface asks.

create index if not exists session_credits_owed_idx
  on public.session_credits (owner, failure_at)
  where owner is not null;
