-- Restore shield AWARDING in the live streak writer (10 Aug 2026).
--
-- Founder: "why delete shield.. do we have other systems for shield?" The
-- honest audit answer: no. Rest-day logs cover planned absences and the 8 AM
-- reminder covers forgotten logs, but a FULLY missed day (never opened the app)
-- is only recoverable by spending a shield in /api/streak/restore — and since
-- the old compute_momentum_streak was retired, nothing has been awarding them.
-- Students would silently run out of their initial 3 and the UI's promise
-- would become a lie.
--
-- This re-adds the earning half to upsert_log_and_streak, the one live writer:
--   · every NEW logged day advances earn_run by 1 (a fresh run restarts it)
--   · at 21 the student earns +1 shield, capped at 3, and earn_run resets
-- Spending stays where it was (the manual restore route). Editing an existing
-- day's log never double-counts — only v_is_new_log advances the run.

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

  -- The streak is consecutive LOGGED days — any daily_report, study or rest.
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

  -- ── Shield earning (the restored half) ───────────────────────────────────
  -- Current holdings; a brand-new student starts with 3 (the column default).
  SELECT shields, earn_run INTO v_shields, v_earn
    FROM public.streak_data WHERE student_id = p_student_id;
  v_shields := COALESCE(v_shields, 3);
  v_earn    := COALESCE(v_earn, 0);

  IF v_is_new_log THEN
    -- A fresh run (streak recomputed to 0/1) restarts the earn clock; a
    -- continuing run advances it. Backdated fills advance it too — they extend
    -- the same run the recompute just counted.
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
