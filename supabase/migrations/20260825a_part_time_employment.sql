-- ── employment_type stops being a label ─────────────────────────────────────
--
-- 20260824c_sales_rep_config.sql created this column with the comment:
--
--   "LABEL ONLY. No branch in any engine reads this: full-time and part-time
--    differ purely by their numbers, which is what makes 2 → 100 reps a
--    configuration change rather than an architectural one."
--
-- The second half of that sentence is still the architecture and is unchanged.
-- The first half described a gap, not a design: NOTHING required the numbers
-- to differ, so a part-time rep created through /api/admin/rep-config inherited
-- this table's defaults — Mon–Sat, 10:00–19:00, 50 active units, 15 new leads a
-- day. That is a full-time week wearing the word "part_time".
--
-- Worse, the ceiling itself did not bind. /api/admin/distribute-leads verified
-- `role in ('sales','admin')` and never read this table at all: not `active`,
-- not `unavailable_until`, not `max_capacity_units`. A rep configured for 12
-- units could be handed 250 leads in one click.
--
-- Founder decision, 25 Aug 2026: part-time is a real employment mode, so this
-- migration is where the schema stops describing it as decoration. NO STRUCTURE
-- CHANGES — every column, constraint and default is exactly as it was, and no
-- existing row is touched. What changes is the recorded MEANING, and the two
-- enforcement points now written against it in application code:
--
--   1. src/lib/sales-rep-provisioning.ts → checkEmploymentStatement()
--      A row may not ARRIVE at employment_type='part_time' unless the same
--      request states work_days, work_start_ist, work_end_ist,
--      max_capacity_units and max_new_per_day. CareerRai invents no part-time
--      defaults; the founder states the terms.
--
--   2. src/lib/sales-rep-provisioning.ts → repAllocationLimit()
--      Enforced by /api/admin/distribute-leads. A rep may be handed at most
--      min(available capacity, max_new_per_day) leads, and none at all while
--      inactive, on leave, over their ceiling, or unconfigured.
--
-- WHY THE RULE LIVES IN THE APPLICATION AND NOT IN A CHECK CONSTRAINT: the rule
-- is about a TRANSITION ("this write moves the row into part_time without
-- saying what part-time means"), and it is satisfiable by values that are
-- individually legal — a part-timer working 10:00–19:00 on two days is
-- perfectly valid, so no CHECK on the values themselves can express it. A
-- BEFORE UPDATE trigger could see old vs new, but could not distinguish
-- "explicitly restated the same number" from "inherited it", which is the whole
-- distinction. What makes the application a safe home for it here is that this
-- table has RLS enabled with ZERO policies (declared in 20260824c): anon and
-- authenticated cannot write it at all, so the service-role routes are not one
-- writer among many — they are the only writers that exist.
--
-- The guard sales-rep-provisioning.guard.test.ts pins that, by discovering the
-- writers of this table at test time rather than trusting a hardcoded list.

comment on column public.sales_rep_config.employment_type is
  'full_time | part_time. BEHAVIOURAL, not cosmetic: an account may not become part_time without stating work_days, work_start_ist, work_end_ist, max_capacity_units and max_new_per_day in the same write (lib/sales-rep-provisioning.ts checkEmploymentStatement), and the resulting ceiling binds at lead distribution (repAllocationLimit). There is deliberately no part-time default — inventing one would be inventing a quota.';

comment on column public.sales_rep_config.max_new_per_day is
  'Safety fuse on intake. Enforced PER DISTRIBUTION, not per day: lead_outreach has no assigned_at column until 2B-2, so how many leads a rep already received today is genuinely unmeasurable. It is a cap, never a claim about a day.';

comment on column public.sales_rep_config.work_days is
  'ISO weekday numbers, 1 = Monday. Governs the SLA clock and when contact is expected — deliberately NOT whether a rep may be given a lead. A part-time rep who works 18:00-21:00 still owns their book at 11:00; gating ownership on the hour would make part-time mean "worse rep" instead of "different hours".';

comment on table public.sales_rep_config is
  'Per-rep operational configuration, and the one authority on what employment type MEANS. Capacity is measured in units of ACTIVE WORK (see lib/sales-capacity.ts), never in owned relationships: a healthy retained student stays owned but consumes nothing. There is no second staff table — auth.users -> profiles(role=sales) -> this row is the whole model.';
