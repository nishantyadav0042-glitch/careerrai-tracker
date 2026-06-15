-- =============================================================
-- CareerRai Demo Seed Script
-- Re-runnable: deletes existing demo data, then re-inserts.
-- Run via: Supabase SQL Editor or MCP execute_sql
-- =============================================================

DO $$
DECLARE
  v_aarav  UUID := '9e31e939-c750-4911-830b-fff9d60c63f4';
  v_priya  UUID := 'c281a489-1979-4617-b0fa-61da5ee76d87';
  v_nishant UUID := '62c4b55c-c164-470e-b390-c3dab989335d';
  v_admin  UUID := '025c1ee5-e2d8-46f1-8f42-da75cac8ae43';
  v_rohan  UUID := 'c195077a-8017-4da5-826f-9866a5b97e7a';
  v_meera  UUID := '9fb13670-20a1-4f29-bb03-9bf309327254';
  v_arjun  UUID := '1ed009cd-2ff1-493c-9a79-cfd08d6dbf82';
BEGIN

-- =============================================================
-- 1. CLEAR existing demo data (order matters — FKs)
-- =============================================================
DELETE FROM public.buddy_briefings  WHERE student_id IN (v_aarav, v_priya, v_rohan, v_meera);
DELETE FROM public.mock_drop_alerts WHERE student_id IN (v_aarav, v_priya, v_rohan, v_meera);
DELETE FROM public.recovery_events  WHERE student_id IN (v_aarav, v_priya, v_rohan, v_meera);
DELETE FROM public.streak_shields   WHERE student_id IN (v_aarav, v_priya, v_rohan, v_meera);
DELETE FROM public.streak_data      WHERE student_id IN (v_aarav, v_priya, v_rohan, v_meera, v_arjun);
DELETE FROM public.mock_debriefs    WHERE student_id IN (v_aarav, v_priya, v_rohan, v_meera);
DELETE FROM public.daily_reports    WHERE student_id IN (v_aarav, v_priya, v_rohan, v_meera, v_arjun);
DELETE FROM public.buddy_feedback   WHERE buddy_id = v_nishant;
DELETE FROM public.chat_messages    WHERE buddy_id = v_nishant;
DELETE FROM public.video_sessions   WHERE buddy_id = v_nishant;
DELETE FROM public.session_requests WHERE buddy_id = v_nishant;
DELETE FROM public.buddy_payouts    WHERE buddy_id = v_nishant;
DELETE FROM public.scholarships     WHERE student_id IN (v_aarav, v_priya, v_rohan, v_meera);
DELETE FROM public.coupons          WHERE created_by = v_admin AND code LIKE 'DEMO%';
DELETE FROM public.student_payments WHERE student_id IN (v_aarav, v_priya, v_rohan, v_meera);
DELETE FROM public.student_allowlist WHERE email IN (
  'aarav@careerrai.com','priya@careerrai.com','rohan@careerrai.com',
  'meera@careerrai.com','arjun@careerrai.com'
);

-- =============================================================
-- 2. PROFILES — mark all demo accounts
-- =============================================================
UPDATE public.profiles SET
  is_demo             = TRUE,
  full_name           = 'Aarav Sharma',
  role                = 'student',
  exam_target         = 'CAT',
  dream_colleges      = ARRAY['IIM Bangalore','IIM Calcutta','FMS Delhi'],
  is_repeater         = TRUE,
  starting_percentile = 84,
  hours_available     = 6,
  onboarding_completed= TRUE,
  buddy_id            = v_nishant,
  cat_percentile      = 87.00,
  current_streak      = 20,
  best_streak         = 20,
  last_log_date       = '2026-06-14',
  total_logs_completed= 27,
  study_target_hours  = 4,
  subscription_status = 'active',
  avatar_seed         = 'aarav-sharma'
WHERE id = v_aarav;

UPDATE public.profiles SET
  is_demo             = TRUE,
  full_name           = 'Priya Kapoor',
  role                = 'student',
  exam_target         = 'CAT',
  dream_colleges      = ARRAY['IIM Indore','IIM Trichy','FMS Delhi'],
  is_repeater         = FALSE,
  starting_percentile = NULL,
  hours_available     = 3,
  onboarding_completed= TRUE,
  buddy_id            = v_nishant,
  cat_percentile      = 68.00,
  current_streak      = 7,
  best_streak         = 10,
  last_log_date       = '2026-06-14',
  total_logs_completed= 17,
  study_target_hours  = 2.5,
  subscription_status = 'active',
  avatar_seed         = 'priya-kapoor'
WHERE id = v_priya;

UPDATE public.profiles SET
  is_demo             = TRUE,
  full_name           = 'Nishant Yadav',
  role                = 'buddy',
  college             = 'IIM Bangalore',
  cat_percentile      = 97.50,
  buddy_bio           = 'CAT 2023 — 99.7%ile → IIM Bangalore. Repeater myself (80%ile first attempt). I specialize in helping repeaters break through the 95%ile wall by focusing on error patterns, not just scores.',
  agreed_monthly_payout = 3000,
  subscription_status = 'active',
  is_repeater         = TRUE,
  avatar_seed         = 'nishant-yadav'
WHERE id = v_nishant;

UPDATE public.profiles SET
  is_demo             = TRUE,
  full_name           = 'Nishant (Admin)',
  role                = 'admin'
WHERE id = v_admin;

-- Thriving student: Rohan Patel
UPDATE public.profiles SET
  is_demo             = TRUE,
  full_name           = 'Rohan Patel',
  role                = 'student',
  exam_target         = 'CAT',
  dream_colleges      = ARRAY['IIM Ahmedabad','IIM Bangalore'],
  is_repeater         = TRUE,
  starting_percentile = 88,
  onboarding_completed= TRUE,
  buddy_id            = v_nishant,
  cat_percentile      = 92.00,
  current_streak      = 18,
  best_streak         = 18,
  last_log_date       = '2026-06-14',
  total_logs_completed= 18,
  study_target_hours  = 5,
  subscription_status = 'active',
  avatar_seed         = 'rohan-patel'
