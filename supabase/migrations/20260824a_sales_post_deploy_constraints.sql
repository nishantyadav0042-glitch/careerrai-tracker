-- ── Sales OS post-deploy constraints — APPLIED to production 24 Aug 2026 ────
--
-- These are the two statements held back from 20260823a_sales_canonical_identity
-- (see docs/SALES-POST-DEPLOY-STEPS.sql for the full rationale): each would have
-- broken the then-deployed code if applied before PR #99 shipped.
--
-- Gate cleared 24 Aug: PR #99 merged to main, deployed, and verified with a
-- real payment observed live by the founder. Pre-checks immediately before
-- applying: 0 human activities missing an actor, 0 recent vendor events with a
-- NULL dedupe key.

-- 1. Every HUMAN activity must name its actor. Vendor and observed rows are
--    exempt because naming a CareerRai actor for them would be fabricated
--    attribution in the table this whole workstream exists to make honest.
alter table public.sales_activity
  add constraint sales_activity_actor_required
  check (actor_id is not null or provenance in ('vendor_reported', 'observed', 'unknown'));

-- 2. Idempotency that a NULL cannot walk past. NOT VALID binds new rows only,
--    so the 239 historical NULL-key rows survive as evidence of the 220
--    duplicate deliveries on 12 August.
alter table public.expedify_events
  add constraint expedify_events_dedupe_key_required
  check (dedupe_key is not null) not valid;
