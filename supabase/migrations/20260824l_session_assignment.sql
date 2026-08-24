-- ── The missing middle: credit → buddy → session ────────────────────────────
--
-- A ₹299 purchase minted a credit and then NOTHING happened. session_credits
-- carried buddy_id and video_session_id columns that no code has ever written,
-- so the money and the delivery were two disconnected islands and a human had
-- to create the session row by hand.
--
-- TWO STATE MACHINES, DELIBERATELY NOT MERGED:
--   session_credits.status  = the ENTITLEMENT  (paid → assigned → scheduled → completed)
--   video_sessions.session_status = the DELIVERY (scheduled → active → completed)
-- They answer different questions — "what did they buy?" and "did it happen?"
-- — and collapsing them would make it impossible to say "paid, nobody assigned
-- yet", which is the state a student is actually in for most of this journey.
--
-- What is enforced instead is that they can never CONTRADICT each other.

-- ── A. The assignment ──────────────────────────────────────────────────────
alter table public.session_credits
  add column if not exists video_session_id uuid references public.video_sessions(id) on delete set null;

-- Assigning is an atomic claim on a scarce human's week, so it is one guarded
-- UPDATE — the same shape as claim_lead and consume_chat_message. Two webhook
-- retries, or an admin and a cron, cannot assign two different mentors to one
-- credit.
create or replace function public.assign_session_credit(
  p_credit_id uuid,
  p_buddy_id uuid,
  p_reason text
)
returns table (assigned boolean, buddy_id uuid, already boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  update public.session_credits c
     set buddy_id = p_buddy_id,
         match_reason = p_reason,
         assigned_at = now(),
         status = 'assigned'
   where c.id = p_credit_id
     and c.buddy_id is null
     and c.status = 'paid'
  returning c.buddy_id into r;

  if found then
    return query select true, r.buddy_id, false;
  end if;

  -- Already assigned. Idempotent success when it is the SAME mentor (a retry),
  -- and an honest refusal when it is a different one — silently reassigning
  -- would move a student to a stranger without anyone noticing.
  select c.buddy_id into r from public.session_credits c where c.id = p_credit_id;
  return query select (r.buddy_id = p_buddy_id), r.buddy_id, true;
end $$;

revoke all on function public.assign_session_credit(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.assign_session_credit(uuid, uuid, text) to service_role;

-- ── F. Cross-state invariants ──────────────────────────────────────────────
--
-- The credit may not claim more than the delivery can support. Each rule below
-- exists because its absence produces a specific lie:
--   assigned with no buddy       → "a mentor is on this" when none is
--   scheduled with no session    → a booking that does not exist
--   completed with no session    → revenue recognised for nothing delivered
--   completed over a live session→ "delivered" while the call is still running
create or replace function public.session_credit_coherent()
returns trigger
language plpgsql
as $$
declare
  s public.video_sessions%rowtype;
begin
  if new.status in ('assigned', 'scheduled', 'completed') and new.buddy_id is null then
    raise exception 'session_credits: status % requires an assigned buddy', new.status
      using errcode = 'check_violation';
  end if;

  if new.status in ('scheduled', 'completed') and new.video_session_id is null then
    raise exception 'session_credits: status % requires a linked session', new.status
      using errcode = 'check_violation';
  end if;

  if new.video_session_id is not null then
    select * into s from public.video_sessions where id = new.video_session_id;
    if not found then
      raise exception 'session_credits: linked session does not exist'
        using errcode = 'check_violation';
    end if;
    -- The credit and the session must be about the same two people.
    if s.student_id <> new.student_id then
      raise exception 'session_credits: linked session belongs to a different student'
        using errcode = 'check_violation';
    end if;
    if new.buddy_id is not null and s.buddy_id <> new.buddy_id then
      raise exception 'session_credits: linked session has a different mentor'
        using errcode = 'check_violation';
    end if;
    -- A credit cannot be completed until the SESSION is. Delivery is decided by
    -- video_sessions and its started_at/ended_at, never by the entitlement.
    if new.status = 'completed' and s.session_status <> 'completed' then
      raise exception 'session_credits: cannot complete while the session is %', s.session_status
        using errcode = 'check_violation',
              hint = 'The session is the delivery authority. Complete it first.';
    end if;
  end if;

  -- One credit, one session, forever. Re-pointing it would silently move a
  -- payment onto a different delivery.
  if tg_op = 'UPDATE'
     and old.video_session_id is not null
     and new.video_session_id is distinct from old.video_session_id then
    raise exception 'session_credits: this credit is already linked to a session'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists session_credit_coherent_guard on public.session_credits;
create trigger session_credit_coherent_guard
  before insert or update on public.session_credits
  for each row execute function public.session_credit_coherent();

-- One live session per credit, and one credit per session.
create unique index if not exists session_credits_one_session
  on public.session_credits (video_session_id) where video_session_id is not null;

create index if not exists session_credits_pending_assignment
  on public.session_credits (created_at) where status = 'paid' and buddy_id is null;

comment on function public.assign_session_credit(uuid, uuid, text) is
  'Atomically assigns a mentor to a paid credit. One guarded UPDATE, so retries and concurrent callers cannot produce two mentors. Idempotent for the same mentor, refuses a different one.';