WHERE id = v_rohan;

-- Needs-attention student: Meera Patel (lapsed 10 days)
UPDATE public.profiles SET
  is_demo             = TRUE,
  full_name           = 'Meera Patel',
  role                = 'student',
  exam_target         = 'CAT',
  dream_colleges      = ARRAY['IIM Lucknow','MDI Gurgaon'],
  is_repeater         = FALSE,
  starting_percentile = NULL,
  onboarding_completed= TRUE,
  buddy_id            = v_nishant,
  cat_percentile      = 71.00,
  current_streak      = 0,
  best_streak         = 10,
  last_log_date       = '2026-06-05',
  total_logs_completed= 10,
  study_target_hours  = 3,
  subscription_status = 'active',
  avatar_seed         = 'meera-patel'
WHERE id = v_meera;

-- Brand-new student: Arjun Singh (just matched, 2 days in)
UPDATE public.profiles SET
  is_demo             = TRUE,
  full_name           = 'Arjun Singh',
  role                = 'student',
  exam_target         = 'CAT',
  dream_colleges      = ARRAY['IIM Kozhikode','IIM Shillong'],
  is_repeater         = FALSE,
  starting_percentile = NULL,
  onboarding_completed= TRUE,
  buddy_id            = v_nishant,
  cat_percentile      = NULL,
  current_streak      = 2,
  best_streak         = 2,
  last_log_date       = '2026-06-14',
  total_logs_completed= 2,
  study_target_hours  = 3,
  subscription_status = 'active',
  avatar_seed         = 'arjun-singh'
WHERE id = v_arjun;

-- =============================================================
-- 3. DAILY REPORTS — AARAV (30-day arc, 27 logged; gap May 23–25)
-- =============================================================
INSERT INTO public.daily_reports
  (student_id, report_date, study_duration, topics_covered, quality_focus, difficulty,
   confidence, stress, sleep_quality, overall_energy, notes, mood_emoji, emotional_chips)
VALUES
  -- Days 1–6: strong start
  (v_aarav,'2026-05-16',5.0, ARRAY['QA: Number Theory','QA: Arithmetic'],        4,4,4,2,4,4,'Solid start. QA feels sharp.','😊',ARRAY[]::text[]),
  (v_aarav,'2026-05-17',4.5, ARRAY['VARC: RC passages','VARC: Para-jumbles'],     4,3,4,2,4,4,'RC timing okay. Para-jumbles need work.','😊',ARRAY[]::text[]),
  (v_aarav,'2026-05-18',5.0, ARRAY['DILR: Seating','DILR: Games & Tournaments'], 5,4,5,2,4,5,'Cracked a hard seating set. Felt great.','😊',ARRAY[]::text[]),
  (v_aarav,'2026-05-19',4.0, ARRAY['QA: Algebra','VARC: Vocabulary'],             4,3,4,2,3,4,NULL,'😊',ARRAY[]::text[]),
  (v_aarav,'2026-05-20',4.5, ARRAY['DILR: DI tables','DILR: Networks'],           4,4,4,2,4,4,'DI tables comfortable. Networks slow.','😊',ARRAY[]::text[]),
  (v_aarav,'2026-05-21',5.0, ARRAY['QA: Geometry','VARC: Summary','DILR: Revision'],5,4,5,2,4,5,'Full revision day. Ready for tomorrow''s mock.','😊',ARRAY['Ready for tomorrow']::text[]),
  -- Day 7: Mock day — the drop (79%ile, scared)
  (v_aarav,'2026-05-22',2.0, ARRAY['Mock: TIME AIMCAT 1','QA: Light revision'],   3,5,2,5,3,2,'Mock destroyed me. DILR set selection cost 15 marks. 79%ile. Expected 86.','😨',ARRAY['Mock scared me','Dropped percentile']::text[]),
  -- Days 8–10 (May 23–25): INTENTIONALLY MISSING — the dip
  -- Day 11: Return (May 26) — Nishant reached in
  (v_aarav,'2026-05-26',3.0, ARRAY['DILR: Set selection','QA: Basics review'],    3,3,3,3,3,3,'Back. Nishant checked in. Starting fresh.','😌',ARRAY['Back on track','Nishant reached out']::text[]),
  -- Days 12–16: rebuilding
  (v_aarav,'2026-05-27',3.5, ARRAY['QA: Number Theory','QA: Arithmetic basics'],  3,3,3,3,3,3,'Drilling fundamentals again. Slow but steady.','😊',ARRAY[]::text[]),
  (v_aarav,'2026-05-28',4.0, ARRAY['VARC: RC','VARC: Odd Sentence'],              3,3,3,2,4,4,NULL,'😊',ARRAY[]::text[]),
  (v_aarav,'2026-05-29',3.0, ARRAY['DILR: Easy sets practice'],                   3,3,3,3,3,3,'Practicing set selection — pick 2 of 8 fast.','😊',ARRAY[]::text[]),
  (v_aarav,'2026-05-30',4.5, ARRAY['QA: Algebra','QA: Percentages'],              4,3,4,2,4,4,NULL,'😊',ARRAY[]::text[]),
  (v_aarav,'2026-05-31',4.0, ARRAY['VARC: RC','DILR: Games'],                     4,4,4,2,4,4,'DILR timing improving.','😊',ARRAY[]::text[]),
  -- Day 17: Mock 2 (Jun 1) — 82%ile, progress
  (v_aarav,'2026-06-01',2.0, ARRAY['Mock: IMS SimCAT 1','Post-mock analysis'],    4,4,4,3,4,4,'82%ile. Set selection worked. Silly errors in QA though.','😊',ARRAY['Progress']::text[]),
  (v_aarav,'2026-06-02',4.5, ARRAY['QA: SimCAT review','DILR: Error analysis'],   4,3,4,2,4,4,'Going through every wrong answer.','😊',ARRAY[]::text[]),
  (v_aarav,'2026-06-03',4.0, ARRAY['QA: Geometry','QA: Algebra'],                 4,4,4,2,4,4,NULL,'😊',ARRAY[]::text[]),
  (v_aarav,'2026-06-04',3.0, ARRAY['VARC: RC','VARC: Para-summary'],              3,3,3,3,3,3,'Shorter day — work stuff. 3 hours counts.','😐',ARRAY[]::text[]),
  (v_aarav,'2026-06-05',5.0, ARRAY['DILR: Intensive set practice','DILR: Clocks'],5,5,4,2,4,5,'8 DILR sets back to back. Timing locked.','😊',ARRAY[]::text[]),
  (v_aarav,'2026-06-06',4.5, ARRAY['VARC: Critical Reasoning','VARC: RC'],        4,4,4,2,4,4,NULL,'😊',ARRAY[]::text[]),
  (v_aarav,'2026-06-07',4.0, ARRAY['QA: Algebra advanced','QA: P&C'],             4,5,5,2,4,4,'P&C clicked today. Finally.','😊',ARRAY[]::text[]),
  -- Day 24: Mock 3 (Jun 8) — 85%ile, DILR jump
  (v_aarav,'2026-06-08',2.0, ARRAY['Mock: Cracku Full Mock 1','Mock analysis'],   5,5,5,2,4,5,'85%ile! Trajectory moving. DILR selection clean.','😊',ARRAY['Best mock yet','Getting there']::text[]),
  (v_aarav,'2026-06-09',4.5, ARRAY['QA: Cracku review','DILR: Wrong sets'],       4,4,4,2,4,4,NULL,'😊',ARRAY[]::text[]),
  (v_aarav,'2026-06-10',4.0, ARRAY['DILR: Networks','DILR: Scheduling'],          4,4,4,2,4,4,NULL,'😊',ARRAY[]::text[]),
  -- Day 27: Rest day (Jun 11) — streak shield used
  (v_aarav,'2026-06-11',1.0, ARRAY['Light reading: VARC articles'],               2,2,4,1,5,4,'Rest day. Nishant said one protected off day is fine. Needed it.','😌',ARRAY['Rest day','Protected streak']::text[]),
  (v_aarav,'2026-06-12',5.0, ARRAY['QA: Full practice set','QA: Mental math'],    5,5,5,2,4,5,'QA on fire. 90%+ accuracy on timed set.','😊',ARRAY[]::text[]),
  -- Day 29: Mock 4 (Jun 13) — 87%ile
  (v_aarav,'2026-06-13',2.0, ARRAY['Mock: TIME AIMCAT 2','Quick analysis'],       5,5,5,2,4,5,'87%ile. Error buckets genuinely shrinking.','😊',ARRAY['87 today!','Building']::text[]),
  (v_aarav,'2026-06-14',4.5, ARRAY['Integrated revision','All sections timed'],   4,4,5,1,5,5,'Calm and prepared. Feeling IIM-B range.','😌',ARRAY[]::text[])
