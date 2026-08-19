-- Q5 gate — provenance follows the VALUE, not the row
--
-- LIVE PRODUCTION DEFECT, found 19 Aug. A real student completed the Q5
-- handoff and their row read:
--
--     study_duration = 3.0 , study_duration_source = 'not_collected'
--
-- Three measured hours stamped "we never collected a duration", which Q3 then
-- excluded from every average.
--
-- MECHANISM, an interaction of three of today's own gates:
--   1. the check-in gate writes hours 0    -> G13-A2 stamps not_collected
--   2. the student finishes the sheet at 3.0 hours
--      -> sourceForLoggedDuration returns NULL, because the server cannot
--         establish where a client-computed number came from
--   3. G13-A1's COALESCE preserves the OLD stamp, since NULL cannot overwrite
--
-- THE RULE. COALESCE was right about one thing and wrong about the other: a
-- caller that does not know must not destroy a stamp FOR THE SAME VALUE, but a
-- stamp describes a value, so when the value changes the stamp is stale and
-- must go with it.
--
-- WHY NOT 'self_reported' FOR POSITIVE HOURS -- the fix first proposed and then
-- withdrawn. The log sheet has had NO hours input since 9 Aug: the number is
-- creditedHours() computed on the client from the student's own ticks. The
-- student states nothing, so calling it self-reported would have replaced one
-- falsehood with another. NULL is the truthful answer, and Q3 counts it,
-- because a positive duration of unknown origin is still MEASURED.
--
-- No new vocabulary. No client-declared provenance. No historical row touched
-- -- the one contradictory row already in production is left exactly as it is,
-- for a separate data-truth decision.
--
-- ROLLBACK: re-apply 20260819b.

CREATE OR REPLACE FUNCTION public.upsert_log_and_streak(
  p_student_id uuid,
  p_report_date date,
  p_study_duration numeric,
  p_topics_covered text[],
  p_mood_emoji text,
  p_mock_taken boolean,
  p_notes text,
  p_emotional_chips text[],
  p_study_duration_source text DEFAULT NULL
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
      -- The caller decides this, having already resolved WHICH value won the
      -- merge (lib/study-duration-source.ts). The RPC must not infer it: it
      -- cannot see whether p_study_duration is the credited number or the
      -- pre-existing one the caller's Math.max kept.
      -- A stamp describes A VALUE. When the value changes, the old stamp no
      -- longer describes what is stored and must not survive; when the value
      -- is unchanged, a caller that simply does not know must not destroy it.
      --
      -- Found in production: the check-in gate writes 0 hours stamped
      -- not_collected, the student then finishes the sheet with 3.0 real hours
      -- and no stamp, and a plain COALESCE kept not_collected on a MEASURED
      -- day -- so Q3 discarded three real hours. NULL here means "provenance
      -- unknown", which is honest and which Q3 counts, because a positive
      -- duration of unknown origin is still measured.
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
      quality_focus     = 3, difficulty = 3, stress = 2,
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

REVOKE ALL ON FUNCTION public.upsert_log_and_streak(uuid, date, numeric, text[], text, boolean, text, text[], text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_log_and_streak(uuid, date, numeric, text[], text, boolean, text, text[], text) TO service_role;
