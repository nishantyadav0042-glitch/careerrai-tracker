-- ── The revoke that actually worked, 22 Sep 2026 ──────────────────────────
--
-- 20260922c revoked EXECUTE on two SECURITY DEFINER trigger functions FROM
-- anon, reported success, and changed nothing. The ACL said why:
--
--   enforce_sales_seat_cap: =X/postgres | authenticated=X/postgres | service_role=X/postgres
--                           ^^^^^^^^^^^ empty grantee == PUBLIC
--
-- `anon` held EXECUTE through PUBLIC, never directly, so revoking it from
-- anon was a no-op that looked like a fix. The advisor kept flagging it, and
-- re-reading the ACL rather than trusting the "success" is what found it.
--
-- Revoking from PUBLIC is precise: `authenticated` and `service_role` hold
-- EXPLICIT grants and keep them, so RLS policies and the server-side admin
-- client are untouched. Verified after applying — anon false, authenticated
-- true, service_role true on all three functions.
--
-- is_admin(uuid) is deliberately NOT touched: four RLS policies call
-- is_admin(auth.uid()) and an RLS policy executes as the CALLING role.
-- Revoking it from `authenticated` is Incident #14 ("permission denied for
-- function is_admin"). The advisor flags it; the advisor cannot see RLS.

REVOKE EXECUTE ON FUNCTION public.sync_student_crm() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_sales_seat_cap() FROM PUBLIC;
