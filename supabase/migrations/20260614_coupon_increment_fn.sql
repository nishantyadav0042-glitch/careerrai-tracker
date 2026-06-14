-- Atomic coupon usage increment, called after a confirmed redemption.
-- SECURITY DEFINER with a pinned search_path; not callable by anon/authenticated
-- (only the service-role server routes invoke it).
CREATE OR REPLACE FUNCTION public.increment_coupon_use(p_coupon_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.coupons SET used_count = used_count + 1 WHERE id = p_coupon_id;
$$;
REVOKE EXECUTE ON FUNCTION public.increment_coupon_use(UUID) FROM anon, authenticated;
