-- Postgres grants EXECUTE to PUBLIC by default, and PUBLIC includes
-- anon/authenticated — revoking from named roles alone left these callable.
revoke execute on function public.claim_otp_send_slot(text, text) from public;
revoke execute on function public.increment_coupon_use(uuid) from public;
revoke execute on function public.guard_exam_ready() from public;
revoke execute on function public.social_proof() from public;
revoke execute on function public.is_admin(uuid) from public;
grant execute on function public.claim_otp_send_slot(text, text) to service_role;
grant execute on function public.increment_coupon_use(uuid) to service_role;
grant execute on function public.social_proof() to service_role;
grant execute on function public.is_admin(uuid) to service_role;
-- Trigger functions run as part of the DML; guard_exam_ready needs no grant.
alter function public.coerce_null_auth_token_columns() set search_path = public, pg_temp;
