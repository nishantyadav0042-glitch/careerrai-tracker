-- Incident #14 prevention, 31 Jul 2026. Applied to production the same night.
--
-- A security sweep revoked EXECUTE on is_admin(uuid) from `authenticated`.
-- Four RLS policies call it, so a student reading or writing their own profile
-- began failing with a raw "permission denied for function is_admin" rendered
-- into the onboarding UI. Two earlier migrations had written the exception down
-- in comments, and both were overwritten. A comment is not a guard.
--
-- The guard: business_invariants() fails when ANY function referenced by an RLS
-- policy is not executable by `authenticated`. The nightly integrity-check cron
-- already reads that function, so no application code changes.
--
-- PROVEN TO FIRE before being trusted: with is_admin revoked inside a
-- transaction, the invariant reported 1 violation; the transaction was rolled
-- back and production verified intact. A check that cannot detect the bug it
-- was written for is theatre.
--
-- Three properties this migration must have, each of which the first draft
-- lacked and a review caught:
--   1. REPLAY-SAFE. Re-applying must not splice the check in twice.
--   2. RESET-SAFE. business_invariants() is defined in no migration in this
--      repo — it exists only in production — so `supabase db reset`, CI and
--      preview branches must SKIP, not abort the whole chain.
--   3. FAIL-LOUD ON A MISSED SPLICE. A regexp_replace that matches nothing
--      would otherwise recreate the function unchanged and still report
--      success, leaving no guard and no warning.
do $outer$
declare def text; new_def text; new_check text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'business_invariants';

  -- (2) Fresh database: the function this extends does not exist yet. Skip
  -- rather than abort, so a reset or preview branch still builds.
  if def is null then
    raise notice 'business_invariants() not present — skipping the RLS-policy-EXECUTE invariant';
    return;
  end if;

  -- (1) Already spliced (production, or a branch cloned from it). Do nothing.
  if def like '%every function used by an RLS policy is executable by authenticated%' then
    raise notice 'RLS-policy-EXECUTE invariant already present — nothing to do';
    return;
  end if;

  new_check := $chk$
union all
-- A function referenced by an RLS policy MUST be executable by `authenticated`.
-- Postgres evaluates every applicable policy on a statement, so a student
-- touching only their own row still invokes the admin check under their own
-- role. No EXECUTE means the whole statement aborts in the student's face.
--
-- Scoped to `authenticated` on purpose. These policies carry no TO clause, so
-- they are TO public and anon evaluates them too — but anon EXECUTE is
-- deliberately revoked on the admin helpers, and asserting it here would raise
-- a nightly critical alert whose only apparent fix is granting anonymous
-- visitors the admin check. The anon half is a separate question, recorded in
-- ENGINEERING-MEMORY #14 rather than papered over with a check that would
-- teach us to loosen security to silence it.
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
  -- end of the definition, so it can only match the closing tag.
  new_def := regexp_replace(def, '\$function\$\s*$', new_check || E'\n$function$');

  -- (3) If the anchor did not match, regexp_replace returns the input
  -- unchanged and we would silently recreate the function with no guard.
  if new_def = def then
    raise exception 'could not splice the invariant: closing $function$ tag not found in business_invariants() definition';
  end if;

  execute new_def;
end
$outer$;
