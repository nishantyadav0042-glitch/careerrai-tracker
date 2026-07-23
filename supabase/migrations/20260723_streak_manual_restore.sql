-- Snapchat-style manual streak restore (founder, 23 Jul).
-- Shields stop auto-covering missed days. A missed day now BREAKS the streak;
-- the student taps "Restore" to spend one shield and bridge the gap themselves.
-- restored_dates records the missed days a shield was spent to cover, so the
-- streak engine keeps them bridged on the next log.
--
-- Grandfathered: a cutover date keeps the exact old auto-shield math for every
-- gap before it, so all existing streaks are preserved (validated identical for
-- all 42 live streaks before the swap); manual restore applies only to misses
-- on/after the cutover.

ALTER TABLE public.streak_data ADD COLUMN IF NOT EXISTS restored_dates date[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.compute_momentum_streak(p_student_id uuid)
 RETURNS TABLE(o_streak integer, o_shields integer, o_earn_run integer, o_longest integer, o_last_log date)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_prev date := NULL;
  v_streak int := 0;
  v_shields int := 3;
  v_earn int := 0;
  v_longest int := 0;
  v_miss int; v_used int; v_decay int;
  v_cut date := DATE '2026-07-24';   -- new behaviour applies to gaps on/after this
  v_restored date[];
  v_uncovered int;
BEGIN
  SELECT restored_dates INTO v_restored FROM public.streak_data WHERE student_id = p_student_id;
  v_restored := COALESCE(v_restored, '{}');

  FOR r IN
    SELECT DISTINCT report_date AS d
    FROM public.daily_reports
    WHERE student_id = p_student_id
    ORDER BY 1
  LOOP
    IF v_prev IS NULL THEN
      v_streak := 1; v_earn := 1;
    ELSE
      v_miss := (r.d - v_prev) - 1;
      IF v_miss <= 0 THEN
        v_streak := v_streak + 1;
        v_earn := v_earn + 1;
      ELSIF r.d < v_cut THEN
        -- grandfathered auto-shield math
        v_used := LEAST(v_shields, v_miss);
        v_shields := v_shields - v_used;
        v_decay := v_miss - v_used;
        v_streak := GREATEST(0, v_streak - v_decay) + 1;
        v_earn := 1;
      ELSE
        -- manual-restore era: bridge only if the whole gap was restored
        SELECT count(*) INTO v_uncovered
        FROM generate_series(v_prev + 1, r.d - 1, interval '1 day') g(d)
        WHERE g.d::date <> ALL (v_restored);
        IF v_uncovered = 0 THEN
          v_shields := GREATEST(0, v_shields - 1);   -- one restore spent
          v_streak := v_streak + 1;
          v_earn := v_earn + 1;
        ELSE
          v_streak := 1;                             -- break, no auto-shield
          v_earn := 1;
        END IF;
      END IF;
    END IF;
    IF v_earn >= 21 THEN
      IF v_shields < 3 THEN v_shields := v_shields + 1; END IF;
      v_earn := 0;
    END IF;
    v_longest := GREATEST(v_longest, v_streak);
    v_prev := r.d;
  END LOOP;
  RETURN QUERY SELECT v_streak, v_shields, v_earn, v_longest, v_prev;
END $function$;
