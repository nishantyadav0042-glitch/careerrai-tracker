-- Streak counts LOGGED days, rest days included (10 Aug 2026).
--
-- Founder: "We count the daily log. At least Vedprakash logged — he appeared and
-- told us he had a rest day. Our goal is to maximize daily logs for maximum days
-- — we're not trying to break streaks, we want to positively push and motivate."
--
-- Until now the streak counted only days with study_duration > 0, so a student
-- who showed up every day but rested one lost the streak. That punishes the
-- exact behaviour we most want: showing up. The daily log now carries an explicit
-- "rest day (personal commitments)" option, and a logged rest day is still a day
-- the student appeared. So the streak is redefined as consecutive LOGGED days —
-- any daily_report, study or rest. Studying is still tracked (hours, coverage,
-- finish date) separately; the streak is the showing-up gamification, and it
-- rewards the appearance. Shields/restore now cover only true gaps — days with
-- NO log at all.
--
-- Same gaps-and-islands recompute as before, so it stays robust to backdated /
-- out-of-order logs. The ONLY change from 20260715 is the `logged` CTE dropping
-- the `study_duration > 0` filter.

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

  -- The streak is consecutive LOGGED days — any daily_report, study or rest.
  -- Showing up is the streak; studying is tracked elsewhere.
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

-- Backfill: recompute every streak on the new "logged days" basis.
WITH d AS (
  SELECT DISTINCT student_id, report_date AS dt
  FROM public.daily_reports
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
  SELECT
    student_id,
    (ARRAY_AGG(len ORDER BY run_end DESC))[1] AS cur,
    MAX(len) AS longest,
    MAX(run_end) AS last_d
  FROM runs GROUP BY student_id
)
UPDATE public.streak_data s
SET current_streak = a.cur,
    longest_streak = GREATEST(s.longest_streak, a.longest, a.cur),
    last_log_date  = a.last_d,
    updated_at     = now()
FROM agg a
WHERE a.student_id = s.student_id;
