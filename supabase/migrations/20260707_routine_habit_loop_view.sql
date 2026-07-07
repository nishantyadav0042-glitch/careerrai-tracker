-- "Completed in 20 minutes" is an action, not an outcome. The outcome is
-- whether the student came back and did it again — this view stitches
-- together consecutive completed -> started pairs from
-- routine_engagement_events (already being collected, no new
-- instrumentation) so that question is a single SELECT away instead of a
-- fresh query every time someone asks it.
--
-- returned_within_window uses 40h, not a strict 24h: a routine completed
-- at 11pm and resumed the next morning at 8am is 33h apart by the clock but
-- is obviously "the next day" for a habit that runs once daily — a strict
-- 24h cutoff would misclassify exactly the pattern this is meant to catch.
CREATE OR REPLACE VIEW public.routine_habit_loop AS
WITH completions AS (
  SELECT id, student_id, created_at AS completed_at
  FROM public.routine_engagement_events
  WHERE event = 'completed'
),
next_start AS (
  SELECT
    c.id,
    c.student_id,
    c.completed_at,
    (
      SELECT MIN(s.created_at)
      FROM public.routine_engagement_events s
      WHERE s.student_id = c.student_id
        AND s.event = 'started'
        AND s.created_at > c.completed_at
    ) AS next_started_at
  FROM completions c
)
SELECT
  student_id,
  completed_at,
  next_started_at,
  next_started_at IS NOT NULL
    AND next_started_at <= completed_at + interval '40 hours' AS returned_and_started_again
FROM next_start;