ON CONFLICT (student_id, report_date) DO UPDATE SET
  study_duration   = EXCLUDED.study_duration,
  topics_covered   = EXCLUDED.topics_covered,
  quality_focus    = EXCLUDED.quality_focus,
  difficulty       = EXCLUDED.difficulty,
  confidence       = EXCLUDED.confidence,
  stress           = EXCLUDED.stress,
  sleep_quality    = EXCLUDED.sleep_quality,
  overall_energy   = EXCLUDED.overall_energy,
  notes            = EXCLUDED.notes,
  mood_emoji       = EXCLUDED.mood_emoji,
  emotional_chips  = EXCLUDED.emotional_chips;

-- =============================================================
-- 4. DAILY REPORTS — PRIYA (18-day arc, 17 logged; missed Jun 7)
-- =============================================================
INSERT INTO public.daily_reports
  (student_id, report_date, study_duration, topics_covered, quality_focus, difficulty,
   confidence, stress, sleep_quality, overall_energy, notes, mood_emoji, emotional_chips)
VALUES
  (v_priya,'2026-05-28',2.5,ARRAY['VARC: RC basics','VARC: Reading habits'],   3,3,3,3,3,3,'First day. Trying to build the habit.','😊',ARRAY['Day 1']::text[]),
  (v_priya,'2026-05-29',2.0,ARRAY['QA: Arithmetic','QA: Percentages basics'],  3,3,3,2,4,3,'QA is rusty from the college gap.','😊',ARRAY[]::text[]),
  (v_priya,'2026-05-30',3.0,ARRAY['DILR: Introduction','DILR: Simple DI'],     3,3,3,2,4,3,'DILR intro done. Seems manageable.','😊',ARRAY[]::text[]),
  (v_priya,'2026-05-31',2.5,ARRAY['VARC: RC timed','VARC: Vocabulary'],        3,3,3,2,3,3,NULL,'😊',ARRAY[]::text[]),
  (v_priya,'2026-06-01',2.0,ARRAY['QA: Algebra basics'],                       3,3,3,3,3,3,'Algebra fundamentals only. Need more time.','😐',ARRAY[]::text[]),
  (v_priya,'2026-06-02',2.5,ARRAY['DILR: Seating arrangements'],               3,4,3,2,4,3,NULL,'😊',ARRAY[]::text[]),
  (v_priya,'2026-06-03',2.0,ARRAY['VARC: RC practice','VARC: Summary'],        3,3,3,2,4,3,NULL,'😊',ARRAY[]::text[]),
  (v_priya,'2026-06-04',3.0,ARRAY['QA: Number system','QA: LCM & HCF'],        4,3,3,2,4,4,'Number system clicking a bit more.','😊',ARRAY[]::text[]),
  -- Day 9: Mock 1 (Jun 5) — 65%ile, first mock ever
  (v_priya,'2026-06-05',2.0,ARRAY['Mock: IMS SimCAT 1','Quick analysis'],       3,4,3,4,3,3,'65%ile. First attempt. DILR time was brutal.','😐',ARRAY['First mock','Nervous']::text[]),
  (v_priya,'2026-06-06',2.5,ARRAY['DILR: Mock error review','DILR: Timing'],   3,4,3,3,4,3,'Reviewing mock DILR errors. Set selection is the issue.','😊',ARRAY[]::text[]),
  -- Day 11: MISSED (Jun 7) — intentionally absent
  (v_priya,'2026-06-08',2.0,ARRAY['QA: Arithmetic revision'],                  3,3,3,2,3,3,'Back after a miss. Keeping it simple.','😊',ARRAY[]::text[]),
  (v_priya,'2026-06-09',2.5,ARRAY['DILR: DI charts','DILR: Bar graphs'],       3,3,3,2,4,3,NULL,'😊',ARRAY[]::text[]),
  (v_priya,'2026-06-10',3.0,ARRAY['QA: Algebra','QA: Equations'],              4,3,3,2,4,4,NULL,'😊',ARRAY[]::text[]),
  (v_priya,'2026-06-11',2.5,ARRAY['VARC: RC timed','VARC: Inference'],         3,3,4,2,4,3,'RC speed improving a bit.','😊',ARRAY[]::text[]),
  -- Day 16: Mock 2 (Jun 12) — 68%ile
  (v_priya,'2026-06-12',2.0,ARRAY['Mock: TIME AIMCAT 1','Quick analysis'],     3,4,3,3,4,3,'68%ile. Small improvement. Consistency over drama.','😊',ARRAY['Moving up']::text[]),
  (v_priya,'2026-06-13',2.5,ARRAY['DILR: Mock review','DILR: Time practice'],  3,3,3,2,4,3,NULL,'😊',ARRAY[]::text[]),
  (v_priya,'2026-06-14',3.0,ARRAY['QA: Integrated practice','VARC: RC'],       4,3,3,2,4,4,'Settling into the routine.','😊',ARRAY['Finding my rhythm']::text[])
