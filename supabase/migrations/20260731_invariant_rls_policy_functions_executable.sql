-- Incident #14 prevention, 31 Jul 2026. Applied to production the same night.
--
-- A security sweep revoked EXECUTE on is_admin(uuid) from `authenticated`.
-- Four RLS policies call it, so a student reading or writing their own profile
-- began failing with a raw "permission denied for function is_admin" rendered
-- into the onboarding UI. Two earlier migrations had written the exception down
-- in comments, and both were overwritten. A comment is not a guard.
--
-- This is the guard: business_invariants() now fails when ANY function
-- referenced by an RLS policy is not executable by `authenticated`. The nightly
-- integrity-check cron already reads that function, so no application code
-- changes and the check runs from tonight.
--
-- PROVEN TO FIRE before being trusted: with is_admin revoked inside a
-- transaction, the invariant reported 1 violation; the transaction was rolled
-- back and production verified intact. A check that cannot detect the bug it
-- was written for is theatre.
--
-- The new branch is SPLICED onto the current definition rather than retyped,
-- so this migration is structurally incapable of dropping one of the 32
-- invariants that already existed.
do $outer$
declare def text; new_check text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'business_invariants';

  if def is null then
    raise exception 'business_invariants() not found — refusing to guess at its body';
  end if;

  new_check := $chk$
union all
-- A function referenced by an RLS policy MUST be executable by `authenticated`.
-- Postgres evaluates every applicable policy on a statement, so a student
-- touching only their own row still invokes the admin check under their own
-- role. No EXECUTE means the whole statement aborts in the student's face.
select 'Database access', 0::smallint,
       'every function used by an RLS policy is executable by authenticated',
       count(*)::bigint, 'critical'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and exists (
    select 1 from pg_policies pol
    where pol.schemaname = 'public'
      and (coalesce(pol.qual,'') || coalesce(pol.with_check,'')) ~ ('\m' || p.proname || '\M')
  )
  and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
$chk$;

  -- Splice immediately before the body's closing dollar-quote. Anchored to the
  -- end of the definition, so it can only match the closing tag, never the
  -- opening `AS $function$`.
  def := regexp_replace(def, '\$function\$\s*$', new_check || E'\n$function$');

  execute def;
end
$outer$;
