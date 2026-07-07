-- Extends routine_engagement_events with the 'completed' event — starting
-- isn't finishing, and time between the two is itself a quality signal
-- (someone who starts and finishes in 35 minutes is in a different state
-- than someone who starts and finishes 5 hours later). Full funnel is now
-- viewed -> started -> completed, queryable per student per day.
ALTER TABLE public.routine_engagement_events
  DROP CONSTRAINT IF EXISTS routine_engagement_events_event_check;
ALTER TABLE public.routine_engagement_events
  ADD CONSTRAINT routine_engagement_events_event_check
  CHECK (event IN ('viewed', 'started', 'completed'));

ALTER TABLE public.routine_engagement_events
  ADD COLUMN IF NOT EXISTS seconds_since_started numeric;
