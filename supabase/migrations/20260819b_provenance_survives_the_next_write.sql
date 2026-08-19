-- G13-A1 + G13-A2 — provenance that survives the next write
--
-- G13 proved study_duration_source could not function as provenance at all:
--
--   1. this RPC's UPDATE branch assigned p_study_duration_source
--      UNCONDITIONALLY, so any stamp was erased by the student's next log edit
--      or by the next routine tick;
--   2. neither live caller supplied the 9th argument, so it always defaulted
--      NULL and every write cleared the column;
--   3. 342 of 342 production rows were NULL -- including 32 written AFTER the
--      column shipped on 18 Aug.
--
-- Two changes, both to the UPDATE branch. Nothing else about this function,
-- its signature, its transaction or its streak arithmetic moves.
--
-- (a) COALESCE(p_study_duration_source, study_duration_source)
--     A caller that does not know the provenance no longer destroys what is
--     already recorded. COALESCE alone is NOT the fix and is unsafe on its
--     own -- this function overwrites study_duration unconditionally, so
--     preserving an old 'credited' stamp against a NEW value would assert
--     that value was priced from coverage when it was not. That is the false
--     provenance J6-A forbids. The stamp must describe the value that
--     SURVIVED, which is why both callers ship in the same change and compute
--     it (sourceForMergedDuration / sourceForLoggedDuration).
--
-- (b) the UPDATE branch stops assigning confidence.
--     log-daily captures the student's real confidence in a follow-up UPDATE
--     immediately after this call. This function then reset it to 4 on every
--     later write, so a routine tick silently erased an answer the student had
--     already given: 312 of 342 production rows carry the manufactured 4. The
--     INSERT default is deliberately untouched -- it manufactures nothing that
--     existed beforehand. The other six hardcoded wellbeing columns are the
--     same defect with no capture path to destroy, and stay parked.
--
-- NO BACKFILL. Existing NULLs stay NULL and mean "provenance unknown" --
-- never 'not_collected', which would manufacture provenance for 342 rows.

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
      study_duration_source = COALESCE(p_study_duration_source, study_duration_source),
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
