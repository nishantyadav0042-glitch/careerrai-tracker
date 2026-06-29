-- Freemium pivot — Phase 1 schema.
-- Self-signup free accounts (is_premium=false) → ₹999 upgrade flips is_premium=true.
-- The app is NOT paywalled today; this adds the flag the new paywall + buddy-taste
-- UI gate on, plus the buddy queue and the engagement/sales-ready tracking.
--
-- Safe to run more than once (IF NOT EXISTS / idempotent backfill).
-- Demo account (is_demo=true) is never touched by this migration.

-- ── profiles: the premium flag + funnel metadata ──────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_premium     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS premium_since  TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_source  TEXT;  -- 'self_serve' | 'allowlist'

CREATE INDEX IF NOT EXISTS idx_profiles_is_premium ON public.profiles(is_premium) WHERE is_premium = TRUE;

-- Backfill: anyone currently on an active subscription is premium, so the new
-- paywall never locks out an existing payer. subscription_status was added by a
-- later migration; guard the backfill so it no-ops if the column is absent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'subscription_status'
  ) THEN
    UPDATE public.profiles
       SET is_premium = TRUE,
           premium_since = COALESCE(premium_since, created_at)
     WHERE role = 'student'
       AND is_premium = FALSE
       AND subscription_status = 'active';
  END IF;
END $$;

-- ── buddy_assignment_queue: a paid student waits here until a buddy is assigned ─
CREATE TABLE IF NOT EXISTS public.buddy_assignment_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'assigned', 'cancelled')),
  assigned_buddy_id UUID REFERENCES public.profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_at       TIMESTAMPTZ
);
-- One open queue row per student (a re-subscribe after assignment can insert a new one).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_buddy_queue_pending
  ON public.buddy_assignment_queue(student_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_buddy_queue_status ON public.buddy_assignment_queue(status, created_at);

ALTER TABLE public.buddy_assignment_queue ENABLE ROW LEVEL SECURITY;
-- Service-role only (no policies) — admin/webhook code uses the service-role client.

-- ── student_engagement: one row per student, drives the sales-ready trigger (§D)─
CREATE TABLE IF NOT EXISTS public.student_engagement (
  student_id           UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  signed_up_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_log_at         TIMESTAMPTZ,
  tour_completed       BOOLEAN NOT NULL DEFAULT FALSE,
  mock_opened          BOOLEAN NOT NULL DEFAULT FALSE,
  sample_debrief_viewed BOOLEAN NOT NULL DEFAULT FALSE,
  buddy_cta_clicks     INTEGER NOT NULL DEFAULT 0,   -- ★ hottest buying signal
  sales_ready          BOOLEAN NOT NULL DEFAULT FALSE,
  sales_ready_at       TIMESTAMPTZ,
  sales_called_at      TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_engagement_sales_ready
  ON public.student_engagement(sales_ready, buddy_cta_clicks DESC) WHERE sales_ready = TRUE;

ALTER TABLE public.student_engagement ENABLE ROW LEVEL SECURITY;
-- Service-role only (engagement is written by API routes via the service-role client).

-- Backfill an engagement row for every existing student so funnel queries are total.
INSERT INTO public.student_engagement (student_id, signed_up_at)
SELECT id, created_at FROM public.profiles WHERE role = 'student'
ON CONFLICT (student_id) DO NOTHING;

-- ── increment_buddy_cta: atomic +1 on the hottest buying signal ────────────────
CREATE OR REPLACE FUNCTION public.increment_buddy_cta(p_student_id UUID)
RETURNS VOID AS $$
  INSERT INTO public.student_engagement (student_id, buddy_cta_clicks, updated_at)
  VALUES (p_student_id, 1, NOW())
  ON CONFLICT (student_id)
  DO UPDATE SET buddy_cta_clicks = public.student_engagement.buddy_cta_clicks + 1,
                updated_at = NOW();
$$ LANGUAGE sql SECURITY DEFINER;

-- ── handle_new_user: new self-signups default to free, no buddy ────────────────
-- is_premium already defaults FALSE at the column level, so the existing trigger
-- needs no change for the flag. This is here only to document intent and stay
-- forward-safe if the trigger is ever edited: a brand-new auth user = free student.
-- (No functional change to the INSERT; defaults handle is_premium/buddy_id.)
