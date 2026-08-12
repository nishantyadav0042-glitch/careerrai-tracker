-- P0, 12 Aug 2026: students could not save their daily log.
--
-- Symptom: "Internal server error" on Save log. Postgres 22P02, "invalid input
-- syntax for type integer: 4.6". A student retried ~25 times in two minutes.
--
-- Root cause: daily_reports.study_duration is NUMERIC and has always accepted
-- decimals, but this RPC declared p_study_duration INTEGER — the function
-- contradicted its own table. Marking any task "Half" produces fractional
-- hours (4.6, 2.8), and every such log was rejected at the door.
--
-- The parameter TYPE is the bug, not the value: rounding in the route would
-- have silently lied about how long a student actually studied. Postgres
-- cannot ALTER a parameter type, so the old signature is dropped and
-- recreated as NUMERIC in one transaction; the body is byte-identical.
--
-- Grants are re-applied deliberately. DROP takes the ACL with it and a fresh
-- CREATE grants EXECUTE to PUBLIC by default. The live ACL was
-- {postgres=X, service_role=X} with PUBLIC revoked by
-- 20260712_revoke_public_execute_definer_fns — restored exactly here.
-- Leaving it open would expose a SECURITY DEFINER function to anon;
-- forgetting the grant would break logging a second way (Incident #14).
--
-- Verified in production: RPC called with 4.6 stores 4.6, one function
-- version present (no ambiguous overload), ACL identical to before.

DROP FUNCTION IF EXISTS public.upsert_log_and_streak(uuid, date, integer, text[], text, boolean, text, text[]);

CREATE OR REPLACE FUNCTION public.upsert_log_and_streak(
  p_student_id uuid,
  p_report_date date,
  p_study_duration numeric,
  p_topics_covered text[],
  p_mood_emoji text,
  p_mock_taken boolean,
  p_notes text,
  p_emotional_chips text[]
)
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
      student_id, report_date, study_duration, topics_covered,
      mood_emoji, mock_taken, notes, emotional_chips,
      quality_focus, difficulty, confidence, stress,
      sleep_quality, overall_energy, nutrition_exercise
    ) VALUES (
      p_student_id, p_report_date, p_study_duration, p_topics_covered,
      p_mood_emoji, p_mock_taken, p_notes, p_emotional_chips,
      3, 3, 4, 2, 3, 4, FALSE
    );
  ELSE
    UPDATE public.daily_reports SET
      study_duration    = p_study_duration,
      topics_covered    = p_topics_covered,
      mood_emoji        = p_mood_emoji,
      mock_taken        = p_mock_taken,
      notes             = p_notes,
      emotional_chips   = p_emotional_chips,
      quality_focus     = 3, difficulty = 3, confidence = 4, stress = 2,
      sleep_quality     = 3, overall_energy = 4, nutrition_exercise = FALSE,
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

REVOKE ALL ON FUNCTION public.upsert_log_and_streak(uuid, date, numeric, text[], text, boolean, text, text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_log_and_streak(uuid, date, numeric, text[], text, boolean, text, text[]) TO service_role;
