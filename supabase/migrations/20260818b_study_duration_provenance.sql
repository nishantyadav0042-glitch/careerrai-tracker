-- 0C.3G / J6-A, 18 Aug 2026: make study_duration's provenance legible.
--
-- daily_reports.study_duration is NUMERIC(4,1) NOT NULL DEFAULT 0, so it cannot
-- say "we never asked". Four different meanings currently collapse onto the
-- same number, and 62 real rows across 38 students carry
-- day_outcome IN ('studied','partial') with study_duration = 0 because the
-- check-in gate deliberately posts hours: 0 ("a check-in is not a study claim").
--
-- J6-A (docs/0C-3G-DAILY-EVIDENCE-CONTRACT.md): a duration may be presented as
-- self-reported or credited ONLY where provenance is actually established;
-- where it has already been erased it stays explicitly unknown, and no
-- historical value is ever rewritten. This migration adds the representation.
-- It does NOT split the column, backfill, or touch any consumer.
--
-- HISTORICAL ROWS ARE NOT TOUCHED. The column is nullable with no default, so
-- on PG 11+ (live: 17.6) ADD COLUMN is metadata-only — no table rewrite, and
-- all 293 existing rows keep NULL, which is what an un-stamped row honestly is.
-- NULL is the "unknown" state deliberately: it needs no backfill and maps onto
-- the Fact Registry's first-class UNKNOWN rather than inventing a fifth label.
--
-- The RPC gains p_study_duration_source so the value and its provenance are
-- written in ONE statement. The alternative (a second UPDATE after the RPC)
-- would be best-effort and non-transactional, so a failure would leave a
-- duration the server COULD classify sitting at NULL provenance.
--
-- Postgres cannot add a parameter in place, and leaving the 8-arg signature
-- would make every call ambiguous, so the old signature is dropped and
-- recreated in one transaction. Verified live before writing this:
--   · exactly ONE overload existed: (uuid,date,numeric,text[],text,boolean,text,text[])
--   · ACL was {postgres=X/postgres, service_role=X/postgres} — PUBLIC revoked
-- DROP takes the ACL with it and a fresh CREATE grants EXECUTE to PUBLIC by
-- default, so the grants below restore exactly that state. Forgetting them
-- exposes a SECURITY DEFINER function to anon (Incident #14 was the mirror of
-- this: forgetting the grant broke logging instead).
--
-- The body is byte-identical to 20260812 apart from the two lines that persist
-- the new column.

ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS study_duration_source TEXT;

-- The vocabulary is closed in the DATABASE, not only in TypeScript: this column
-- is student-writable under the existing `Student manages own reports` policy
-- (ALL on student_id = auth.uid()), exactly as study_duration already is.
-- The CHECK cannot make provenance tamper-EVIDENT, but it does stop a value
-- outside the vocabulary ever being stored. Tightening that policy is a
-- separate, deliberately out-of-scope decision.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_reports_study_duration_source_check'
  ) THEN
    ALTER TABLE public.daily_reports
      ADD CONSTRAINT daily_reports_study_duration_source_check
      CHECK (
        study_duration_source IS NULL
        OR study_duration_source IN ('credited', 'self_reported', 'not_collected', 'declared_zero')
      );
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.upsert_log_and_streak(uuid, date, numeric, text[], text, boolean, text, text[]);

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
      study_duration_source = p_study_duration_source,
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

REVOKE ALL ON FUNCTION public.upsert_log_and_streak(uuid, date, numeric, text[], text, boolean, text, text[], text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_log_and_streak(uuid, date, numeric, text[], text, boolean, text, text[], text) TO service_role;
