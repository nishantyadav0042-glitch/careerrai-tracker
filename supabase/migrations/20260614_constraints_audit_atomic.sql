-- #5: Add valid-value constraint on buddy_feedback.feedback_type
-- Existing rows all use one of these four values (see send/route.ts and initial schema).
ALTER TABLE public.buddy_feedback
  DROP CONSTRAINT IF EXISTS buddy_feedback_type_valid;
ALTER TABLE public.buddy_feedback
  ADD CONSTRAINT buddy_feedback_type_valid
  CHECK (feedback_type IN ('text', 'voice', 'buddy_note', 'student_response'));

-- #8: Admin audit log — persists every admin action for accountability
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_time  ON public.admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON public.admin_audit_log(admin_id, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can read audit log" ON public.admin_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- #6: Atomic daily log + streak upsert.
-- Called via service-role (admin client) which bypasses RLS.
-- Both the daily_reports row and the streak_data row are updated inside a single
-- Postgres transaction, so a mid-flight server crash cannot leave them out of sync.
CREATE OR REPLACE FUNCTION public.upsert_log_and_streak(
  p_student_id     UUID,
  p_report_date    DATE,
  p_study_duration INTEGER,
  p_topics_covered TEXT[],
  p_mood_emoji     TEXT,
  p_mock_taken     BOOLEAN,
  p_notes          TEXT,
  p_emotional_chips TEXT[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_id   UUID;
  v_is_new_log    BOOLEAN;
  v_streak        public.streak_data%ROWTYPE;
  v_date_str      TEXT := p_report_date::TEXT;
  v_yesterday     TEXT := (p_report_date - INTERVAL '1 day')::DATE::TEXT;
  v_last_date     TEXT;
  v_new_current   INTEGER;
  v_new_longest   INTEGER;
BEGIN
  -- 1. Upsert daily_reports
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

  -- 2. Update streak (study days only — zero-hour logs don't extend the streak)
  IF p_study_duration > 0 THEN
    SELECT * INTO v_streak FROM public.streak_data WHERE student_id = p_student_id;

    IF NOT FOUND THEN
      INSERT INTO public.streak_data (student_id, current_streak, longest_streak, last_log_date)
        VALUES (p_student_id, 1, 1, p_report_date)
        ON CONFLICT (student_id) DO NOTHING;
      SELECT * INTO v_streak FROM public.streak_data WHERE student_id = p_student_id;
    ELSE
      v_last_date := v_streak.last_log_date::TEXT;
      IF v_last_date IS DISTINCT FROM v_date_str THEN
        v_new_current := CASE WHEN v_last_date = v_yesterday
                              THEN v_streak.current_streak + 1 ELSE 1 END;
        v_new_longest := GREATEST(COALESCE(v_streak.longest_streak, 0), v_new_current);
        UPDATE public.streak_data SET
          current_streak = v_new_current,
          longest_streak = v_new_longest,
          last_log_date  = p_report_date,
          updated_at     = now()
        WHERE student_id = p_student_id
        RETURNING * INTO v_streak;
      END IF;
    END IF;
  ELSE
    -- Zero-hour log — get or lazily create streak row without changing values
    SELECT * INTO v_streak FROM public.streak_data WHERE student_id = p_student_id;
    IF NOT FOUND THEN
      INSERT INTO public.streak_data (student_id, current_streak, longest_streak)
        VALUES (p_student_id, 0, 0)
        ON CONFLICT (student_id) DO NOTHING;
      SELECT * INTO v_streak FROM public.streak_data WHERE student_id = p_student_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'current_streak',   COALESCE(v_streak.current_streak, 0),
    'longest_streak',   COALESCE(v_streak.longest_streak, 0),
    'last_log_date',    v_streak.last_log_date,
    'milestone_sent_7', COALESCE(v_streak.milestone_sent_7, FALSE),
    'milestone_sent_21',COALESCE(v_streak.milestone_sent_21, FALSE),
    'is_new_log',       v_is_new_log
  );
END;
$$;
