-- ── Incident #41, part two: the guard has to be in the WRITE ────────────────
--
-- 28 Aug 2026. #41 fixed the application: mayActivatePayment() refuses to
-- re-activate a refunded payment, enforced inside activatePaidOrder above
-- every side effect. The release audit then reproduced the same failure
-- ANYWAY, against the real function on the test project:
--
--   1 captured + activated   payment=paid,     subscription=active
--   2 refunded               payment=refunded, subscription=free
--   3 activate_payment()     payment=PAID,     subscription=ACTIVE   ← defect
--                            refunded_at still set → a row claiming both
--
-- TWO ROOT CAUSES, both in this function, neither reachable by an application
-- guard:
--
--   · `where ... and status != 'paid'` is the exact defect #41 fixed in
--     TypeScript, still written in SQL. 'refunded' is not 'paid', so the row
--     moves. The fix travelled to the callers and never reached the callee.
--
--   · the `profiles` update had NO condition at all. Even where the payment
--     row correctly refused to move, premium was handed back regardless. That
--     is the half that actually costs money.
--
-- AND WHY AN APPLICATION GUARD COULD NEVER HAVE BEEN ENOUGH. activatePaidOrder
-- reads the status in one statement and writes in another. A refund landing in
-- that window — and the window is wide: an attribution read and an insert sit
-- inside it — passes a guard evaluated against a stale row. Check-then-act is
-- not a guard; it is a race with good intentions.
--
-- SELECT ... FOR UPDATE is what closes it. It takes the row lock that
-- settleRefund's own UPDATE contends for, so the two serialise:
--   refund first  → we observe 'refunded' and return, changing nothing
--   activate first → refund's `and status = 'paid'` matches and settles
-- Either order leaves exactly one truthful row. No ordering leaves both.
--
-- Everything below the guard — the paid update, the profiles update and the
-- whole coupon block — is UNCHANGED from the deployed function. This migration
-- adds a precondition; it does not redesign activation.

create or replace function public.activate_payment(
  p_payment_id uuid,
  p_student_id uuid,
  p_plan text,
  p_renews_at timestamptz,
  p_razorpay_payment_id text,
  p_coupon_code text default null::text
)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v_coupon_id uuid;
  v_claimed uuid;
  v_status text;
begin
  -- THE LOCK, and the reason this is not a plain SELECT: it serialises this
  -- activation against a concurrent refund of the same payment.
  select status into v_status
    from student_payments
   where id = p_payment_id
     for update;

  -- Not our payment. Nothing to activate, nothing to grant.
  if v_status is null then
    return;
  end if;

  -- A REFUND IS FINAL. Returning silently is deliberate: a redelivered
  -- payment.captured after a refund is an ordinary event, not an error, and
  -- raising here would 500 the webhook and make Razorpay redeliver forever.
  if v_status = 'refunded' then
    return;
  end if;

  update student_payments
  set status = 'paid', paid_at = now(), razorpay_payment_id = p_razorpay_payment_id
  where id = p_payment_id and status != 'paid';

  update profiles
  set subscription_status = 'active', subscription_plan = p_plan, subscription_renews_at = p_renews_at
  where id = p_student_id;

  if p_coupon_code is not null then
    select id into v_coupon_id from coupons where code = p_coupon_code;
    if v_coupon_id is not null then
      -- Atomically claim a redemption slot: only proceeds if the cap isn't
      -- already hit (max_uses null = unlimited, never blocks).
      update coupons
      set used_count = used_count + 1
      where id = v_coupon_id
        and (max_uses is null or used_count < max_uses)
      returning id into v_claimed;

      if v_claimed is not null then
        insert into coupon_redemptions (coupon_id, student_id, payment_id)
        values (v_coupon_id, p_student_id, p_payment_id)
        on conflict (coupon_id, student_id) do nothing;
        -- If this student already redeemed it (webhook retry), the counter
        -- bump above must be undone — the conflict means no NEW redemption.
        if not found then
          update coupons set used_count = used_count - 1 where id = v_coupon_id;
        end if;
      end if;
    end if;
  end if;
end;
$function$;

comment on function public.activate_payment(uuid, uuid, text, timestamptz, text, text) is
  'Activates a captured payment. Takes a row lock and REFUSES a refunded payment before touching profiles — the application-level guard (mayActivatePayment) cannot close this race because it reads and writes in separate statements. Incident #41.';
