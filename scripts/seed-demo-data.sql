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
  dream_colleges      = ARRAY['IIM Ahmedabad','IIM Bangalore','IIM Calcutta'],
  is_repeater         = TRUE,
  starting_percentile = 79,
  hours_available     = 8,
  onboarding_completed= TRUE,
  buddy_id            = v_nishant,
  cat_percentile      = 94.00,
  current_streak      = 20,
  best_streak         = 20,
  last_log_date       = '2026-06-14',
  total_logs_completed= 27,
  study_target_hours  = 6,
  subscription_status = 'active',
  avatar_seed         = 'aarav-sharma'
WHERE id = v_aarav;

UPDATE public.profiles SET
  is_demo             = TRUE,
  full_name           = 'Priya Kapoor',
  role                = 'student',
  exam_target         = 'CAT',
  dream_colleges      = ARRAY['IIM Bangalore','IIM Calcutta','IIM Indore'],
  is_repeater         = FALSE,
  starting_percentile = NULL,
  hours_available     = 4,
  onboarding_completed= TRUE,
  buddy_id            = v_nishant,
  cat_percentile      = 74.00,
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
  college             = 'IIM Ahmedabad',
  cat_percentile      = 99.70,
  buddy_bio           = E'CAT 2022 — 99.7%ile → IIM Ahmedabad. Placed at Bain & Company.\n\nI failed once at 81%ile. Spent 8 months reverse-engineering exactly why before my second attempt. That''s why I''m good at this — I''ve lived the stall.\n\nI take 4 students per batch and work on what actually moves the needle: error patterns, time allocation, and the mental game. Not cheerleading. Not generic advice.\n\n3 of my last 4 students crossed 98%ile. The fourth crossed 95%ile. All were repeaters stuck between 80–88%ile before we started.',
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
  cat_percentile      = 97.00,
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
-- 8. MOCK DEBRIEFS — AARAV (4 mocks, 79→85→91→94%ile arc)
-- Error total: 31 → 20 → 9 → 5 (84% reduction in 22 days)
-- =============================================================
INSERT INTO public.mock_debriefs
  (student_id, taken_on, log_date, overall_percentile, varc, dilr, qa,
   error_buckets, strategy_note, provider, mock_name, mock_date)
VALUES
  -- Mock 1 (May 22): the crash — 79%ile, 31 total errors
  (v_aarav,'2026-05-22','2026-05-22',79.0,
   '{"attempted":22,"correct":14,"time_min":40,"percentile":74}'::jsonb,
   '{"attempted":16,"correct":8,"time_min":40,"percentile":65}'::jsonb,
   '{"attempted":20,"correct":11,"time_min":40,"percentile":76}'::jsonb,
   '{"conceptual":4,"silly":10,"time":6,"panic":4,"selection":7}'::jsonb,
   'Left 24 marks on the table in DILR alone. Picked wrong sets, burned 18 minutes on unfeasible ones. Not a knowledge problem — a selection problem. QA: 10 silly errors in closing 20 minutes. Panic-solving.',
   'TIME','AIMCAT 1','2026-05-22'),
  -- Mock 2 (Jun 1): 85%ile — selection fix pays off (+6, 20 errors)
  (v_aarav,'2026-06-01','2026-06-01',85.0,
   '{"attempted":24,"correct":17,"time_min":40,"percentile":82}'::jsonb,
   '{"attempted":19,"correct":12,"time_min":40,"percentile":78}'::jsonb,
   '{"attempted":23,"correct":15,"time_min":40,"percentile":84}'::jsonb,
   '{"conceptual":3,"silly":6,"time":4,"panic":3,"selection":4}'::jsonb,
   'Set selection worked — DILR jumped 13 points. QA arithmetic slips (6) still from rushing the closing segment. Need 8-min alarm before QA ends: stop solving, verify last 3.',
   'IMS','SimCAT 1','2026-06-01'),
  -- Mock 3 (Jun 8): 91%ile — pacing fix, DILR at 89%ile (9 errors)
  (v_aarav,'2026-06-08','2026-06-08',91.0,
   '{"attempted":26,"correct":19,"time_min":40,"percentile":88}'::jsonb,
   '{"attempted":21,"correct":15,"time_min":40,"percentile":89}'::jsonb,
   '{"attempted":24,"correct":17,"time_min":40,"percentile":91}'::jsonb,
   '{"conceptual":2,"silly":2,"time":2,"panic":1,"selection":2}'::jsonb,
   'QA pacing fix worked — silly errors 6→2. DILR at 89%ile. Error total: 31→9 across 3 mocks. VARC RC accuracy 78% is the one gap: reading for comprehension not answer locations.',
   'Cracku','Full Mock 1','2026-06-08'),
  -- Mock 4 (Jun 13): 94%ile — IIM-A range (5 errors total)
  (v_aarav,'2026-06-13','2026-06-13',94.0,
   '{"attempted":27,"correct":21,"time_min":40,"percentile":92}'::jsonb,
   '{"attempted":22,"correct":16,"time_min":40,"percentile":91}'::jsonb,
   '{"attempted":25,"correct":19,"time_min":40,"percentile":93}'::jsonb,
   '{"conceptual":1,"silly":1,"time":1,"panic":1,"selection":1}'::jsonb,
   'VARC went 74→92%ile — RC location technique confirmed. Error total: 31, 20, 9, 5. Linear reduction every mock. Gap to 99: 2–3 DILR sets unattempted per mock (12–15 marks). Guess at +3/-1 beats 0.',
   'TIME','AIMCAT 2','2026-06-13')
