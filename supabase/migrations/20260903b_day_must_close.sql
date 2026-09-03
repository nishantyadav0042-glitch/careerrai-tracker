-- ── EVERY CARD ENDS THE DAY MARKED ──────────────────────────────────────────
--
-- Founder, 3 Sep 2026: "make sure they mark every list close or something,
-- otherwise it doesn't make sense of these lists."
--
-- Verified in production the same morning: of 241 opportunities ever offered,
-- 240 were still open — 58 from 30 Aug, 122 from 2 Sep, 60 from today. A card
-- left the deck ONLY when a call was logged, so three completely different
-- things were stored identically as "worked_at is null":
--
--   · the counsellor never got to it            (the day ran out)
--   · the counsellor looked and chose not to act (deliberate, and fine)
--   · the counsellor could not act               (wrong number, not reachable)
--
-- A list nobody closes is not a list, it is a suggestion. So a card now ends
-- the day in exactly one of three recorded states, and the day itself gets
-- closed by a sweep after the shift so "nobody marked it" becomes a FACT in
-- the table rather than an absence.
--
-- WHY A SECOND PAIR OF COLUMNS, and not just an outcome value. worked_at means
-- "a real disposition happened" and drives coverage, reached, and the founder's
-- read of whether students were actually contacted. Stamping a skip or a
-- sweep into it would inflate every one of those numbers — the exact defect
-- SALES-OS.md §0 forbids (telemetry is P5 and may never flatter itself).
-- worked_at keeps its meaning untouched; closed_at answers the separate
-- question "is this card still open?".
--
--   close_reason = 'worked'      a disposition was recorded (worked_at is set)
--   close_reason = 'skipped'     the counsellor closed it without acting,
--                                and skip_reason says why
--   close_reason = 'not_marked'  the shift ended and nobody touched it

alter table public.sales_opportunity
  add column if not exists closed_at   timestamptz,
  add column if not exists close_reason text,
  add column if not exists skip_reason  text;

-- Backfill BEFORE the constraints, so the table is already consistent.
update public.sales_opportunity
   set closed_at = worked_at, close_reason = 'worked'
 where worked_at is not null and closed_at is null;

-- Every open row from a day that has already ended is exactly what the founder
-- asked about: offered, never marked. Recorded as such rather than deleted —
-- 180 rows of "we gave these students to somebody and nothing happened" is the
-- most useful thing this table has ever held.
update public.sales_opportunity
   set closed_at = now(), close_reason = 'not_marked'
 where closed_at is null
   and ist_day < (now() at time zone 'Asia/Kolkata')::date;

alter table public.sales_opportunity
  drop constraint if exists sales_opportunity_close_complete;
alter table public.sales_opportunity
  add constraint sales_opportunity_close_complete
  check ((closed_at is null) = (close_reason is null));

alter table public.sales_opportunity
  drop constraint if exists sales_opportunity_close_reason_check;
alter table public.sales_opportunity
  add constraint sales_opportunity_close_reason_check
  check (close_reason is null or close_reason in ('worked', 'skipped', 'not_marked'));

-- A disposition and a close cannot disagree: if the card was worked, the only
-- honest close reason is 'worked'; a skip reason belongs to a skip and nowhere
-- else. Enforced here rather than trusted to the application, because these
-- two columns are read as one fact by three different surfaces.
alter table public.sales_opportunity
  drop constraint if exists sales_opportunity_close_agrees_with_work;
alter table public.sales_opportunity
  add constraint sales_opportunity_close_agrees_with_work
  check (
    (worked_at is null or close_reason = 'worked')
    and (skip_reason is null or close_reason = 'skipped')
  );

-- The counsellor's "what is still open" read, and the sweep's.
create index if not exists sales_opportunity_open_idx
  on public.sales_opportunity (rep_id, ist_day) where closed_at is null;

comment on column public.sales_opportunity.closed_at is
  'When the card stopped being open. Set by a disposition, by a skip, or by the end-of-day sweep. NOT a measure of work — that is worked_at.';
comment on column public.sales_opportunity.close_reason is
  'worked = a disposition was recorded · skipped = closed without acting (see skip_reason) · not_marked = the shift ended untouched.';

-- A skip is something a counsellor reports about a card, so it joins the
-- activity vocabulary. It is deliberately NOT a contact: it writes no
-- lead_outreach state, starts no clock, and never counts as reaching anyone.
alter table public.sales_activity
  drop constraint if exists sales_activity_status_check;
alter table public.sales_activity
  add constraint sales_activity_status_check
  check (status in ('interested', 'callback', 'converted', 'not_interested', 'no_answer', 'dnd', 'messaged', 'skipped', 'reassigned'));

alter table public.sales_activity
  drop constraint if exists sales_activity_activity_type_check;
alter table public.sales_activity
  add constraint sales_activity_activity_type_check
  check (activity_type in ('call', 'whatsapp', 'sms', 'email', 'note', 'skip',
    'followup_scheduled', 'followup_completed', 'followup_cancelled',
    'status_change', 'assigned', 'reassigned', 'unassigned'));
