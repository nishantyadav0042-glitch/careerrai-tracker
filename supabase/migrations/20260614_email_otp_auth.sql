-- ============================================================
-- CareerRai — Email OTP Auth (switch from phone/SMS)
-- Idempotent. Run in Supabase SQL Editor.
-- ============================================================

-- student_allowlist: add email column, make phone optional
ALTER TABLE public.student_allowlist
  ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;

ALTER TABLE public.student_allowlist
  ALTER COLUMN phone DROP NOT NULL;

-- otp_send_events: add email tracking, make phone optional
ALTER TABLE public.otp_send_events
  ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE public.otp_send_events
  ALTER COLUMN phone DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_otp_send_events_email_time
  ON public.otp_send_events (email, sent_at DESC);
