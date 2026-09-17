-- ── A PHONE THAT IS OFF IS NOT A PHONE NOBODY ANSWERED ──────────────────────
--
-- Founder, 17 Sep 2026: "switch off different outcome".
--
-- `no_answer` is the second-largest status in the book — 256 students, behind
-- only the 659 never contacted — and it has been holding two different facts:
-- the phone rang and nobody picked up, and the phone was switched off. They
-- say different things about the student, and our students are people who
-- switch phones off in order to study.
--
-- ONLY `sales_activity.status` gains the value. `lead_outreach.status` is
-- deliberately left alone: it records WHERE a lead is, and an unreached
-- student is in the same place either way. Adding it there would mean every
-- branch in the queue that reads `status = 'no_answer'` — the retry lane, the
-- contact ceiling, the connected-today count — would silently stop seeing
-- half of its population. The activity row is the event log, and the event is
-- what differs.
--
-- Nothing is rewritten. Existing `no_answer` rows stay `no_answer`: they were
-- recorded when the counsellor had no other button, and relabelling them now
-- would invent a distinction nobody drew at the time (L1).
alter table sales_activity drop constraint if exists sales_activity_status_check;
alter table sales_activity add constraint sales_activity_status_check
  check (status in (
    'interested', 'callback', 'converted', 'not_interested',
    'no_answer', 'switched_off', 'dnd', 'messaged', 'skipped', 'reassigned'
  ));
