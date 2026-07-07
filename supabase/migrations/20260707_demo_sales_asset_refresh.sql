-- Makes the read-only demo (Aarav) hold up as a sales asset, not just a
-- functional demo. Two problems found auditing it end-to-end:
--
-- 1. The daily auto-backfill in refresh_demo_dates() wrote bland, identical
--    filler rows (one generic topic, no notes, no mood) for every day
--    outside the hand-curated ~30-day seed window. Since History shows
--    most-recent-first and the curated window recedes further into the
--    past every day this cron runs, a visitor would always land on weeks
--    of filler that reads like a stub, not a real diary. Replaced with a
--    rotating pool of specific, voiced day-templates (topic + note + mood
--    together) so every visible day looks hand-written.
--
-- 2. The percentile arc (72 -> 84 across 7 mocks) plateaus well short of
--    the "recovery arc" the account is meant to sell, and never gets
--    touched by the date-reanchoring cron (it only shifts dates, not
--    scores) so it was just stuck there. One-time bump of the last two
--    mocks so the story actually climbs into competitive territory,
--    rewritten strategy notes to match.

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

  -- TEST RESULTS (CAT-readiness diagnostic): newest = today-5, each older ~33 days back
  WITH t AS (
    SELECT id, row_number() OVER (ORDER BY attempt_date) AS rn, count(*) OVER () AS n
    FROM test_results WHERE student_id = v_student
  )
  UPDATE test_results tr
  SET attempt_date = v_today - (5 + (t.n - t.rn) * 33)::int,
      created_at = (v_today - (5 + (t.n - t.rn) * 33)::int)::timestamp
  FROM t WHERE tr.id = t.id;

  -- NOTIFICATIONS: keep the two demo cards fresh
  UPDATE notifications SET created_at = now() - interval '7 hours'
  WHERE user_id = v_student AND title = 'Nishant left you feedback 🎯';
  UPDATE notifications SET created_at = now() - interval '6 hours'
  WHERE user_id = v_student AND title = '📈 Your mock analysis is ready';

  -- DAILY LOGS: unbroken streak for the last 72 days ending yesterday.
  -- Each gap day gets a coherent, specific entry (topic + note + mood picked
  -- together from the same template) instead of a bland single-topic stub,
  -- so History never reads like filler no matter how far the curated seed
  -- window has receded.
  WITH templates(idx, topics, note, mood) AS (
    VALUES
      (1,  ARRAY['QA - Number Systems','QA - Percentages'], 'Solid focused block, no phone. Number systems finally clicking.', '💪'),
      (2,  ARRAY['VARC RC'],                                'Slow RC day — inference questions still trip me up. Flagged 3 for the buddy session.', '🙂'),
      (3,  ARRAY['DILR sets'],                              'Attempted 2 hard sets under time. Missed the cutoff on one but analysed why.', '😤'),
      (4,  ARRAY['Revision'],                                'Pure revision day — went back over last week''s error log.', '😌'),
      (5,  ARRAY['Vocab','VARC RC'],                        'Vocab list done + one RC passage. Slow start, picked up after a break.', '🙂'),
      (6,  ARRAY['Mock analysis'],                           'Spent the evening on mock debrief instead of a fresh mock. Worth it.', '🤝'),
      (7,  ARRAY['QA - Arithmetic'],                         'Arithmetic speed drills. Getting faster, still a few silly errors.', '😅'),
      (8,  ARRAY['DILR sets','QA practice'],                'Split day — DILR in the morning, QA at night. Tired but got it done.', '💪'),
      (9,  ARRAY['VARC RC','Vocab'],                        'RC + vocab combo. Comfortable day, no major struggles.', '😊'),
      (10, ARRAY['Revision','Mock analysis'],               'Reviewed last mock''s mistakes and revised the weak topics behind them.', '🎯'),
      (11, ARRAY['QA practice'],                             'Low-energy day but showed up anyway. Half the usual pace.', '😓'),
      (12, ARRAY['DILR sets'],                               'Two clean sets today. Set-selection strategy finally paying off.', '🔥'),
      (13, ARRAY['VARC RC'],                                 'Long passage practice — timing under control now.', '🙂'),
      (14, ARRAY['Revision'],                                'Sunday reset — light revision, mostly recovery.', '😌')
  ),
  days AS (
    SELECT g.d::date AS d, 1 + floor(random() * 14)::int AS idx
    FROM generate_series(v_today - 72, v_today - 1, interval '1 day') g(d)
  )
  INSERT INTO daily_reports (
    student_id, report_date, study_duration, topics_covered, notes, mood_emoji,
    quality_focus, difficulty, mock_taken, confidence, stress, sleep_quality,
    nutrition_exercise, overall_energy
  )
  SELECT v_student, days.d,
    round((3 + random() * 3.5)::numeric, 1),
    t.topics, t.note, t.mood,
    (3 + floor(random() * 2))::smallint, (3 + floor(random() * 2))::smallint, false,
    (3 + floor(random() * 2))::smallint, (2 + floor(random() * 3))::smallint, (3 + floor(random() * 2))::smallint,
    random() > 0.4, (3 + floor(random() * 2))::smallint
  FROM days JOIN templates t ON t.idx = days.idx
  ON CONFLICT (student_id, report_date) DO NOTHING;

  -- MEMBER SINCE: always ~75 days ago (before the journey began)
  UPDATE profiles SET created_at = (now() - interval '75 days') WHERE id = v_student;

  -- STREAK NUMBER (read from streak_data, not daily_reports): keep it equal to the
  -- unbroken run ending yesterday so the profile shows the real streak.
  UPDATE streak_data sd
  SET current_streak = c.cnt,
      longest_streak = GREATEST(COALESCE(sd.longest_streak, 0), c.cnt),
      last_log_date = v_today - 1,
      updated_at = now()
  FROM (SELECT count(*)::int AS cnt FROM daily_reports WHERE student_id = v_student AND report_date <= v_today - 1) c
  WHERE sd.student_id = v_student;

  INSERT INTO streak_data (student_id, current_streak, longest_streak, last_log_date)
  SELECT v_student, c.cnt, c.cnt, v_today - 1
  FROM (SELECT count(*)::int AS cnt FROM daily_reports WHERE student_id = v_student AND report_date <= v_today - 1) c
  WHERE NOT EXISTS (SELECT 1 FROM streak_data WHERE student_id = v_student);
