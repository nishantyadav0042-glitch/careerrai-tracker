-- ── 'messaged' is a real outcome ────────────────────────────────────────────
--
-- Founder, 2 Sep 2026: the day is 50–70 students and half of them are a
-- WhatsApp message, not a call. Until now the system knew only call outcomes,
-- so a counsellor who messaged twenty students had done twenty touches the
-- day never recorded — and the rotation, which leaves a student alone for
-- seven days after any touch, could not count them.
--
-- `messaged` on lead_outreach.status: a message was sent and nobody has
-- answered yet. It is not a connected outcome (no human spoke) and it sets
-- no re-queue clock: the student comes back through the attention lane if
-- they open the app, or through rotation after 21 silent days.
--
-- Mirrors LEAD_STATUSES / ACTIVITY_STATUSES in src/lib/sales-disposition.ts;
-- the vocabulary guard in sales-disposition.test.ts reads THIS file.

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
    'dnd',
    'messaged'
  ));

alter table public.sales_activity
  drop constraint if exists sales_activity_status_check;

alter table public.sales_activity
  add constraint sales_activity_status_check
  check (status in ('interested', 'callback', 'converted', 'not_interested', 'no_answer', 'dnd', 'messaged', 'reassigned'));
