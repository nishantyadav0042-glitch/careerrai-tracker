-- Keeps the read-only demo account (Aarav) perpetually fresh by re-anchoring
-- all of its dates relative to "today". Called daily by /api/cron/refresh-demo.
CREATE OR REPLACE FUNCTION public.refresh_demo_dates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  SELECT id INTO v_student FROM profiles WHERE email = 'aarav@careerrai.com' AND is_demo = true LIMIT 1;
  IF v_student IS NULL THEN RETURN; END IF;

  -- MOCKS: newest = today-3, each older +8 days
  WITH m AS (
    SELECT id, row_number() OVER (ORDER BY taken_on) AS rn, count(*) OVER () AS n
    FROM mock_debriefs WHERE student_id = v_student
  )
  UPDATE mock_debriefs md
  SET taken_on = v_today - (3 + (m.n - m.rn) * 8)::int,
      log_date = v_today - (3 + (m.n - m.rn) * 8)::int,
      mock_date = v_today - (3 + (m.n - m.rn) * 8)::int
  FROM m WHERE md.id = m.id;

  -- UPCOMING session: always 2 days out at 19:00 IST
  UPDATE video_sessions
  SET scheduled_at = ((v_today + 2)::timestamp + interval '19 hours') AT TIME ZONE 'Asia/Kolkata'
  WHERE student_id = v_student AND session_status = 'scheduled';

  -- COMPLETED sessions: newest = today-5, each older +7 days
  WITH s AS (
    SELECT id, row_number() OVER (ORDER BY scheduled_at) AS rn, count(*) OVER () AS n
    FROM video_sessions WHERE student_id = v_student AND session_status = 'completed'
  ), d AS (
    SELECT id, ((v_today - (5 + (n - rn) * 7)::int)::timestamp + interval '19 hours') AT TIME ZONE 'Asia/Kolkata' AS ts
    FROM s
  )
  UPDATE video_sessions vs
  SET scheduled_at = d.ts, started_at = d.ts, ended_at = d.ts + interval '45 minutes'
  FROM d WHERE vs.id = d.id;

  -- FEEDBACK: newest = 6h ago, others 7/14/21/28d ago
  WITH f AS (
    SELECT id, row_number() OVER (ORDER BY created_at) AS rn, count(*) OVER () AS n
    FROM buddy_feedback WHERE student_id = v_student
  ), nc AS (
    SELECT id,
      CASE WHEN rn = n THEN now() - interval '6 hours'
           ELSE now() - ((n - rn) * interval '7 days') END AS ts
    FROM f
  )
  UPDATE buddy_feedback bf
  SET created_at = nc.ts, feedback_date = (nc.ts AT TIME ZONE 'Asia/Kolkata')::date
  FROM nc WHERE bf.id = nc.id;

  -- CHAT: spread over the last ~33h (newest 3h ago)
  WITH c AS (
    SELECT id, row_number() OVER (ORDER BY created_at) AS rn, count(*) OVER () AS n
    FROM chat_messages WHERE student_id = v_student
  )
  UPDATE chat_messages cm
  SET created_at = now() - (((c.n - c.rn) * 5 + 3) * interval '1 hour'),
      read_at    = now() - (((c.n - c.rn) * 5 + 3) * interval '1 hour') + interval '20 minutes'
  FROM c WHERE cm.id = c.id;

  -- NOTIFICATIONS: keep the two demo cards fresh
  UPDATE notifications SET created_at = now() - interval '7 hours'
  WHERE user_id = v_student AND title = 'Nishant left you feedback 🎯';
  UPDATE notifications SET created_at = now() - interval '6 hours'
  WHERE user_id = v_student AND title = '📈 Your mock analysis is ready';

  -- DAILY LOGS: unbroken streak for the last 72 days ending yesterday
  INSERT INTO daily_reports (student_id, report_date, study_duration, topics_covered, quality_focus, difficulty, mock_taken, confidence, stress, sleep_quality, nutrition_exercise, overall_energy)
  SELECT v_student, g::date,
    round((3 + random()*3.5)::numeric, 1),
    ARRAY[(ARRAY['QA practice','VARC RC','DILR sets','Revision','Vocab','Mock analysis'])[1+floor(random()*6)::int]],
    (3+floor(random()*2))::smallint, (3+floor(random()*2))::smallint, false,
    (3+floor(random()*2))::smallint, (2+floor(random()*3))::smallint, (3+floor(random()*2))::smallint,
    random() > 0.4, (3+floor(random()*2))::smallint
  FROM generate_series(v_today - 72, v_today - 1, interval '1 day') g
  ON CONFLICT (student_id, report_date) DO NOTHING;
END;
$$;
