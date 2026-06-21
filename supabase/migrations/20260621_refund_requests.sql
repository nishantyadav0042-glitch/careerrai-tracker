-- Refund requests: students can claim the 20-day refund guarantee from their profile.
-- Admin reviews requests here; subscription_status is set to 'refund_requested' on submit.

CREATE TABLE IF NOT EXISTS public.refund_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  days_logged     INTEGER     NOT NULL,  -- daily_reports count at time of request
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes     TEXT,
  resolved_at     TIMESTAMPTZ,
  UNIQUE (student_id)  -- one request per student
);

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

-- Students can read their own request
DROP POLICY IF EXISTS "student reads own refund request" ON public.refund_requests;
CREATE POLICY "student reads own refund request" ON public.refund_requests
  FOR SELECT USING (auth.uid() = student_id);

-- Only service role (admin client) can insert/update