ON CONFLICT (student_id, log_date) DO UPDATE SET
  taken_on          = EXCLUDED.taken_on,
  overall_percentile= EXCLUDED.overall_percentile,
  varc = EXCLUDED.varc, dilr = EXCLUDED.dilr, qa = EXCLUDED.qa,
  error_buckets     = EXCLUDED.error_buckets,
  strategy_note     = EXCLUDED.strategy_note,
  provider = EXCLUDED.provider, mock_name = EXCLUDED.mock_name, mock_date = EXCLUDED.mock_date;

-- =============================================================
-- 9. MOCK DEBRIEFS — PRIYA (2 mocks, 62→74%ile, +12 jump)
-- =============================================================
INSERT INTO public.mock_debriefs
  (student_id, taken_on, log_date, overall_percentile, varc, dilr, qa,
   error_buckets, strategy_note, provider, mock_name, mock_date)
VALUES
  (v_priya,'2026-06-05','2026-06-05',62.0,
   '{"attempted":20,"correct":11,"time_min":40,"percentile":60}'::jsonb,
   '{"attempted":14,"correct":6,"time_min":40,"percentile":52}'::jsonb,
   '{"attempted":18,"correct":10,"time_min":40,"percentile":58}'::jsonb,
   '{"conceptual":6,"silly":5,"time":7,"panic":3,"selection":4}'::jsonb,
   'First mock. DILR disaster — only 14 questions, ran out of time. 7 errors from pure time panic. Set selection and DILR timing are the immediate priority.',
   'IMS','SimCAT 1','2026-06-05'),
  (v_priya,'2026-06-12','2026-06-12',74.0,
   '{"attempted":23,"correct":16,"time_min":40,"percentile":72}'::jsonb,
   '{"attempted":18,"correct":11,"time_min":40,"percentile":67}'::jsonb,
   '{"attempted":21,"correct":13,"time_min":40,"percentile":70}'::jsonb,
   '{"conceptual":4,"silly":4,"time":4,"panic":2,"selection":3}'::jsonb,
   'Up 12 points in one mock cycle. DILR from 52 to 67%ile — set selection drill worked. Time errors halved. Conceptual gaps in QA still there. Foundation work is paying off.',
   'TIME','AIMCAT 1','2026-06-12')
