-- ── SA-1A: one next-action clock ────────────────────────────────────────────
--
-- The Part-1 forensic proved a guaranteed cross-surface disagreement: the rep
-- path wrote next_action_at (timestamptz) while the admin path wrote
-- next_follow_up (date), and neither surface ever read the other's clock. A
-- callback scheduled by the rep was invisible to /admin/sales; a follow-up set
-- by the admin was invisible to /sales.
--
-- From this migration on, next_action_at is the ONE clock. Every writer
-- (rep disposition, admin panel) writes it; every reader (call queue, admin
-- queue, lead page) reads it. next_follow_up is DEPRECATED: no code writes or
-- reads it after SA-1A; the column itself is dropped in a later SA-1 step
-- only after an implementation-time caller re-proof (founder rule: caller
-- tracing, then consolidation, then deletion — never in one commit).
--
-- This migration also DECLARES the dialer columns that already exist in
-- production but were never in a repo migration (found as drift in the
-- Part-1 audit): next_action_at, callback_at, last_attempt_at,
-- no_answer_count, and their two indexes. Everything below is idempotent —
-- in production it is a no-op re-statement; on a fresh database it builds
-- the schema the code actually requires.
--
-- Preflight (20 Aug 2026, production, re-verified immediately before apply):
-- lead_outreach = 0 rows → there is nothing to backfill, and no backfill is
-- invented.
--
-- Reversal: the ADD COLUMN / CREATE INDEX statements are declarative no-ops
-- in production, so reversal is simply reverting the code commit.

alter table public.lead_outreach
  add column if not exists callback_at     timestamptz,
  add column if not exists next_action_at  timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists no_answer_count integer not null default 0;

create index if not exists idx_lead_outreach_callback
  on public.lead_outreach (callback_at) where callback_at is not null;

create index if not exists idx_lead_outreach_next_action
  on public.lead_outreach (next_action_at) where next_action_at is not null;

comment on column public.lead_outreach.next_action_at is
  'THE next-action clock (SA-1A). When the lead re-enters the calling queue. Written by /api/sales/log (cadence engine) and /api/admin/outreach (admin follow-up). NULL = no scheduled action (closed or fresh).';

comment on column public.lead_outreach.next_follow_up is
  'DEPRECATED (SA-1A, 20 Aug 2026): superseded by next_action_at. No reader or writer remains in code. Dropped in a later SA-1 step after caller re-proof.';
