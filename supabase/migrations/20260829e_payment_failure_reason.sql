-- ── WHY A PAYMENT FAILED, KEPT INSTEAD OF THROWN AWAY ───────────────────────
--
-- 29 Aug 2026, Incident #58. Eight orders have been created from an INSTALLED
-- iOS surface (display_mode ios_app or standalone). Zero were ever paid. The
-- same platform in mobile Safari converted 1 of 1, and installed Android
-- converted 2 of 13. So "iOS payments do not work in the app" is measured, not
-- suspected.
--
-- WHY NOBODY COULD SAY WHY. reconcile-payments already asks Razorpay, every 15
-- minutes, what really happened to every unpaid order. Razorpay answers with
-- the whole payment entity — method, error_code, error_description,
-- error_source, error_step. The cron read that answer, tested one field
-- (status === 'failed'), wrote a bare status='failed', and DISCARDED the rest.
--
-- The discarded fields are the entire diagnosis. `method='upi'` with
-- `error_step='payment_initiation'` is the app-switch gap the iOS wrapper is
-- suspected of (a upi:// deep link a WKWebView never hands to the UPI app).
-- `method='card'` with `error_step='payment_authentication'` and
-- `error_source='bank'` is an ordinary decline and means the app is innocent.
-- Those two demand opposite work, cost differently, and were indistinguishable.
--
-- L1 — a trustworthy UNKNOWN beats a precise lie — is why `failure_seen_at`
-- exists as a separate column rather than inferring it from failure_code being
-- NULL. NULL code alone conflates two different states: "we never asked
-- Razorpay" and "we asked and Razorpay named no error". The first is a hole in
-- our instrumentation; the second is a fact about the payment. Only
-- failure_seen_at can tell them apart, and every reader must be able to.
--
-- Nothing here is backfilled by this migration. The columns arrive NULL and
-- unseen, and the cron's explain pass fills them from Razorpay — which retains
-- payment history indefinitely — so the two failed 25 Aug iOS attempts become
-- explainable on the next tick without inventing a single value here.

alter table public.student_payments
  add column if not exists failure_code        text,
  add column if not exists failure_description text,
  add column if not exists failure_source      text,
  add column if not exists failure_step        text,
  add column if not exists failure_method      text,
  add column if not exists failure_seen_at     timestamptz;

comment on column public.student_payments.failure_seen_at is
  'When Razorpay was asked about this failed order. NULL = never asked (an instrumentation hole). NOT NULL with failure_code NULL = asked, and Razorpay named no error code. Never infer one from the other.';

-- The work queue for the explain pass: failed rows we have never asked about.
-- Partial, so it stays the size of the backlog rather than the ledger.
create index if not exists student_payments_unexplained_failure_idx
  on public.student_payments (created_at)
  where status = 'failed' and failure_seen_at is null;