END;
$$;

-- One-time content fix: strengthen the last two mocks so the percentile arc
-- climbs into competitive territory instead of plateauing at 84. Dates are
-- untouched here (refresh_demo_dates() re-anchors those daily); only scores
-- and the strategy notes describing them change.
WITH v AS (SELECT id FROM profiles WHERE email = 'aarav@careerrai.com' AND is_demo = true LIMIT 1)
UPDATE mock_debriefs md
SET overall_percentile = 89.00,
    varc = '{"attempted":26,"correct":20,"time_min":34,"percentile":90}'::jsonb,
    dilr = '{"attempted":23,"correct":19,"time_min":34,"percentile":92}'::jsonb,
    qa   = '{"attempted":28,"correct":23,"time_min":35,"percentile":91}'::jsonb,
    strategy_note = 'Bounce-back mock — the panic-reset routine worked. Boxed the bad DILR set from last time and moved on instead of chasing it.'
FROM v
WHERE md.student_id = v.id AND md.mock_name = 'AIMCAT 2220';

WITH v AS (SELECT id FROM profiles WHERE email = 'aarav@careerrai.com' AND is_demo = true LIMIT 1)
UPDATE mock_debriefs md
SET overall_percentile = 96.00,
    varc = '{"attempted":24,"correct":19,"time_min":34,"percentile":91}'::jsonb,
    dilr = '{"attempted":22,"correct":20,"time_min":33,"percentile":97}'::jsonb,
    qa   = '{"attempted":26,"correct":24,"time_min":32,"percentile":99}'::jsonb,
    strategy_note = 'DILR aur QA ab consistently 95+ pe hain. VARC inference abhi bhi thoda peeche — agla mahina wahi target: har option ko passage se verify karke.'
FROM v
WHERE md.student_id = v.id AND md.mock_name = 'SIMCAT 14';
