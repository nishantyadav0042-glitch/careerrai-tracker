-- ── Sales Phase 1 foundation: 'dnd' — the student said stop calling ─────────
--
-- Found in the 24 Aug sales-intelligence research pass: call-queue.ts has
-- suppressed status='dnd' since the queue was written, but no writer could
-- ever produce that value — it is absent from both CHECK constraints and from
-- the disposition vocabulary. A rep whose student says "please stop calling
-- me" had no honest one-tap way to record it; the nearest status,
-- not_interested, means "no to the offer", which is a different fact from
-- "no to the contact".
--
-- 'dnd' is a CONNECTED outcome (someone answered and said so; the mandatory
-- note records it) and closes the lead permanently: planDisposition maps it
-- to nextActionAt = NULL, and the queue's CLOSED set already excludes it.
--
-- The application-side mirrors are LEAD_STATUSES / CONNECTED_OUTCOMES in
-- src/lib/sales-disposition.ts. The vocabulary guard tests now read THIS
-- file (it supersedes 20260820a for lead status and 20260820c for activity
-- status) — change code and this file together or not at all.
--
-- Preflight expectation: both tables carry only vocabulary values already in
-- the old CHECKs, so drop+re-add with a superset is safe at any row count.
-- Reversal: drop each constraint and re-add the previous version (20260820a /
-- 20260820c) — safe while no dnd rows exist.

alter table public.lead_outreach
  drop constraint if exists lead_outreach_status_check;

alter table public.lead_outreach
  add constraint lead_outreach_status_check check (status in (
    'not_contacted',
    'called',
    'interested',
    'follow_up',
    'converted',
    'not_interested',
    'no_answer',
    'dnd'
  ));

alter table public.sales_activity
  drop constraint if exists sales_activity_status_check;

alter table public.sales_activity
  add constraint sales_activity_status_check
  check (status in ('interested', 'callback', 'converted', 'not_interested', 'no_answer', 'dnd', 'reassigned'));