ON CONFLICT (student_id, report_date) DO UPDATE SET
  study_duration   = EXCLUDED.study_duration,
  topics_covered   = EXCLUDED.topics_covered,
  quality_focus    = EXCLUDED.quality_focus,
  difficulty       = EXCLUDED.difficulty,
  confidence       = EXCLUDED.confidence,
  stress           = EXCLUDED.stress,
  sleep_quality    = EXCLUDED.sleep_quality,
  overall_energy   = EXCLUDED.overall_energy,
  notes            = EXCLUDED.notes,
  mood_emoji       = EXCLUDED.mood_emoji,
  emotional_chips  = EXCLUDED.emotional_chips;

-- =============================================================
-- 5. DAILY REPORTS — ROHAN (thriving, 18 consecutive days)
-- =============================================================
INSERT INTO public.daily_reports
  (student_id, report_date, study_duration, topics_covered, quality_focus, difficulty,
   confidence, stress, sleep_quality, overall_energy, mood_emoji, emotional_chips)
SELECT v_rohan, gs.dt,
  CASE WHEN extract(dow FROM gs.dt) IN (0,6) THEN 4.5 ELSE 5.0 END,
  ARRAY['QA','DILR'], 4, 4, 5, 2, 4, 5, '😊', ARRAY[]::text[]
FROM generate_series('2026-05-28'::date, '2026-06-14'::date, '1 day') AS gs(dt)
ON CONFLICT (student_id, report_date) DO NOTHING;

-- =============================================================
-- 6. DAILY REPORTS — MEERA (10 days, then lapsed Jun 6)
-- =============================================================
INSERT INTO public.daily_reports
  (student_id, report_date, study_duration, topics_covered, quality_focus, difficulty,
   confidence, stress, sleep_quality, overall_energy, mood_emoji, emotional_chips)
SELECT v_meera, gs.dt, 3.0, ARRAY['QA','VARC'], 3, 3, 3, 3, 3, 3, '😊', ARRAY[]::text[]
FROM generate_series('2026-05-27'::date, '2026-06-05'::date, '1 day') AS gs(dt)
ON CONFLICT (student_id, report_date) DO NOTHING;

-- =============================================================
-- 7. DAILY REPORTS — ARJUN (brand-new, 2 days only)
-- =============================================================
INSERT INTO public.daily_reports
  (student_id, report_date, study_duration, topics_covered, quality_focus, difficulty,
   confidence, stress, sleep_quality, overall_energy, notes, mood_emoji, emotional_chips)
VALUES
  (v_arjun,'2026-06-13',2.0,ARRAY['VARC: RC basics','QA: Arithmetic intro'],3,3,2,3,3,3,'First day on CareerRai. A bit nervous but ready.','😊',ARRAY['Day 1']::text[]),
  (v_arjun,'2026-06-14',2.5,ARRAY['QA: Number System basics'],              3,3,3,2,3,3,'Logged again. Making it a habit.','😊',ARRAY[]::text[])
ON CONFLICT (student_id, report_date) DO NOTHING;

-- =============================================================
-- 8. MOCK DEBRIEFS — AARAV (4 mocks, dip-and-recovery arc)
-- =============================================================
INSERT INTO public.mock_debriefs
  (student_id, taken_on, log_date, overall_percentile, varc, dilr, qa,
   error_buckets, strategy_note, provider, mock_name, mock_date)
