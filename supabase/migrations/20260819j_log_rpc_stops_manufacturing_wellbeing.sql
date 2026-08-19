-- The log RPC stops overwriting wellbeing it was never told
--
-- upsert_log_and_streak takes NO wellbeing parameters, and neither caller
-- (log-daily, complete-task) sends any. Its UPDATE branch nevertheless assigned
-- six columns hardcoded constants on every write:
--
--     quality_focus = 3, difficulty = 3, stress = 2,
--     sleep_quality = 3, overall_energy = 4, nutrition_exercise = FALSE
--
-- So each time a student re-saved a day's log, six columns of their own
-- reported wellbeing were replaced by numbers nobody entered. Measured before
-- writing this: 34 of 348 rows still held a real value in one of those columns,
-- and every one would have been destroyed the next time that day was touched.
--
-- Present since 20260614_constraints_audit_atomic.sql. Long-standing, not a
-- regression from the provenance work -- that work carried it forward
-- faithfully, which is exactly how a defect survives a rewrite.
--
-- This is the rule the provenance CASE already encodes one column to its left:
-- a writer that does not know a value must not destroy it. The stamp argument
-- and the wellbeing argument are the same argument.
--
-- NO HISTORICAL DATA IS REWRITTEN. This changes what future writes do; it does
-- not touch a single existing row. The 34 rows are preserved by being left
-- alone, which is the point.
--
-- DELIBERATELY NARROW -- the INSERT branch is UNCHANGED and still writes
-- constants for a new row. Those columns are NOT NULL, so "unknown wellbeing"
-- has no representation, and inventing one (nullable columns, a sentinel, a
-- provenance column of its own) is a product decision, not a bug fix. Fixing
-- the destructive half now and leaving the representational half for a ruling
-- is the smaller, safer change.
--
-- Everything else in this function is byte-identical to the definition read
-- back from production immediately before writing it.

CREATE OR REPLACE FUNCTION public.upsert_log_and_streak(
  p_student_id uuid, p_report_date date, p_study_duration numeric,
  p_topics_covered text[], p_mood_emoji text, p_mock_taken boolean,
  p_notes text, p_emotional_chips text[], p_study_duration_source text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id   UUID;
  v_is_new_log    BOOLEAN;
  v_streak        public.streak_data%ROWTYPE;
  v_cur           INTEGER := 0;
  v_longest       INTEGER := 0;
  v_last          DATE;
  v_shields       INTEGER;
  v_earn          INTEGER;
BEGIN
  SELECT id INTO v_existing_id
    FROM public.daily_reports
    WHERE student_id = p_student_id AND report_date = p_report_date;

  v_is_new_log := v_existing_id IS NULL;

  IF v_is_new_log THEN
    INSERT INTO public.daily_reports (
      student_id, report_date, study_duration, study_duration_source, topics_covered,
      mood_emoji, mock_taken, notes, emotional_chips,
      quality_focus, difficulty, confidence, stress,
      sleep_quality, overall_energy, nutrition_exercise
    ) VALUES (
      p_student_id, p_report_date, p_study_duration, p_study_duration_source, p_topics_covered,
      p_mood_emoji, p_mock_taken, p_notes, p_emotional_chips,
      3, 3, 4, 2, 3, 4, FALSE
    );
  ELSE
    UPDATE public.daily_reports SET
      study_duration    = p_study_duration,
      -- A stamp describes A VALUE. When the value changes the old stamp no
      -- longer describes what is stored and must not survive; when the value is
      -- unchanged, a caller that simply does not know must not destroy it.
      study_duration_source = CASE
        WHEN p_study_duration IS DISTINCT FROM study_duration
          THEN p_study_duration_source
        ELSE COALESCE(p_study_duration_source, study_duration_source)
      END,
      topics_covered    = p_topics_covered,
      mood_emoji        = p_mood_emoji,
      mock_taken        = p_mock_taken,
      notes             = p_notes,
      emotional_chips   = p_emotional_chips,
      -- The six wellbeing assignments that stood here are GONE. The RPC has no
      -- wellbeing input; whatever the student reported stays as they left it.
      updated_at        = now()
    WHERE id = v_existing_id;
  END IF;

  WITH logged AS (
    SELECT DISTINCT report_date AS d
    FROM public.daily_reports
    WHERE student_id = p_student_id
  ),
  islands AS (
    SELECT d, (d - (ROW_NUMBER() OVER (ORDER BY d))::int) AS grp FROM logged
  ),
  runs AS (
    SELECT COUNT(*)::int AS len, MAX(d) AS run_end FROM islands GROUP BY grp
  )
  SELECT
    COALESCE((SELECT len FROM runs ORDER BY run_end DESC LIMIT 1), 0),
    COALESCE((SELECT MAX(len) FROM runs), 0),
    (SELECT MAX(d) FROM (SELECT d FROM logged) z)
  INTO v_cur, v_longest, v_last;

  SELECT shields, earn_run INTO v_shields, v_earn
    FROM public.streak_data WHERE student_id = p_student_id;
  v_shields := COALESCE(v_shields, 3);
  v_earn    := COALESCE(v_earn, 0);

  IF v_is_new_log THEN
    IF v_cur <= 1 THEN
      v_earn := 1;
    ELSE
      v_earn := v_earn + 1;
    END IF;
    IF v_earn >= 21 THEN
      IF v_shields < 3 THEN v_shields := v_shields + 1; END IF;
      v_earn := 0;
    END IF;
  END IF;

  IF v_last IS NOT NULL THEN
    INSERT INTO public.streak_data (student_id, current_streak, longest_streak, last_log_date, shields, earn_run)
      VALUES (p_student_id, v_cur, GREATEST(v_longest, v_cur), v_last, v_shields, v_earn)
    ON CONFLICT (student_id) DO UPDATE SET
      current_streak = EXCLUDED.current_streak,
      longest_streak = GREATEST(public.streak_data.longest_streak, EXCLUDED.longest_streak),
      last_log_date  = EXCLUDED.last_log_date,
      shields        = EXCLUDED.shields,
      earn_run       = EXCLUDED.earn_run,
      updated_at     = now();
  ELSE
    INSERT INTO public.streak_data (student_id, current_streak, longest_streak)
      VALUES (p_student_id, 0, 0) ON CONFLICT (student_id) DO NOTHING;
  END IF;

  SELECT * INTO v_streak FROM public.streak_data WHERE student_id = p_student_id;

  RETURN jsonb_build_object(
    'current_streak',    COALESCE(v_streak.current_streak, 0),
    'longest_streak',    COALESCE(v_streak.longest_streak, 0),
    'last_log_date',     v_streak.last_log_date,
    'shields',           COALESCE(v_streak.shields, 3),
    'milestone_sent_7',  COALESCE(v_streak.milestone_sent_7, FALSE),
    'milestone_sent_21', COALESCE(v_streak.milestone_sent_21, FALSE),
    'is_new_log',        v_is_new_log
  );
END;
$function$;
