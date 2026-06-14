-- ============================================================
-- CareerRai — Compassionate Retention + Payments-that-align
-- Miss-recovery analytics, paused-not-cancelled, founder
-- scholarships, journey-length plans, stripped coupons.
-- Idempotent. Apply via Supabase migration.
-- ============================================================

-- ── PART A: PAUSED, NOT CANCELLED ──
-- Expiry flips a student to 'paused' (data fully preserved) instead of a hard
-- 'expired'. Widen the status check to include it. ('expired' kept for back-compat.)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_subscription_status_check
  CHECK (subscription_status IN ('free_beta', 'active', 'expired', 'paused', 'refund_requested'));

-- ── PART B: MISS-RECOVERY ANALYTICS (the #1 retention event) ──
-- One row each time a lapsed student chooses to come back and restart.
CREATE TABLE IF NOT EXISTS public.recovery_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  missed_days     INTEGER NOT NULL DEFAULT 0,
  previous_streak INTEGER NOT NULL DEFAULT 0,
  recovered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recovery_events_student ON public.recovery_events (student_id, recovered_at DESC);
ALTER TABLE public.recovery_events ENABLE ROW LEVEL SECURITY;
-- service-role only (written server-side; never read by anon key)

-- ── PART C: FOUNDER SCHOLARSHIPS (mission-fit access grants) ──
-- Founder-discretionary. Attached to the student's account — no codes to hunt.
-- Either a percent discount OR an explicit final price (paise); exactly one.
CREATE TABLE IF NOT EXISTS public.scholarships (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  discount_percent INTEGER CHECK (discount_percent BETWEEN 1 AND 100),
  final_price_paise INTEGER CHECK (final_price_paise >= 0),
  reason           TEXT,
  granted_by       UUID REFERENCES public.profiles(id),
  granted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'revoked', 'expired')),
  CONSTRAINT scholarship_one_kind CHECK (
    (discount_percent IS NOT NULL AND final_price_paise IS NULL) OR
    (discount_percent IS NULL AND final_price_paise IS NOT NULL)
  )
);
-- At most one ACTIVE scholarship per student.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_scholarship_per_student
  ON public.scholarships (student_id) WHERE status = 'active';
ALTER TABLE public.scholarships ENABLE ROW LEVEL SECURITY;
-- service-role only: admin manages; the student's adjusted price is surfaced
-- server-side, never the reason field via anon key.

-- ── PART D: STRIPPED COUPONS (code, discount, expiry, limit — nothing more) ──
CREATE TABLE IF NOT EXISTS public.coupons (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT NOT NULL UNIQUE,
  discount_type  TEXT NOT NULL CHECK (discount_type IN ('percent', 'flat')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0), -- percent 1-100, or flat paise
  expires_at     TIMESTAMPTZ,
  max_uses       INTEGER,                                     -- NULL = unlimited
  used_count     INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'paused', 'expired')),
  created_by     UUID REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
-- service-role only: validated + applied server-side in create-order.

-- One redemption per student per coupon (per-student limit = 1).
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id   UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payment_id  UUID REFERENCES public.student_payments(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coupon_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_student ON public.coupon_redemptions (student_id);
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
-- service-role only.

-- ── PART E: RECORD WHAT WAS CHARGED + WHY (audit on each payment) ──
ALTER TABLE public.student_payments
  ADD COLUMN IF NOT EXISTS original_amount INTEGER,         -- list price before any discount
  ADD COLUMN IF NOT EXISTS discount_source TEXT,            -- 'scholarship' | 'coupon' | NULL
  ADD COLUMN IF NOT EXISTS coupon_code TEXT;                -- the code used, if any