ON CONFLICT (student_id, log_date) DO UPDATE SET
  taken_on          = EXCLUDED.taken_on,
  overall_percentile= EXCLUDED.overall_percentile,
  varc = EXCLUDED.varc, dilr = EXCLUDED.dilr, qa = EXCLUDED.qa,
  error_buckets     = EXCLUDED.error_buckets,
  strategy_note     = EXCLUDED.strategy_note,
  provider = EXCLUDED.provider, mock_name = EXCLUDED.mock_name, mock_date = EXCLUDED.mock_date;

-- =============================================================
-- 10. MOCK DEBRIEFS — ROHAN (thriving, 91→95→97%ile)
-- =============================================================
INSERT INTO public.mock_debriefs
  (student_id, taken_on, log_date, overall_percentile, varc, dilr, qa,
   error_buckets, strategy_note, provider, mock_name, mock_date)
VALUES
  (v_rohan,'2026-05-25','2026-05-25',91.0,
   '{"attempted":26,"correct":20,"time_min":40,"percentile":89}'::jsonb,
   '{"attempted":22,"correct":15,"time_min":40,"percentile":88}'::jsonb,
   '{"attempted":26,"correct":19,"time_min":40,"percentile":92}'::jsonb,
   '{"conceptual":2,"silly":2,"time":1,"panic":0,"selection":1}'::jsonb,
   'Strong baseline. QA 92%ile. VARC RC speed is the one ceiling.','TIME','AIMCAT 1','2026-05-25'),
  (v_rohan,'2026-06-05','2026-06-05',95.0,
   '{"attempted":27,"correct":21,"time_min":40,"percentile":93}'::jsonb,
   '{"attempted":23,"correct":17,"time_min":40,"percentile":92}'::jsonb,
   '{"attempted":26,"correct":20,"time_min":40,"percentile":96}'::jsonb,
   '{"conceptual":1,"silly":2,"time":0,"panic":0,"selection":1}'::jsonb,
   'IIM-A range. QA 96%ile. VARC RC speed fixed. Errors down to 4 total.','IMS','SimCAT 2','2026-06-05'),
  (v_rohan,'2026-06-12','2026-06-12',97.0,
   '{"attempted":27,"correct":22,"time_min":40,"percentile":95}'::jsonb,
   '{"attempted":24,"correct":18,"time_min":40,"percentile":94}'::jsonb,
   '{"attempted":27,"correct":21,"time_min":40,"percentile":98}'::jsonb,
   '{"conceptual":1,"silly":1,"time":0,"panic":0,"selection":0}'::jsonb,
   'QA 98%ile. Errors: 2. Hold this for 3 more mocks and the calls start coming.','TIME','AIMCAT 2','2026-06-12')
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
-- 12. BUDDY FEEDBACK (expert, data-driven coaching notes)
-- =============================================================
INSERT INTO public.buddy_feedback
  (buddy_id, student_id, feedback_date, feedback_text, feedback_type, rating, period_covered, next_steps)
