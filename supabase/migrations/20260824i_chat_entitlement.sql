-- ── The ₹299 chat boundary, enforced by the database ────────────────────────
--
-- THE PRODUCT RULE: ₹299 buys ONE session and THREE messages. It must never
-- buy the continuous chat that ₹999 / ₹2,499 / ₹2,999 buy.
--
-- Three defects found in recon, all fixed here and in the send route:
--
--   A. A ₹299 purchase granted ZERO messages. The 3-message entitlement
--      already existed (MENTOR_FREE_MESSAGES, mentor_grants) but only the
--      admin Mentor Doors route ever issued one.
--
--   B. THE LEAK. The cap lived inside `if (!pair)` in /api/chat/send, and
--      resolvePair asks exactly one question — does this student hold a
--      profiles.buddy_id? No plan, premium or entitlement check of any kind.
--      So connecting a ₹299 buyer to their mentor in the natural way handed
--      them the ₹2,999 product. Production already showed the shape: one
--      student holding a buddy_id with no premium.
--
--   C. THE RACE. remaining was computed as count(chat_messages) then compared
--      in the route, then a separate insert. Two concurrent sends both read
--      2, both saw "one left", both wrote. Message #4 was reachable from two
--      browser tabs.
--
-- REUSED, NOT REBUILT: mentor_grants already carries `messages_used` — a
-- counter column that nothing has ever read or written. The fix is to start
-- using it, atomically, rather than to invent a second entitlement store.

-- ── 0. Schema parity, again ────────────────────────────────────────────────
-- session_credits has a PRIMARY KEY in production and NONE in test, so the
-- foreign key below applied cleanly to production and failed on test. This is
-- the second such divergence found today (the first was the session overlap
-- exclusion constraint). Declared here so the repo can rebuild it; idempotent
-- against production, where it already exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.session_credits'::regclass and contype = 'p'
  ) then
    alter table public.session_credits add primary key (id);
  end if;
end $$;

-- ── 1. A grant can now come from a purchase ────────────────────────────────
-- 'history' and 'intent' are the two free doors. A paid session is a third
-- origin and must be distinguishable: the founder needs to tell "earned a
-- door" from "paid ₹299" when reading why anyone is talking to a mentor.
alter table public.mentor_grants drop constraint if exists mentor_grants_door_check;
alter table public.mentor_grants
  add constraint mentor_grants_door_check
  check (door in ('history', 'intent', 'session'));

-- The allowance is stored per grant rather than read from a constant, so a
-- future product decision ("₹299 now includes 5 messages") is data, not a
-- deploy — and so an existing student's entitlement cannot be silently
-- changed underneath them by editing a constant.
alter table public.mentor_grants
  add column if not exists messages_allowance smallint not null default 3;

alter table public.mentor_grants drop constraint if exists mentor_grants_allowance_sane;
alter table public.mentor_grants
  add constraint mentor_grants_allowance_sane
  check (messages_allowance between 0 and 50);

-- The counter is a fact about consumption: it only ever goes up, and never
-- past the allowance. Both halves matter — without the upper bound the RPC
-- below is the only thing standing between a bug and unlimited chat.
alter table public.mentor_grants drop constraint if exists mentor_grants_used_within_allowance;
alter table public.mentor_grants
  add constraint mentor_grants_used_within_allowance
  check (messages_used >= 0 and messages_used <= messages_allowance);

-- Which session credit paid for this grant, when one did. Lets the founder
-- join ₹299 → messages → session without inventing an attribution table.
alter table public.mentor_grants
  add column if not exists session_credit_id uuid references public.session_credits(id) on delete set null;

create or replace function public.mentor_grants_used_never_decreases()
returns trigger language plpgsql as $$
begin
  if new.messages_used < old.messages_used then
    raise exception 'mentor_grants: messages_used cannot decrease (% -> %)', old.messages_used, new.messages_used
      using errcode = 'check_violation',
            hint = 'A consumed message is a fact. Raise messages_allowance instead of resetting the counter.';
  end if;
  return new;
end $$;

drop trigger if exists mentor_grants_used_monotonic on public.mentor_grants;
create trigger mentor_grants_used_monotonic
  before update of messages_used on public.mentor_grants
  for each row execute function public.mentor_grants_used_never_decreases();

-- ── 2. The atomic consume ──────────────────────────────────────────────────
--
-- ONE guarded UPDATE. Postgres takes a row lock, so two concurrent callers
-- serialise on it: the second re-evaluates `messages_used < messages_allowance`
-- against the FIRST one's committed value and matches zero rows.
--
-- This is the same shape as claim_lead, and for the same reason: an invariant
-- the application intends is not an invariant. Counting rows and then deciding
-- can always be beaten by a second tab.
create or replace function public.consume_chat_message(
  p_student_id uuid,
  p_buddy_id uuid
)
returns table (allowed boolean, used smallint, allowance smallint)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  update public.mentor_grants g
     set messages_used = g.messages_used + 1,
         updated_at = now()
   where g.student_id = p_student_id
     and g.activated_at is not null
     and g.buddy_id = p_buddy_id
     and g.messages_used < g.messages_allowance
  returning g.messages_used, g.messages_allowance into r;

  if found then
    return query select true, r.messages_used, r.messages_allowance;
  end if;

  -- Nothing consumed. Report the CURRENT state so the caller can tell
  -- "exhausted" (a real entitlement, spent) from "no entitlement at all",
  -- which are different sentences to show a student.
  select g.messages_used, g.messages_allowance into r
    from public.mentor_grants g
   where g.student_id = p_student_id;

  return query select false, coalesce(r.messages_used, 0::smallint), coalesce(r.messages_allowance, 0::smallint);
end $$;

revoke all on function public.consume_chat_message(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_chat_message(uuid, uuid) to service_role;

comment on function public.consume_chat_message(uuid, uuid) is
  'Atomically spends one limited chat message. A single guarded UPDATE, so concurrent callers serialise on the row lock and message #4 is unreachable from two tabs. Added 24 Aug 2026 with the 299 entitlement correction.';

-- ── 3. Backfill the counter from history ───────────────────────────────────
-- messages_used has been 0 on every row while the route counted chat_messages
-- instead. Adopting the column without this would hand every existing grant
-- holder a fresh three messages.
update public.mentor_grants g
   set messages_used = least(
         g.messages_allowance,
         (select count(*) from public.chat_messages m
           where m.student_id = g.student_id
             and m.buddy_id = g.buddy_id
             and m.sender_id = g.student_id)
       )
 where g.buddy_id is not null
   and g.messages_used = 0;