VALUES
  -- Mock 1 (May 22): the crash — 79%ile, heavy errors
  (v_aarav,'2026-05-22','2026-05-22',79.0,
   '{"attempted":22,"correct":14,"time_min":40,"percentile":72}'::jsonb,
   '{"attempted":16,"correct":8,"time_min":40,"percentile":63}'::jsonb,
   '{"attempted":20,"correct":11,"time_min":40,"percentile":75}'::jsonb,
   '{"conceptual":3,"silly":8,"time":4,"panic":2,"selection":7}'::jsonb,
   'DILR set selection cost me 15 marks. Panicked in QA last 10 min. Need to address both.',
   'TIME','AIMCAT 1','2026-05-22'),
  -- Mock 2 (Jun 1): 82%ile — errors shrinking
  (v_aarav,'2026-06-01','2026-06-01',82.0,
   '{"attempted":24,"correct":16,"time_min":40,"percentile":78}'::jsonb,
   '{"attempted":18,"correct":10,"time_min":40,"percentile":70}'::jsonb,
   '{"attempted":22,"correct":13,"time_min":40,"percentile":80}'::jsonb,
   '{"conceptual":3,"silly":5,"time":3,"panic":2,"selection":4}'::jsonb,
   'Better set selection. Still silly mistakes in QA arithmetic — slow down on calculations.',
   'IMS','SimCAT 1','2026-06-01'),
  -- Mock 3 (Jun 8): 85%ile — DILR jump notable
  (v_aarav,'2026-06-08','2026-06-08',85.0,
   '{"attempted":25,"correct":18,"time_min":40,"percentile":83}'::jsonb,
   '{"attempted":20,"correct":13,"time_min":40,"percentile":80}'::jsonb,
   '{"attempted":22,"correct":15,"time_min":40,"percentile":85}'::jsonb,
   '{"conceptual":2,"silly":3,"time":2,"panic":1,"selection":2}'::jsonb,
   'DILR set selection clean. Silly errors down. Feeling settled.',
   'Cracku','Full Mock 1','2026-06-08'),
  -- Mock 4 (Jun 13): 87%ile — error buckets minimal
  (v_aarav,'2026-06-13','2026-06-13',87.0,
   '{"attempted":26,"correct":19,"time_min":40,"percentile":86}'::jsonb,
   '{"attempted":20,"correct":14,"time_min":40,"percentile":84}'::jsonb,
   '{"attempted":24,"correct":17,"time_min":40,"percentile":88}'::jsonb,
   '{"conceptual":2,"silly":2,"time":1,"panic":1,"selection":1}'::jsonb,
   'Error buckets clean. Trajectory solid. Need to tighten QA accuracy to hit 90+.',
   'TIME','AIMCAT 2','2026-06-13')
ON CONFLICT (student_id, log_date) DO UPDATE SET
  taken_on          = EXCLUDED.taken_on,
  overall_percentile= EXCLUDED.overall_percentile,
  varc = EXCLUDED.varc, dilr = EXCLUDED.dilr, qa = EXCLUDED.qa,
  error_buckets     = EXCLUDED.error_buckets,
  strategy_note     = EXCLUDED.strategy_note,
  provider = EXCLUDED.provider, mock_name = EXCLUDED.mock_name, mock_date = EXCLUDED.mock_date;

-- =============================================================
-- 9. MOCK DEBRIEFS — PRIYA (2 mocks, first-timer calm arc)
-- =============================================================
INSERT INTO public.mock_debriefs
  (student_id, taken_on, log_date, overall_percentile, varc, dilr, qa,
   error_buckets, strategy_note, provider, mock_name, mock_date)
VALUES
  (v_priya,'2026-06-05','2026-06-05',65.0,
   '{"attempted":20,"correct":12,"time_min":40,"percentile":62}'::jsonb,
   '{"attempted":14,"correct":7,"time_min":40,"percentile":55}'::jsonb,
   '{"attempted":18,"correct":10,"time_min":40,"percentile":60}'::jsonb,
   '{"conceptual":5,"silly":4,"time":6,"panic":2,"selection":3}'::jsonb,
   'First mock. Ran out of time in DILR — only 14 questions. Set selection practice needed.',
   'IMS','SimCAT 1','2026-06-05'),
  (v_priya,'2026-06-12','2026-06-12',68.0,
   '{"attempted":22,"correct":14,"time_min":40,"percentile":67}'::jsonb,
   '{"attempted":16,"correct":9,"time_min":40,"percentile":63}'::jsonb,
   '{"attempted":20,"correct":11,"time_min":40,"percentile":66}'::jsonb,
   '{"conceptual":4,"silly":4,"time":5,"panic":2,"selection":3}'::jsonb,
   'Slightly better. Time improving. Conceptual errors in QA still there — revisit fundamentals.',
   'TIME','AIMCAT 1','2026-06-12')
ON CONFLICT (student_id, log_date) DO UPDATE SET
  taken_on          = EXCLUDED.taken_on,
  overall_percentile= EXCLUDED.overall_percentile,
  varc = EXCLUDED.varc, dilr = EXCLUDED.dilr, qa = EXCLUDED.qa,
  error_buckets     = EXCLUDED.error_buckets,
  strategy_note     = EXCLUDED.strategy_note,
  provider = EXCLUDED.provider, mock_name = EXCLUDED.mock_name, mock_date = EXCLUDED.mock_date;

-- =============================================================
-- 10. MOCK DEBRIEFS — ROHAN (thriving, 3 mocks — 92%ile range)
-- =============================================================
INSERT INTO public.mock_debriefs
  (student_id, taken_on, log_date, overall_percentile, varc, dilr, qa,
   error_buckets, strategy_note, provider, mock_name, mock_date)