VALUES
  -- Aarav: Day 10 reach-in (May 25) — precise diagnosis, not comfort
  (v_nishant, v_aarav, '2026-05-25',
   E'Aarav — 3-day gap. I get it. That 79%ile after a 6-day streak hurts.\n\nBut here''s the thing: I pulled your mock data. You didn''t fail. You mis-selected sets in DILR and burned 18 minutes on two unfeasible ones. That''s not a skills problem — that''s a one-change fix. The score doesn''t reflect where your ceiling actually is.\n\nLog tomorrow. Doesn''t need to be 6 hours. Log 90 minutes of DILR set-selection drills — 8 sets, pick 2, move on. We''re not rebuilding. We''re correcting one thing.',
   'buddy_note', 5, 'adhoc', ARRAY['Log tomorrow — 90 min DILR set-selection only','8 sets, pick 2 in 10 min, solve for 30 min']),
  -- Aarav: After Mock 2 (Jun 1)
  (v_nishant, v_aarav, '2026-06-01',
   E'85%ile on SimCAT. +6 in 10 days. The DILR fix worked — went from 65 to 78%ile on set selection alone.\n\nNow the QA issue. You made 6 arithmetic slips in the last 20 minutes of QA. Look at the timestamps — they''re all in the final 8 minutes. You''re not making errors, you''re rushing when the clock shows sub-10 minutes.\n\nNext mock: set a silent alarm 8 minutes before QA ends. When it fires, don''t solve new questions. Verify the last 3 you did. That''s worth 6–9 marks.',
   'buddy_note', 5, 'weekly', ARRAY['Set 8-min alarm in QA for final verification','No new questions after alarm — only verify last 3']),
  -- Aarav: After Mock 3 (Jun 8) — the breakthrough
  (v_nishant, v_aarav, '2026-06-08',
   E'91%ile. That''s the real you.\n\nTotal errors went from 31 (mock 1) to 9 (this mock). In 3 weeks. DILR is at 89%ile — it was 65%ile when we started. You didn''t learn new concepts. You learned to pick the right sets and trust your timing.\n\nOne thing left before 99%ile: VARC RC. Your accuracy is 78%, your speed is fine. You''re reading for comprehension when you should be reading for question-type. Next week: 3 RC passages per day, mark the answer location before reading the question. Report back after 5 days.',
   'buddy_note', 5, 'weekly', ARRAY['3 RC passages per day — mark answer location first','Report accuracy % after 5 days']),
  -- Aarav: After Mock 4 (Jun 13) — final push
  (v_nishant, v_aarav, '2026-06-13',
   E'94%ile. VARC went from 74 to 92%ile in 3 weeks — RC location technique worked.\n\nError total across all 4 mocks: 31, 20, 9, 5. Linear reduction every single time.\n\nHere''s the gap between 94 and 99: you''re leaving 2–3 DILR sets completely unattempted at the end. That''s 12–15 marks. Not wrong answers — blank. In the next mock, attempt all sets even if it means 2 minutes per set at the end. A guess at +3/-1 is better than 0.\n\nYou have 3 weeks before the real attempt. The ceiling is 99. I don''t say that to most students.',
   'buddy_note', 5, 'weekly', ARRAY['Attempt all DILR sets — guess at +3/-1 beats 0','3-week final push: DILR completion + VARC accuracy']),
  -- Priya: After Mock 1 (Jun 5) — framed as opportunity
  (v_nishant, v_priya, '2026-06-05',
   E'Priya — 62%ile on your first mock is actually good data.\n\nYou left 7 DILR marks on the table from time panic alone — not wrong answers, just unattempted. Fix one thing: set-selection speed. Spend 8 minutes choosing your 2 DILR sets before solving anything. Right now you''re picking on the fly and it''s costing you 20 minutes.\n\nAlso: your QA accuracy when you did attempt was 55% — that''s a conceptual gap in arithmetic and algebra. I''m sending you a 2-week drill list. Fundamentals first.',
   'buddy_note', 4, 'adhoc', ARRAY['DILR: 8 min set-selection before solving — every session','QA: 2-week arithmetic + algebra fundamentals drill only']),
  -- Priya: After Mock 2 (Jun 12) — highlight +12 jump
  (v_nishant, v_priya, '2026-06-12',
   E'74%ile. Up 12 points in one mock cycle. That''s not luck — that''s the set-selection fix working exactly as expected.\n\nDILR went from 52 to 67%ile. VARC from 60 to 72%ile. You''re not where you want to be but you''re on the right trajectory — and you have 4 months left.\n\nThe students who reach 95%ile from here have one thing in common: they don''t stop logging. Not when life is busy, not when a mock goes badly. You''ve logged 17 of 18 days. Keep that.',
   'buddy_note', 5, 'weekly', ARRAY['Keep daily log — no exceptions','QA: equations and inequalities, next 2 weeks']),
  -- Meera: Alert note (Jun 9)
  (v_nishant, v_meera, '2026-06-09',
   E'Meera — 4 days without a log. Your mock trend went 73 → 71%ile between May and June, and those were days you were logging. When you stop logging, the trend won''t hold.\n\nI''m not going to send daily reminders — that''s not how this works. But I need you to make a decision: are you doing this seriously or not? If yes, log today. 1 hour minimum. If something is wrong, tell me and we''ll adjust the plan.',
   'buddy_note', 3, 'adhoc', ARRAY['Log today — 1 hour minimum','Reply with what''s getting in the way']);

