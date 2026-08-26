-- Dependency for 20260826f. Several production RLS policies call is_admin(),
-- which did not exist on careerrai-test — the first attempt at the RLS replay
-- failed with "function is_admin(uuid) does not exist" and rolled back whole.
--
-- Replayed verbatim from production, INCLUDING its grants. The revoke matters:
-- is_admin is SECURITY DEFINER and reads auth.users, so an anon-executable
-- version would be a privilege-escalation primitive sitting inside a policy.
-- Production grants it to authenticated and service_role only, and so does this.
--
-- Consequence worth knowing, observed in the probes: because anon cannot
-- execute is_admin, an anonymous read of `profiles` ERRORS ("permission denied
-- for function is_admin") rather than returning an empty set. That is more
-- restrictive, not less, and it matches production exactly.
--
-- Applied to careerrai-test on 26 Aug 2026. NOT applied to production.

CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM auth.users WHERE id = user_id AND raw_user_meta_data->>'role' = 'admin'
  );
END;
$function$;

revoke all on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated, service_role;