VALUES
  (v_rohan,'2026-05-25','2026-05-25',88.0,
   '{"attempted":26,"correct":19,"time_min":40,"percentile":87}'::jsonb,
   '{"attempted":20,"correct":14,"time_min":40,"percentile":86}'::jsonb,
   '{"attempted":24,"correct":17,"time_min":40,"percentile":90}'::jsonb,
   '{"conceptual":2,"silly":3,"time":1,"panic":0,"selection":1}'::jsonb,
   'Strong session. QA near-perfect. VARC RC speed is the only issue.','TIME','AIMCAT 1','2026-05-25'),
  (v_rohan,'2026-06-05','2026-06-05',91.0,
   '{"attempted":27,"correct":21,"time_min":40,"percentile":90}'::jsonb,
   '{"attempted":22,"correct":15,"time_min":40,"percentile":89}'::jsonb,
   '{"attempted":26,"correct":19,"time_min":40,"percentile":93}'::jsonb,
   '{"conceptual":1,"silly":2,"time":1,"panic":0,"selection":1}'::jsonb,
   'Consistent. QA 93%ile. Holding the band.','IMS','SimCAT 2','2026-06-05'),
  (v_rohan,'2026-06-12','2026-06-12',92.0,
   '{"attempted":27,"correct":21,"time_min":40,"percentile":91}'::jsonb,
   '{"attempted":22,"correct":16,"time_min":40,"percentile":90}'::jsonb,
   '{"attempted":26,"correct":20,"time_min":40,"percentile":94}'::jsonb,
   '{"conceptual":1,"silly":1,"time":0,"panic":0,"selection":1}'::jsonb,
   'Locked in. IIM-A needs 95+. Two more weeks of this.','TIME','AIMCAT 2','2026-06-12')
ON CONFLICT (student_id, log_date) DO UPDATE SET
  taken_on          = EXCLUDED.taken_on,
  overall_percentile= EXCLUDED.overall_percentile,
  varc = EXCLUDED.varc, dilr = EXCLUDED.dilr, qa = EXCLUDED.qa,
  error_buckets     = EXCLUDED.error_buckets,
  strategy_note     = EXCLUDED.strategy_note,
  provider = EXCLUDED.provider, mock_name = EXCLUDED.mock_name, mock_date = EXCLUDED.mock_date;

-- =============================================================
-- 11. MOCK DEBRIEFS — MEERA (2 mocks, slight decline)
-- =============================================================
INSERT INTO public.mock_debriefs
  (student_id, taken_on, log_date, overall_percentile, varc, dilr, qa,
   error_buckets, strategy_note, provider, mock_name, mock_date)
VALUES
  (v_meera,'2026-05-28','2026-05-28',73.0,
   '{"attempted":22,"correct":14,"time_min":40,"percentile":72}'::jsonb,
   '{"attempted":18,"correct":10,"time_min":40,"percentile":68}'::jsonb,
   '{"attempted":20,"correct":12,"time_min":40,"percentile":70}'::jsonb,
   '{"conceptual":4,"silly":5,"time":4,"panic":2,"selection":3}'::jsonb,
   'QA arithmetic errors keep repeating. Need targeted silly-error drill.','TIME','AIMCAT 1','2026-05-28'),
  (v_meera,'2026-06-05','2026-06-05',71.0,
   '{"attempted":21,"correct":13,"time_min":40,"percentile":70}'::jsonb,
   '{"attempted":16,"correct":8,"time_min":40,"percentile":63}'::jsonb,
   '{"attempted":19,"correct":11,"time_min":40,"percentile":68}'::jsonb,
   '{"conceptual":4,"silly":6,"time":5,"panic":3,"selection":4}'::jsonb,
   'Dropped slightly. Missed several days before mock. Correlation worth noting.','IMS','SimCAT 1','2026-06-05')
ON CONFLICT (student_id, log_date) DO UPDATE SET
  taken_on          = EXCLUDED.taken_on,
  overall_percentile= EXCLUDED.overall_percentile,
  varc = EXCLUDED.varc, dilr = EXCLUDED.dilr, qa = EXCLUDED.qa,
  error_buckets     = EXCLUDED.error_buckets,
  strategy_note     = EXCLUDED.strategy_note,
  provider = EXCLUDED.provider, mock_name = EXCLUDED.mock_name, mock_date = EXCLUDED.mock_date;

-- =============================================================
-- 12. BUDDY FEEDBACK (text notes — reach-ins, weeklies, alert)
-- =============================================================
INSERT INTO public.buddy_feedback
  (buddy_id, student_id, feedback_date, feedback_text, feedback_type, rating, period_covered, next_steps)
VALUES
  -- Aarav: Day 10 reach-in (May 25)
  (v_nishant, v_aarav, '2026-05-25',
   'Aarav — haven''t seen a log in 3 days. That''s your dip talking, not your potential. Log tomorrow, even 1 hour. The streak rebuilds. The momentum has to restart consciously.',
   'buddy_note', 4, 'adhoc', ARRAY['Log tomorrow, even 1 hour']),
  -- Aarav: After Mock 3 (Jun 8)
  (v_nishant, v_aarav, '2026-06-08',
   'Aarav — 85%ile on Cracku. That''s 3 consecutive mock improvements. Silly errors: 8 → 3. Selection errors: 7 → 2. DILR jumped 17 points in %ile. The work is showing. Two more weeks of this and IIM-B territory is real. Keep the daily log going — that''s the root of all of this.',
   'buddy_note', 5, 'weekly', ARRAY['Continue daily log','Focus QA accuracy in closing section']),
  -- Priya: After Mock 1 (Jun 5)
  (v_nishant, v_priya, '2026-06-05',
   'Priya — 65%ile on your first mock ever is a baseline, not a ceiling. Every 90%ile taker started around here. The DILR time issue is fixable with 2 weeks of dedicated set-selection practice — 10 min to pick, 30 min to solve. You''re building the habit; that''s the hard part and you''re doing it.',
   'buddy_note', 4, 'adhoc', ARRAY['DILR set-selection practice daily','Time yourself: 8 min decision window per set']),
  -- Priya: Weekly (Jun 12)
  (v_nishant, v_priya, '2026-06-12',
   'Priya — mock 2 at 68%ile, up from 65. The consistency streak (10 days with 1 miss) is your actual edge. Other students do 3 on, 4 off. You''re building the compound effect. Keep it up.',
   'buddy_note', 4, 'weekly', ARRAY['Maintain daily logging','Add one mock-set analysis per day']),
  -- Meera: Alert note (Jun 9, after 4-day gap)
  (v_nishant, v_meera, '2026-06-09',
   'Meera — 4 days without a log. What''s happening? Just reply when you see this. The mock trend is flattening and the gap will compound if we don''t address it now.',
   'buddy_note', 3, 'adhoc', ARRAY['Resume daily logs','Reply to this note']);

