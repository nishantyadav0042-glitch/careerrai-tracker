-- ── Run ONLY after the application deploy is live and verified ──────────────
--
-- Both statements are deliberately held back from the main migration because
-- each one would break the CURRENTLY DEPLOYED code if applied first. Applying
-- them early is not "being thorough", it is creating an outage window.
--
-- Verify before running:
--   select count(*) from sales_activity where actor_id is null
--     and provenance not in ('vendor_reported','observed','unknown');   -- expect 0
--   select count(*) from expedify_events where received_at > '<deploy time>'
--     and dedupe_key is null;                                           -- expect 0

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

-- 3. Only after a soak with real rows: retire the legacy text columns.
--    NOT part of this release. Every reader must be verified in production
--    first — see docs/SALES-FINAL-REPORT.md.
-- alter table public.lead_outreach  drop column owner;
-- alter table public.sales_activity drop column actor;
-- drop function if exists public.claim_lead(uuid, text);
