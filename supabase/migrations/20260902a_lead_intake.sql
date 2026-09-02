-- ── Daily lead intake (Phase 2B-3, the engine) ──────────────────────────────
--
-- Founder, 2 Sep 2026: "are new students being added to the salesmen's lists
-- daily?" Verified in production: no. 124 lead_outreach rows, unchanged since
-- the manual enrolment on 29 Aug; 916 real students had never entered any
-- book, 172 of them signed up in the previous seven days. Nothing ran daily.
--
-- Two schema changes make the intake engine measurable and honest:
--
-- 1. lead_outreach.enrolled_at — WHEN a student entered a book. Distinct from
--    assigned_at, which starts the first-contact SLA clock and is deliberately
--    left NULL on backlog enrolments (see enrol-book route header). Without
--    enrolled_at, "how many new students did this rep receive today" was
--    unmeasurable, so the daily fuse (sales_rep_config.max_new_per_day,
--    Amendment 3 of the 2A architecture) could never bind, and the capacity
--    panel showed "New today —". Backfilled from updated_at for the 124
--    existing rows, which were all created by the 29 Aug enrolment.
--
-- 2. sales_activity may record an assignment made by the ENGINE with no human
--    actor. The 2A design (§5 step 8) writes provenance='system_generated',
--    actor_id=NULL; the check written on 23 Aug required an actor for that
--    provenance because at the time every system_generated row was a human
--    pressing a button. An engine run has no human. The note names the engine
--    so the row still says who did it.

alter table public.lead_outreach
  add column if not exists enrolled_at timestamptz;

update public.lead_outreach
   set enrolled_at = coalesce(enrolled_at, updated_at, now())
 where enrolled_at is null;

alter table public.lead_outreach
  alter column enrolled_at set default now();

comment on column public.lead_outreach.enrolled_at is
  'When the student entered a book (any door: enrol-book, distribute-leads, claim, intake engine). Counts toward max_new_per_day. NOT the SLA clock — that is assigned_at.';

create index if not exists lead_outreach_owner_enrolled_idx
  on public.lead_outreach (owner_id, enrolled_at);

alter table public.sales_activity
  drop constraint if exists sales_activity_actor_required;

alter table public.sales_activity
  add constraint sales_activity_actor_required
  check (
    actor_id is not null
    or provenance = any (array['vendor_reported'::text, 'observed'::text, 'unknown'::text, 'system_generated'::text])
  );
