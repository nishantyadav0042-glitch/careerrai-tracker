-- Applied via Supabase MCP on 2026-07-12. Recorded here for repo parity.
--
-- Two coupon/payment bugs found during the security+perf audit:
--   1. activate_payment (the Razorpay webhook's activation RPC) did
--      `UPDATE coupons SET times_used = times_used + 1`, but coupons has no
--      `times_used` column — the counter is `used_count`. That line raises at
--      runtime whenever a coupon is burned on a PAID checkout, so the student
--      pays but activation fails. Dormant only because no coupon had been
--      redeemed yet (coupon_redemptions was empty). Fixed to `used_count`.
--   2. coupon_redemptions had no unique constraint, so the "ON CONFLICT DO
--      NOTHING" burn was not actually idempotent (a webhook retry double-counts).
--      Added a unique (coupon_id, student_id) constraint (table was empty → safe)
--      and gave ON CONFLICT a real target. The free-path burn in
--      create-order/route.ts was switched to an ignore-duplicates upsert to match.
alter table public.coupon_redemptions
  add constraint coupon_redemptions_coupon_student_uniq unique (coupon_id, student_id);

create or replace function public.activate_payment(
  p_payment_id uuid,
  p_student_id uuid,
  p_plan text,
  p_renews_at timestamp with time zone,
  p_razorpay_payment_id text,
  p_coupon_code text default null
)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v_coupon_id uuid;
begin
  update student_payments
  set status = 'paid', paid_at = now(), razorpay_payment_id = p_razorpay_payment_id
  where id = p_payment_id and status != 'paid';

  update profiles
  set subscription_status = 'active', subscription_plan = p_plan, subscription_renews_at = p_renews_at
  where id = p_student_id;

  if p_coupon_code is not null then
    select id into v_coupon_id from coupons where code = p_coupon_code;
    if v_coupon_id is not null then
      insert into coupon_redemptions (coupon_id, student_id, payment_id)
      values (v_coupon_id, p_student_id, p_payment_id)
      on conflict (coupon_id, student_id) do nothing;
      if found then
        update coupons set used_count = used_count + 1 where id = v_coupon_id;
      end if;
    end if;
  end if;
end;
$function$;
