-- ============================================================
-- CareerRai — Phone-OTP Auth (allowlist) + Three-Flow Payments
-- Run in Supabase SQL Editor (paste, run). Idempotent.
-- ============================================================

-- ── PART A: STUDENT ALLOWLIST (admin-gated phone gatekeeping) ──
CREATE TABLE IF NOT EXISTS public.student_allowlist (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone             TEXT NOT NULL UNIQUE,              -- E.164, e.g. +9198XXXXXXXX
  full_name         TEXT NOT NULL,
  added_by          UUID REFERENCES public.profiles(id),
  assigned_buddy_id UUID REFERENCES public.profiles(id),
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'paused')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- OTP send tracking (rate-limiting: 3 / 30min, 30s cooldown). Service-role only.
CREATE TABLE IF NOT EXISTS public.otp_send_events (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone     TEXT NOT NULL,
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_send_events_phone_time
  ON public.otp_send_events (phone, sent_at DESC);

-- ── PART B/C: STUDENT SUBSCRIPTION STATE (on profiles) ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'free_beta'
    CHECK (subscription_status IN ('free_beta', 'active', 'expired', 'refund_requested')),
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT,
  ADD COLUMN IF NOT EXISTS subscription_renews_at TIMESTAMPTZ,
  -- PART D: buddy payout amount, admin-set, NULL until founder sets it
  ADD COLUMN IF NOT EXISTS agreed_monthly_payout INTEGER;

-- ── PART B: STUDENT PAYMENTS (incoming, Razorpay) ──
CREATE TABLE IF NOT EXISTS public.student_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount              INTEGER NOT NULL,                 -- in paise
  plan                TEXT NOT NULL,
  razorpay_order_id   TEXT,
  razorpay_payment_id TEXT,
  status              TEXT NOT NULL DEFAULT 'created'
                        CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_student_payments_student ON public.student_payments (student_id);
CREATE INDEX IF NOT EXISTS idx_student_payments_order   ON public.student_payments (razorpay_order_id);

-- ── PART D: BUDDY PAYOUTS (outgoing, manual-pay / app-tracks-only) ──
CREATE TABLE IF NOT EXISTS public.buddy_payouts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buddy_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period               TEXT NOT NULL,                   -- 'YYYY-MM'
  agreed_amount        INTEGER NOT NULL,                -- in rupees (founder-readable)
  active_student_count INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'paid')),
  paid_date            DATE,
  payment_ref          TEXT,                            -- founder-pasted UPI/txn ref
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (buddy_id, period)
);
CREATE INDEX IF NOT EXISTS idx_buddy_payouts_buddy ON public.buddy_payouts (buddy_id);

-- ── ROW LEVEL SECURITY ──
-- Admin/founder operations run through the service-role client (bypasses RLS),
-- so we only need self-access policies for any anon-key reads. No admin policy =
-- no recursion risk against profiles.

ALTER TABLE public.student_allowlist ENABLE ROW LEVEL SECURITY;
-- (no policies → service-role only; never readable by students/buddies)

ALTER TABLE public.otp_send_events ENABLE ROW LEVEL SECURITY;
-- (no policies → service-role only)

ALTER TABLE public.student_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "student sees own payments" ON public.student_payments;
CREATE POLICY "student sees own payments" ON public.student_payments
  FOR SELECT USING (student_id = auth.uid());

ALTER TABLE public.buddy_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "buddy sees own payouts" ON public.buddy_payouts;
CREATE POLICY "buddy sees own payouts" ON public.buddy_payouts
  FOR SELECT USING (buddy_id = auth.uid());
