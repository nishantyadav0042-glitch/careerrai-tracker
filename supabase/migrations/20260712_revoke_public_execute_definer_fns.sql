-- Applied via Supabase MCP on 2026-07-12. Recorded here for repo parity.
--
-- CRITICAL: an earlier hardening pass revoked EXECUTE from anon/authenticated on
-- these SECURITY DEFINER functions but never revoked the default PUBLIC grant.
-- anon inherits PUBLIC, so the functions stayed callable via PostgREST RPC —
-- most importantly upsert_log_and_streak, which let a holder of the public anon
-- key forge ANY student's daily log + streak. All in-app callers use the
-- service-role admin client (service_role keeps EXECUTE), so this is invisible.

revoke execute on function public.upsert_log_and_streak(uuid, date, integer, text[], text, boolean, text, text[]) from public, anon, authenticated;
revoke execute on function public.increment_buddy_cta(uuid) from public, anon, authenticated;
revoke execute on function public.increment_coupon_use(uuid) from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- is_admin(uuid) is referenced by 4 RLS policies, so authenticated must keep its
-- explicit EXECUTE; only strip the PUBLIC default and anon.
revoke execute on function public.is_admin(uuid) from public, anon;