-- =============================================================
-- 13. CHAT MESSAGES (Nishant ↔ Aarav and Nishant ↔ Priya)
-- =============================================================
INSERT INTO public.chat_messages
  (student_id, buddy_id, sender_id, body, created_at, read_at)
VALUES
  -- AARAV thread: the dip
  (v_aarav, v_nishant, v_nishant,
   'Aarav — 3 days. What''s happening.',
   '2026-05-25 18:30:00+00', '2026-05-25 22:10:00+00'),
  (v_aarav, v_nishant, v_aarav,
   'Honestly, lost motivation after that mock. 79%ile felt like proof I can''t do this.',
   '2026-05-25 22:15:00+00', '2026-05-25 22:20:00+00'),
  (v_aarav, v_nishant, v_nishant,
   '79%ile on a mock where you mis-selected 3 DILR sets and burned 18 minutes on unfeasible ones. That''s not your ceiling. That''s one fixable mistake. Log tomorrow — 90 minutes, DILR set selection only. Nothing else.',
   '2026-05-25 22:22:00+00', '2026-05-25 22:50:00+00'),
  (v_aarav, v_nishant, v_aarav,
   'Logged. 3 hours. Did 8 DILR sets — selection only, didn''t even solve most of them.',
   '2026-05-26 21:00:00+00', '2026-05-26 21:08:00+00'),
  (v_aarav, v_nishant, v_nishant,
   'Good. Do the same tomorrow. Selection is a muscle — it''s faster than learning new concepts and it''s what the mock 2 delta will come from.',
   '2026-05-26 21:12:00+00', '2026-05-26 21:30:00+00'),
  -- After Mock 2 (Jun 1)
  (v_aarav, v_nishant, v_aarav,
   '85%ile on SimCAT 🙏 DILR felt completely different.',
   '2026-06-01 20:30:00+00', '2026-06-01 20:35:00+00'),
  (v_aarav, v_nishant, v_nishant,
   'DILR went from 65 to 78%ile. That''s the selection fix. Now look at QA — your 6 arithmetic errors were all in the last 8 minutes. Set a silent alarm 8 min before QA ends. Stop solving, verify the last 3. That''s 6–9 marks sitting there.',
   '2026-06-01 20:40:00+00', '2026-06-01 21:00:00+00'),
  -- After Mock 3 (Jun 8) — 91%ile
  (v_aarav, v_nishant, v_aarav,
   '91%ile. I actually can''t believe this.',
   '2026-06-08 19:45:00+00', '2026-06-08 19:50:00+00'),
  (v_aarav, v_nishant, v_nishant,
   'Believe it — you went from 31 total errors on mock 1 to 9 on this one. DILR is at 89%ile. One gap left: VARC RC accuracy at 78%. Next 5 days: 3 RC passages daily, mark where the answer lives before reading the question. Report back.',
   '2026-06-08 19:55:00+00', '2026-06-08 20:15:00+00'),
  -- After Mock 4 (Jun 13) — 94%ile
  (v_aarav, v_nishant, v_aarav,
   '94. VARC felt completely different this time.',
   '2026-06-13 19:45:00+00', '2026-06-13 19:52:00+00'),
  (v_aarav, v_nishant, v_nishant,
   'VARC went from 74 to 92%ile. RC location technique, confirmed. Total errors across 4 mocks: 31, 20, 9, 5. The gap to 99: you''re leaving 2–3 DILR sets blank at the end — 12–15 marks. Attempt everything, even a guess. +3/-1 beats 0 every time. 3 weeks left. The ceiling is 99.',
   '2026-06-13 19:58:00+00', '2026-06-13 20:15:00+00'),

  -- PRIYA thread
  (v_priya, v_nishant, v_nishant,
   '62%ile on your first mock. Here''s what I see: 7 of your errors were from time panic, not wrong thinking. Fix set selection and that''s +8 points before you learn a single new concept.',
   '2026-06-05 20:00:00+00', '2026-06-05 20:40:00+00'),
  (v_priya, v_nishant, v_priya,
   'I froze completely in DILR. Just kept staring at the sets not knowing which to pick.',
   '2026-06-05 20:45:00+00', '2026-06-05 20:52:00+00'),
  (v_priya, v_nishant, v_nishant,
   'That freezing has a fix: 8 minutes, every time, before you solve anything. Scan all sets, mark the 2 easiest, start. Decision made in advance. Practice it every day — not just on mocks.',
   '2026-06-05 20:55:00+00', '2026-06-05 21:10:00+00'),
  (v_priya, v_nishant, v_priya,
   '74%ile on mock 2 😊 DILR actually went okay this time.',
   '2026-06-12 20:15:00+00', '2026-06-12 20:25:00+00'),
  (v_priya, v_nishant, v_nishant,
   'Up 12 points in one cycle. DILR from 52 to 67%ile — that''s the selection drill. You''ve logged 17 of 18 days. The students who reach 95%ile from here are the ones who don''t stop logging when life gets busy.',
   '2026-06-12 20:30:00+00', '2026-06-12 20:45:00+00'),
  -- Priya: recent unread (creates inbox badge for Nishant)
  (v_priya, v_nishant, v_priya,
   'Logged again today. I think I actually understand what I''m doing now.',
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
   E'Aarav Sharma — 30 days tracked. 27 of 30 logged (90%). 3-day gap May 23–25, fully recovered.\n\n'
   'Study hours: Pre-mock avg 5.8h/day. Post-recovery avg 5.4h/day.\n\n'
   'Mock arc (4 data points, 22 days):\n79%ile → 85%ile → 91%ile → 94%ile\n+15%ile total. All upward. No regression.\n\n'
   'Error-bucket reduction mock 1 → mock 4:\n• Silly: 10 → 1\n• Selection: 7 → 1\n• Time: 6 → 1\n• Panic: 4 → 1\n• Conceptual: 4 → 1\nTotal errors: 31 → 5 (84% reduction in 22 days).\n\n'
   'Section %ile arc:\n• VARC: 74 → 92 (+18)\n• DILR: 65 → 91 (+26)\n• QA: 76 → 93 (+17)\n\n'
   'DILR is the headline: 65 → 91%ile in 22 days. Pure set-selection drill — no new concepts learned.\n\n'
   'Gap to 99%ile: 2–3 DILR sets unattempted per mock (12–15 marks). That''s the only remaining unlock.',
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

-- =============================================================
-- 26. DEMO LOGIN CREDENTIALS
-- Clean usernames matching the login page demo buttons, plus a
-- known password so every demo account signs in via the staff
-- username/password form. (Students normally use email OTP, but
-- demo emails are unmonitored — username/password is the demo path.)
-- Password for ALL demo accounts: replace __SET_DEMO_PASSWORD__ below before
-- running. Never commit a real password to this PUBLIC repo.
-- =============================================================
UPDATE public.profiles SET username = 'aarav'   WHERE id = v_aarav;
UPDATE public.profiles SET username = 'priya'   WHERE id = v_priya;
UPDATE public.profiles SET username = 'nishant' WHERE id = v_nishant;
UPDATE public.profiles SET username = 'admin'   WHERE id = v_admin;
UPDATE public.profiles SET username = 'rohan'   WHERE id = v_rohan;
UPDATE public.profiles SET username = 'meera'   WHERE id = v_meera;
UPDATE public.profiles SET username = 'arjun'   WHERE id = v_arjun;

-- Reset passwords + confirm emails for all demo auth users.
-- Requires pgcrypto (enabled by default on Supabase).
UPDATE auth.users
SET encrypted_password = crypt('__SET_DEMO_PASSWORD__', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE id IN (v_aarav, v_priya, v_nishant, v_admin, v_rohan, v_meera, v_arjun);

END $$;
