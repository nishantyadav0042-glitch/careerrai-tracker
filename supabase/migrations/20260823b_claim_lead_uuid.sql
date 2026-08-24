-- ── claim_lead, re-keyed onto profiles.id ───────────────────────────────────
--
-- The atomic claim was and remains the best-built primitive in the sales
-- system: ONE `insert … on conflict do update … where` statement, with the
-- ownership guard inside the statement's WHERE clause, so two concurrent reps
-- can never both win. That design is unchanged and deliberately not redesigned.
--
-- What changes is only the KEY. `p_owner text` held an email, which meant a
-- rep's ownership silently detached if her email changed, and two staff without
-- an email collapsed onto the same token. Ownership is now a uuid.
--
-- The legacy `owner` TEXT column is still written, as a denormalised mirror, so
-- nothing that still reads it breaks mid-rollout. It is NOT the authority: the
-- guard compares owner_id. The mirror is dropped in a later migration once
-- every reader is verified in production.
--
-- Safe because lead_outreach holds 0 rows: there is no existing claim to
-- reinterpret.

drop function if exists public.claim_lead(uuid, text);

create or replace function public.claim_lead(p_student_id uuid, p_owner_id uuid)
returns table(claimed boolean, current_owner uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_owner_id is null then
    raise exception 'claim_lead: p_owner_id must be a real profiles.id';
  end if;

  -- The claimant must be staff. A student id passed here would otherwise
  -- become a lead owner, which is how identity systems rot.
  if not exists (select 1 from public.profiles p where p.id = p_owner_id and p.role in ('sales', 'admin')) then
    raise exception 'claim_lead: p_owner_id is not a sales or admin account';
  end if;

  return query
  insert into public.lead_outreach (student_id, owner_id, owner, status, updated_at)
  values (
    p_student_id,
    p_owner_id,
    -- mirror, for readers not yet migrated
    (select p.email from public.profiles p where p.id = p_owner_id),
    'not_contacted',
    now()
  )
  on conflict (student_id) do update
    set owner_id = excluded.owner_id,
        owner    = excluded.owner,
        updated_at = now()
    where lead_outreach.owner_id is null or lead_outreach.owner_id = excluded.owner_id
  returning true, lead_outreach.owner_id;

  -- Not claimed: somebody else owns it. Report WHO, so the caller can decide
  -- what to tell the rep — the API deliberately does not echo this id back to
  -- a rep, but an admin surface needs it.
  if not found then
    return query
    select false, lo.owner_id from public.lead_outreach lo where lo.student_id = p_student_id;
  end if;
end;
$function$;

comment on function public.claim_lead(uuid, uuid) is
  'Atomic lead claim keyed on profiles.id. One conditional statement — never a read-then-write. Returns claimed=false plus the current owner when another rep already holds the lead.';
