-- ── SA-1D: atomic lead claim + auditable reassignment ───────────────────────
--
-- One shared book, explicit ownership. Two reps must never independently
-- work the same lead, and ownership must never be a client-side
-- read-then-write race. The claim is therefore ONE conditional statement:
-- an INSERT ... ON CONFLICT DO UPDATE whose WHERE clause only lets the
-- update through when the lead is unowned or already owned by the caller.
-- Postgres row-level locking on the PK makes two concurrent claims
-- serialize; exactly one sees owner IS NULL.
--
-- The function is called ONLY by server routes through service_role (the
-- route authenticates the rep and derives p_owner from their profile email
-- — never from the request body). EXECUTE is revoked from client roles.
--
-- Also formalizes the sales_activity vocabulary: the five call dispositions
-- plus 'reassigned' (the admin's intentional ownership transfer, appended
-- as history). Preflight 20 Aug 2026: sales_activity = 0 rows, so the CHECK
-- cannot invalidate existing data. The code twin of this list is
-- ACTIVITY_STATUSES in src/lib/sales-disposition.ts; a guard test reads
-- this file and fails the build if the two drift.
--
-- Reversal: drop function public.claim_lead(uuid, text);
--           alter table public.sales_activity drop constraint sales_activity_status_check;

alter table public.sales_activity
  drop constraint if exists sales_activity_status_check;
alter table public.sales_activity
  add constraint sales_activity_status_check
  check (status in ('interested', 'callback', 'converted', 'not_interested', 'no_answer', 'reassigned'));

create or replace function public.claim_lead(p_student_id uuid, p_owner text)
returns table (claimed boolean, current_owner text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_owner is null or length(trim(p_owner)) = 0 then
    raise exception 'claim_lead: p_owner must be a non-empty rep identity';
  end if;

  -- The atomic claim: one statement, conditional update, no read-then-write.
  return query
  insert into public.lead_outreach (student_id, owner, status, updated_at)
  values (p_student_id, p_owner, 'not_contacted', now())
  on conflict (student_id) do update
    set owner = excluded.owner, updated_at = now()
    where lead_outreach.owner is null or lead_outreach.owner = excluded.owner
  returning true, lead_outreach.owner;

  -- No row came back → the lead is owned by someone else. Report who.
  if not found then
    return query
    select false, lo.owner from public.lead_outreach lo where lo.student_id = p_student_id;
  end if;
end;
$$;

-- Server-only: the claim carries an owner identity the route derives from the
-- authenticated rep — a client must never call this directly.
revoke execute on function public.claim_lead(uuid, text) from public, anon, authenticated;
