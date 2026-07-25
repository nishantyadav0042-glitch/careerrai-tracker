-- ── One definition of "the study day" ───────────────────────────────────────
--
-- The app's day boundary is 3am IST (streak-utils getLogDateString): a student
-- logging at 1am is closing YESTERDAY's study, not opening today's. Our own
-- usage data is why — 22:00–04:00 is the single busiest block we have (peak
-- opens at 22:00, log completion 53–60% after 22:00 vs 20% at 13:00), so a
-- midnight boundary would cut our most engaged students' sessions in half at
-- their most engaged hour. 03:00–05:00 is the day's dead zone (7–23 events/hr)
-- — the correct place for a boundary is where the students aren't.
--
-- topic_evidence.logged_for originally defaulted to plain IST midnight — a
-- SECOND day definition, one clone away from the streak bug class. The app
-- always passes logged_for explicitly (getLogDateString), so this default is
-- only a safety net for direct inserts — but a safety net that disagrees with
-- the system it backs is worse than none.
--
-- (now IST − 3h)::date is exactly the 3am rule: 02:30 IST → yesterday,
-- 03:30 IST → today.

alter table public.topic_evidence
  alter column logged_for
  set default ((now() at time zone 'Asia/Kolkata') - interval '3 hours')::date;
