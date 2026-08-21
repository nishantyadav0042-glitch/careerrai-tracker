-- ── One payment, one session credit — enforced by the database ──────────────
--
-- Found 21 Aug by the Operations invariant "a paid payment is stamped
-- paid_at", which flagged one row. Pulling that thread found two defects in
-- the SAME function (activateSessionCredit), both on the FIRST real Rs 299
-- payment the product ever took:
--
--   1. paid_at was never written. The subscription path stamps it inside the
--      activate_payment RPC; the session path set status='paid' and nothing
--      else. Every Rs 299 payment would land in the ledger as paid with no
--      timestamp — and Rs 299 is now the product's primary entry CTA.
--
--   2. TWO credits were minted for ONE payment, 12 milliseconds apart
--      (bed8e9df… at 12:48:06.50653, 50aadee0… at 12:48:06.518471). The
--      guard was a read-then-write: SELECT ... maybeSingle(), then INSERT if
--      null. The webhook and the reconcile cron both read null and both
--      inserted. Each credit carried mentor_payout_paise = 29900, so the
--      system believed it owed Rs 598 in payouts against Rs 299 of revenue.
--
-- A check-then-insert cannot be made safe in application code. The database
-- is the only place that can decide this, so it does.
--
-- The duplicate is removed first because the constraint cannot be added over
-- it. BOTH rows were untouched — no buddy, no assignment, no video session,
-- no payout, no upgrade credit — so nothing a student or mentor did is lost.
-- The EARLIER row survives (it is the one the student's entitlement was
-- created from); the 12ms-later twin goes.

delete from public.session_credits c
where c.payment_id is not null
  and exists (
    select 1 from public.session_credits keep
    where keep.payment_id = c.payment_id
      and (keep.created_at, keep.id) < (c.created_at, c.id)
  )
  -- Refuse to delete anything a human ever touched.
  and c.buddy_id is null
  and c.assigned_at is null
  and c.completed_at is null
  and c.video_session_id is null
  and c.credited_to_payment_id is null
  and c.mentor_paid_at is null;

create unique index if not exists session_credits_payment_id_uniq
  on public.session_credits (payment_id)
  where payment_id is not null;

comment on index public.session_credits_payment_id_uniq is
  'One payment mints exactly one session credit. The application ALSO checks before inserting, but that check is a read-then-write race that lost on the first real Rs 299 payment; this index is what actually holds. A 23505 from it means a concurrent delivery already minted the credit, which activate-payment.ts treats as success.';

-- The one row the invariant caught. 12:48:06.50653+00 is when activation
-- actually ran (it is the mint timestamp of the surviving credit) — the
-- closest evidenced moment we hold, and deliberately not invented.
update public.student_payments
   set paid_at = '2026-08-20 12:48:06.50653+00'
 where id = '52b5d74c-9d0f-4796-b969-f49f971bb925'
   and status = 'paid'
   and paid_at is null;
