-- Pre-launch hardening from the security advisor sweep (26 Jul). See the
-- applied migration of the same name; every revoked RPC was verified
-- server-side-only (service role) by grep before revoking.
alter view public.v_student_timeline set (security_invoker = true);
revoke execute on function public.increment_coupon_use(uuid) from anon, authenticated;
revoke execute on function public.guard_exam_ready() from anon, authenticated;
revoke execute on function public.social_proof() from anon, authenticated;
revoke execute on function public.is_admin(uuid) from anon, authenticated;
revoke execute on function public.claim_otp_send_slot(text, text) from anon, authenticated;
