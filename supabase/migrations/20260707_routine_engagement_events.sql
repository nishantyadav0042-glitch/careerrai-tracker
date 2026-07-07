-- Founder ask: track "% of students who press Start on Today's Routine
-- within 60 seconds of opening the app" — reading a routine is not the same
-- as committing to it, and this is the single metric that tells you whether
-- the dashboard actually motivates action instead of just informing.
--
-- Two events per session: 'viewed' when the routine card finishes loading,
-- 'started' when the student taps their first task. seconds_to_start on the
-- 'started' row is the number this whole thing exists to produce.
CREATE TABLE IF NOT EXISTS public.routine_engagement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN ('viewed', 'started')),
  seconds_to_start numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routine_engagement_events_student_created
  ON public.routine_engagement_events (student_id, created_at DESC);

-- No client-facing RLS policies: written only via the service-role admin
-- client from /api/routine/engagement, same pattern as the other logging
-- endpoints in this app.
