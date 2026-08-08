-- Stage A (founder, 8 Aug): the bad-day floor.
--
-- WHY: signup hours proved to be fantasy — students chose 11–15h/day, did
-- 2–6h, and the oversized plan stood as daily proof of failure until they
-- left (churn cohort, 8 Aug: top product-caused blocker = "plan too heavy").
-- The floor is the number the daily plan is BUILT to: "on a bad day, how much
-- can you still do?" 15/30/60/120 minutes. The target hours column stays for
-- pace/finish-date math and is asked later, once the student has felt one
-- winnable day.
--
-- Nullable on purpose: null = account predates the floor → plan behaves
-- exactly as before. No backfill; old students feel nothing until they choose.
--
-- NOTE: written to the branch on 8 Aug; apply to the live DB only when Stage A
-- ships (branch-only rule — a column nobody reads is harmless, but the rule
-- is the rule).

alter table profiles
  add column if not exists bad_day_floor_minutes integer
    check (bad_day_floor_minutes in (15, 30, 60, 120)),
  add column if not exists bad_day_floor_set_at timestamptz;

comment on column profiles.bad_day_floor_minutes is
  'Stage A: minutes the daily plan is built to — the student''s own bad-day minimum. Written ONLY via lib/daily-hours.ts setBadDayFloor(). Null = pre-floor account, hours-based planning unchanged.';
