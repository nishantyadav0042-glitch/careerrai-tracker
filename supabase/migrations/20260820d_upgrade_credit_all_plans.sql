-- ── The ₹299 entry ladder: session credit applies to EVERY plan ─────────────
--
-- Founder ruling (20 Aug 2026): ₹299 session is the ENTRY POINT; the main
-- sale is the plan above it (₹999 / ₹2,499 / ₹2,999 / ₹4,499). The Part-1
-- follow-up found upgradeCreditPaise() had ZERO callers — the credit existed
-- as copy and a rule, but checkout never applied it, so the script's
-- "₹299 adjusts against the plan" promise was undeliverable. This wires it.
--
-- These two columns record ON THE PAYMENT ROW which credit was applied and
-- for how much, at order-creation time. The credit is marked spent
-- (credited_to_payment_id) only when the payment actually activates — and
-- the stamp carries an IS NULL guard, so one credit can never discount two
-- payments even under webhook retries.
--
-- Additive and nullable on the financial ledger: no existing row changes,
-- no reader breaks. Reversal: drop the two columns.

alter table public.student_payments
  add column if not exists session_credit_id uuid references public.session_credits(id),
  add column if not exists session_credit_paise integer;

comment on column public.student_payments.session_credit_id is
  'The ₹299 session credit applied to this order at creation (SA ladder, 20 Aug 2026). Marked spent on the credit row only when this payment activates.';
comment on column public.student_payments.session_credit_paise is
  'How much of the order price the session credit covered, in paise. NULL = no credit applied.';
