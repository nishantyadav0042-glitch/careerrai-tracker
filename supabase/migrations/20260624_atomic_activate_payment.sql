-- Atomically marks a payment paid, activates the student's subscription,
-- and burns the coupon (if any) in a single transaction.
-- This prevents the torn-write where payment is marked paid but coupon burn
-- fails on a Razorpay webhook retry (the retry guard skips the whole block).
CREATE OR REPLACE FUNCTION activate_payment(
  p_payment_id           uuid,
  p_student_id           uuid,
  p_plan                 text,
  p_renews_at            timestamptz,
  p_razorpay_payment_id  text,
  p_coupon_code          text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_coupon_id uuid;
BEGIN
  -- 1. Mark payment paid (idempotent: only runs when status != 'paid')
  UPDATE student_payments
  SET
    status                = 'paid',
    paid_at               = now(),
    razorpay_payment_id   = p_razorpay_payment_id
  WHERE id = p_payment_id
    AND status != 'paid';

  -- 2. Activate subscription
  UPDATE profiles
  SET
    subscription_status    = 'active',
    subscription_plan      = p_plan,
    subscription_renews_at = p_renews_at
  WHERE id = p_student_id;

  -- 3. Burn coupon if one was used (ON CONFLICT DO NOTHING makes this idempotent)
  IF p_coupon_code IS NOT NULL THEN
    SELECT id INTO v_coupon_id
    FROM coupons
    WHERE code = p_coupon_code;

    IF v_coupon_id IS NOT NULL THEN
      INSERT INTO coupon_redemptions (coupon_id, student_id, payment_id)
      VALUES (v_coupon_id, p_student_id, p_payment_id)
      ON CONFLICT DO NOTHING;

      -- Increment use counter only when we actually inserted a new redemption row
      IF FOUND THEN
        UPDATE coupons SET times_used = times_used + 1 WHERE id = v_coupon_id;
      END IF;
    END IF;
  END IF;
END;
$$;
