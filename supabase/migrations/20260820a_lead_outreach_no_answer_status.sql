-- ── Sales Phase 1 (truth hotfix): let a no-answer actually persist ──────────
--
-- The dialer's most common real-world outcome is that the student does not
-- pick up. /api/sales/log writes status='no_answer' with the retry clock
-- (next_action_at, no_answer_count) — but the CHECK created in
-- 20260709_lead_crm.sql predates the dialer and rejects that value. The
-- route ignored the error and returned ok, so the very first unanswered call
-- would silently drop the lead from the queue forever while sales_activity
-- (which has no CHECK) recorded that the attempt happened — state and
-- history permanently contradicting each other.
--
-- Preflight (20 Aug 2026, production): lead_outreach has 0 rows and
-- sales_activity has 0 rows — no existing value needs compatibility
-- handling; this widens the legal vocabulary before first real use.
--
-- The application-side mirror of this list is LEAD_STATUSES in
-- src/lib/sales-disposition.ts. A guard test reads THIS file and fails the
-- build if the two vocabularies drift. Change them together or not at all.
--
-- Reversal: drop the constraint and re-add the 20260709 six-value version
-- (safe while no no_answer rows exist).

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
    'no_answer'
  ));
