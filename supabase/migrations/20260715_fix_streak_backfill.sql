-- Fix streak miscount on backdated / out-of-order logs (15 Jul 2026).
--
-- Bug: upsert_log_and_streak computed the streak INCREMENTALLY, assuming logs
-- always arrive in chronological order. It only did +1 when last_log_date was
-- exactly report_date - 1, and it overwrote last_log_date with whatever date
-- came in — even moving it BACKWARD. The log form allows backdating to
-- yesterday/day-before, so a student who fills three days at once, out of order
-- (e.g. Jul 13 entered before Jul 12, then Jul 14), had their streak reset to 1
-- instead of building to 3. Vedprakash logged Jul 12/13/14 (all study > 0) and
-- showed a streak of 1.
--
-- Fix: recompute the streak from the FULL log history every time via
-- gaps-and-islands — the current streak is the length of the consecutive run
-- ending on the most recent logged day. Order of insertion no longer matters,
-- and the function is self-healing.

CREATE OR REPLACE FUNCTION public.upsert_log_and_streak(
  p_student_id uuid, p_report_date date, p_study_duration integer,
  p_topics_covered text[], p_mood_emoji text, p_mock_taken boolean,
  p_notes text, p_emotional_chips text[]
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id   UUID;
  v_is_new_log    BOOLEAN;
  v_streak        public.streak_data%ROWTYPE;
  v_cur           INTEGER := 0;
  v_longest       INTEGER := 0;
  v_last          DATE;
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

  -- Recompute the streak from the whole history (gaps-and-islands). Robust to
  -- backdated / out-of-order logs; insertion order is irrelevant.
  WITH logged AS (
    SELECT DISTINCT report_date AS d
    FROM public.daily_reports
    WHERE student_id = p_student_id AND study_duration > 0
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

  IF v_last IS NOT NULL THEN
    INSERT INTO public.streak_data (student_id, current_streak, longest_streak, last_log_date)
      VALUES (p_student_id, v_cur, GREATEST(v_longest, v_cur), v_last)
    ON CONFLICT (student_id) DO UPDATE SET
      current_streak = EXCLUDED.current_streak,
      longest_streak = GREATEST(public.streak_data.longest_streak, EXCLUDED.longest_streak),
      last_log_date  = EXCLUDED.last_log_date,
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
    'milestone_sent_7',  COALESCE(v_streak.milestone_sent_7, FALSE),
    'milestone_sent_21', COALESCE(v_streak.milestone_sent_21, FALSE),
    'is_new_log',        v_is_new_log
  );
END;
$function$;

-- One-time backfill: recompute every existing streak from real log history,
-- correcting the accounts the old logic miscounted (e.g. Vedprakash 1 -> 3).
WITH d AS (
  SELECT DISTINCT student_id, report_date AS dt
  FROM public.daily_reports WHERE study_duration > 0
),
islands AS (
  SELECT student_id, dt, (dt - (ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY dt))::int) AS grp
  FROM d
),
runs AS (
  SELECT student_id, COUNT(*)::int AS len, MAX(dt) AS run_end
  FROM islands GROUP BY student_id, grp
),
agg AS (
  SELECT student_id,
    (SELECT len FROM runs r2 WHERE r2.student_id = r.student_id ORDER BY run_end DESC LIMIT 1) AS cur,
    MAX(len) AS longest,
    MAX(run_end) AS last_dt
  FROM runs r GROUP BY student_id
)
UPDATE public.streak_data sd SET
  current_streak = a.cur,
  longest_streak = GREATEST(COALESCE(sd.longest_streak, 0), a.longest),
  last_log_date  = a.last_dt,
  updated_at     = now()
FROM agg a
WHERE sd.student_id = a.student_id
  AND (sd.current_streak IS DISTINCT FROM a.cur OR sd.last_log_date IS DISTINCT FROM a.last_dt);
