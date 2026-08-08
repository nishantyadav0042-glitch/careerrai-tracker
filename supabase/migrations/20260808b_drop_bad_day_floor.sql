-- The bad-day floor: added and removed on the same day, 8 Aug 2026.
--
-- It asked a student at signup to predict, three weeks in advance, how bad
-- their worst day would be — and then fought with study_target_hours over
-- which of the two sized the daily plan. That fight produced both of the day's
-- real defects: a student who answered "6 hours" was handed a 30-minute plan
-- (330 unplanned minutes), and the signup screen promised "three taps" while
-- asking five. Two numbers for one job is how a codebase lies.
--
-- Founder: drop the floor button; put one simple thing in its place — a busy
-- day. A heavy day is now REPORTED when it happens rather than predicted at
-- signup: today's topics are postponed and the finish date moves one day, for
-- CareerRai-plan students only. See api/routine/busy-day and lib/busy-day.
--
-- Verified before dropping: 0 of 274 rows carried a value in either column.
-- The forward migration (20260808a) is deleted rather than kept alongside this
-- one — a column that existed for six hours and never held data is noise in
-- the history, not a record worth preserving.
alter table profiles
  drop column if exists bad_day_floor_minutes,
  drop column if exists bad_day_floor_set_at;