-- =============================================================
-- 13. CHAT MESSAGES (Nishant ↔ Aarav and Nishant ↔ Priya)
-- =============================================================
INSERT INTO public.chat_messages
  (student_id, buddy_id, sender_id, body, created_at, read_at)
VALUES
  -- Nishant → Aarav (Day 10 reach-in, May 25)
  (v_aarav, v_nishant, v_nishant,
   'Aarav, haven''t seen a log in 3 days. Everything okay? DM me if you want to talk.',
   '2026-05-25 18:30:00+00', '2026-05-25 22:15:00+00'),
  (v_aarav, v_nishant, v_aarav,
   'Been feeling low after that mock. Lost motivation honestly.',
   '2026-05-25 22:20:00+00', '2026-05-25 22:25:00+00'),
  (v_aarav, v_nishant, v_nishant,
   'That''s normal after a tough mock. But disappearing is how the dip gets worse. Log tomorrow, even 1 hour. Small restart.',
   '2026-05-25 22:28:00+00', '2026-05-25 22:45:00+00'),
  -- Aarav returns (May 26)
  (v_aarav, v_nishant, v_aarav,
   'Logged today. 3 hours. Thanks for checking in.',
   '2026-05-26 21:00:00+00', '2026-05-26 21:10:00+00'),
  -- After Mock 3 (Jun 8)
  (v_aarav, v_nishant, v_nishant,
   '85%ile on Cracku. That''s the trajectory. Three more weeks of this and you''re IIM-B territory.',
   '2026-06-08 20:00:00+00', '2026-06-08 20:30:00+00'),
  -- After Mock 4 (Jun 13)
  (v_aarav, v_nishant, v_aarav,
   '87 today 🙏',
   '2026-06-13 19:45:00+00', '2026-06-13 20:00:00+00'),
  (v_aarav, v_nishant, v_nishant,
   'Consistent. Keep the head down.',
   '2026-06-13 20:05:00+00', '2026-06-13 20:15:00+00'),

  -- Nishant ↔ Priya
  (v_priya, v_nishant, v_nishant,
   'First mock is always the hardest. 65%ile is a baseline, not a ceiling. Keep the daily logs coming.',
   '2026-06-05 20:00:00+00', '2026-06-05 20:45:00+00'),
  (v_priya, v_nishant, v_priya,
   'I know. Just felt overwhelmed in DILR — ran out of time completely.',
   '2026-06-05 20:50:00+00', '2026-06-05 21:00:00+00'),
  (v_priya, v_nishant, v_nishant,
   'DILR time is fixable. Commit 10 min to picking sets, 30 min to solving. Practice that rhythm every day.',
   '2026-06-05 21:05:00+00', '2026-06-05 21:20:00+00'),
  (v_priya, v_nishant, v_nishant,
   '68 on mock 2. Moving up. The time management will come with reps.',
   '2026-06-12 20:00:00+00', '2026-06-12 20:30:00+00'),
  -- Priya: recent unread (creates badge for Nishant's inbox)
  (v_priya, v_nishant, v_priya,
   'Logging every day feels easier now. Really glad I started this.',
   '2026-06-14 21:00:00+00', NULL);

-- =============================================================
-- 14. VIDEO SESSIONS
-- =============================================================
INSERT INTO public.video_sessions
  (student_id, buddy_id, session_status, session_type, duration_minutes,
   scheduled_at, started_at, ended_at, title, notes)
VALUES
  -- Completed: Aarav + Nishant (Jun 2, post-recovery check-in)
  (v_aarav, v_nishant, 'completed', 'review', 30,
   '2026-06-02 18:00:00+00', '2026-06-02 18:02:00+00', '2026-06-02 18:37:00+00',
   'Post-Recovery Check-in',
   'Covered the May 22 mock dip and 3-day gap. Agreed on DILR set-selection drill: 3 sets per day at fixed time. Aarav re-energized.'),
  -- Upcoming scheduled: Priya + Nishant (Jun 18)
  (v_priya, v_nishant, 'scheduled', 'session', 30,
   '2026-06-18 18:00:00+00', NULL, NULL,
   'Mock 2 Review & DILR Strategy',
   'Review SimCAT errors. Build a DILR set-selection framework for the next 2 weeks.');

-- =============================================================
-- 15. SESSION REQUESTS
-- =============================================================
INSERT INTO public.session_requests (student_id, buddy_id, message, status)
VALUES
  (v_priya, v_nishant,
   'Can we review my mock 2 DILR errors together before the next mock? Not sure where I''m going wrong on set selection.',
   'pending');

-- =============================================================
-- 16. STREAK DATA
-- =============================================================
INSERT INTO public.streak_data (student_id, current_streak, longest_streak, last_log_date, milestone_sent_7, milestone_sent_21)
VALUES
  (v_aarav,  20, 20, '2026-06-14', TRUE,  FALSE),
  (v_priya,   7, 10, '2026-06-14', TRUE,  FALSE),
  (v_rohan,  18, 18, '2026-06-14', TRUE,  FALSE),
  (v_meera,   0, 10, '2026-06-05', TRUE,  FALSE),
  (v_arjun,   2,  2, '2026-06-14', FALSE, FALSE)
ON CONFLICT (student_id) DO UPDATE SET
  current_streak  = EXCLUDED.current_streak,
  longest_streak  = EXCLUDED.longest_streak,
  last_log_date   = EXCLUDED.last_log_date,
  milestone_sent_7= EXCLUDED.milestone_sent_7,
  milestone_sent_21=EXCLUDED.milestone_sent_21;

-- =============================================================
-- 17. STREAK SHIELDS (Aarav: Jun 11 rest day, buddy-granted)
-- =============================================================
INSERT INTO public.streak_shields (student_id, used_on, granted_by, reason)
VALUES (v_aarav, '2026-06-11', v_nishant, 'buddy_granted')
ON CONFLICT (student_id, used_on) DO NOTHING;

-- =============================================================
-- 18. RECOVERY EVENTS (Aarav: returned May 26 after 3-day gap)
-- =============================================================
INSERT INTO public.recovery_events (student_id, missed_days, previous_streak, recovered_at)
VALUES (v_aarav, 3, 7, '2026-05-26 12:00:00+00');

-- =============================================================
-- 19. MOCK DROP ALERTS
-- =============================================================
INSERT INTO public.mock_drop_alerts (student_id, triggered_at, drop_amount, buddy_notified, student_seen)
VALUES
  (v_aarav, '2026-05-23 00:05:00+00', 7,  TRUE,  TRUE),
  (v_meera, '2026-06-08 00:05:00+00', 2,  TRUE,  FALSE);

-- =============================================================
-- 20. BUDDY PAYOUTS (Nishant's earnings history)
-- =============================================================
INSERT INTO public.buddy_payouts
  (buddy_id, period, agreed_amount, active_student_count, status, paid_date, payment_ref)
VALUES
  (v_nishant, '2026-05', 3000, 2, 'paid',    '2026-06-05', 'UPI-DEMO-MAY26'),
  (v_nishant, '2026-06', 6000, 4, 'pending', NULL,          NULL)
ON CONFLICT (buddy_id, period) DO UPDATE SET
  agreed_amount       = EXCLUDED.agreed_amount,
  active_student_count= EXCLUDED.active_student_count,
  status              = EXCLUDED.status,
  paid_date           = EXCLUDED.paid_date,
  payment_ref         = EXCLUDED.payment_ref;

-- =============================================================
-- 21. BUDDY BRIEFINGS (Cached AI briefing for Aarav — facts only)
-- =============================================================
INSERT INTO public.buddy_briefings (student_id, buddy_id, summary_text, source, generated_at)
VALUES
  (v_aarav, v_nishant,
   'Aarav Sharma — 30 days tracked. 27 of 30 logged (90%). 3-day gap May 23–25. ' ||
   'Study duration: Days 1–7 avg 4.6 h; Days 11–30 avg 4.1 h. ' ||
   'Mock arc: 79%ile (May 22) → 82%ile (Jun 1) → 85%ile (Jun 8) → 87%ile (Jun 13) — 4 consecutive upward data points. ' ||
   'Error-bucket trend (mock 1 vs mock 4): silly 8→2, selection 7→1, time 4→1, panic 2→1, conceptual 3→2. ' ||
   'Section %ile arc across 4 mocks: VARC 72→86, DILR 63→84, QA 75→88. ' ||
   'Current streak 20 days. Best streak 20 days. 1 recovery event (May 26, 3-day gap). 1 streak shield used (Jun 11, buddy-granted). ' ||
   '— worth exploring why DILR (63→84) is outpacing QA (75→88) at this rate.',
   'ai', '2026-06-14 20:00:00+00')
ON CONFLICT (student_id, buddy_id) DO UPDATE SET
  summary_text = EXCLUDED.summary_text,
  source       = EXCLUDED.source,
  generated_at = EXCLUDED.generated_at;

-- =============================================================
-- 22. STUDENT PAYMENTS (admin view — demo billing records)
-- =============================================================
INSERT INTO public.student_payments (student_id, amount, plan, status, paid_at)
VALUES
  (v_aarav,  299900, '3-month', 'paid', '2026-04-15 10:00:00+00'),
  (v_priya,  299900, '3-month', 'paid', '2026-05-28 10:00:00+00'),
  (v_rohan,  499900, '6-month', 'paid', '2026-04-01 10:00:00+00'),
  (v_meera,  299900, '3-month', 'paid', '2026-05-27 10:00:00+00');

-- =============================================================
-- 23. SCHOLARSHIPS (admin demo — one active discount)
-- =============================================================
INSERT INTO public.scholarships
  (student_id, discount_percent, reason, granted_by, status, expires_at)
VALUES
  (v_meera, 20,
   'Consistency support grant — first 30 days retention initiative',
   v_admin, 'active', '2026-09-30 00:00:00+00');

-- =============================================================
-- 24. COUPONS (admin demo — two sample codes)
-- =============================================================
INSERT INTO public.coupons
  (code, discount_type, discount_value, max_uses, used_count, status, created_by)
VALUES
  ('DEMO2026',   'percent', 15, 10, 2, 'active', v_admin),
  ('EARLYBIRD50','flat',   500, 20, 7, 'active', v_admin)
ON CONFLICT (code) DO NOTHING;

-- =============================================================
-- 25. STUDENT ALLOWLIST (admin view)
-- =============================================================
INSERT INTO public.student_allowlist
  (email, full_name, assigned_buddy_id, status)
VALUES
  ('aarav@careerrai.com',  'Aarav Sharma',  v_nishant, 'active'),
  ('priya@careerrai.com',  'Priya Kapoor',  v_nishant, 'active'),
  ('rohan@careerrai.com',  'Rohan Patel',   v_nishant, 'active'),
  ('meera@careerrai.com',  'Meera Patel',   v_nishant, 'active'),
  ('arjun@careerrai.com',  'Arjun Singh',   v_nishant, 'active')
ON CONFLICT (email) DO UPDATE SET
  full_name          = EXCLUDED.full_name,
  assigned_buddy_id  = EXCLUDED.assigned_buddy_id;

END $$;
