-- Single-sheet daily log (24 Jul): when a student marks "couldn't finish"
-- today's plan, capture WHY (college / office / travel / health / family /
-- procrastination / mock_ran_long / plan_too_heavy / other) so tomorrow's plan
-- can adapt instead of blindly repeating. Additive + nullable — safe for every
-- existing row. (confidence + plan_fit columns already existed on this table.)
alter table public.daily_reports add column if not exists blocker_reason text;
