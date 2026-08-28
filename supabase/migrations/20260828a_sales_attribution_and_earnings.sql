-- ── The incentive ledger: who closed it, frozen at the moment money landed ───
--
-- Founder signed two engagement letters on 28 Aug 2026 (Anshul Yadav, Neelam):
-- ₹8,000 fixed per month plus 10% of the amount realised from each student the
-- counsellor converts, "payable when the student's payment is realised and is
-- not subsequently refunded", with a statement of conversions furnished on
-- request. Nothing in this schema could honour any clause of that sentence.
--
-- WHAT WAS ACTUALLY THERE. The founder's rep screen computed "Won" live, as
-- "leads this rep owns RIGHT NOW that have a paid row". That is a portfolio
-- view, and it is the correct thing for a portfolio view to do. It is the
-- wrong thing to pay someone from, for three separate reasons:
--
--   1. CREDIT MOVED. Ownership is mutable — /api/admin/reassign-lead and
--      distribute-leads both rewrite owner_id. Reassigning a lead after the
--      student paid silently moved the money to whoever holds the lead today.
--      With one rep that was invisible. With two reps sharing one pool it is a
--      dispute in the first payroll cycle, and the rep who did the work has no
--      record to argue from.
--   2. CREDIT APPEARED FROM NOWHERE. A student who paid in July, claimed by a
--      rep in September, counted as that rep's conversion — the payment
--      predates the relationship entirely.
--   3. NO MONTH. The number summed EVERY payment those students ever made, so
--      no month could ever be read off it.
--
-- This table fixes all three by recording the answer once, at the only moment
-- it is unambiguous: when the payment is realised. rep_id is a SNAPSHOT and is
-- never rewritten afterwards — that is the whole point, and later ownership
-- changes are deliberately invisible to it.
--
-- PAYMENT_ID IS THE PRIMARY KEY, and that is load-bearing rather than tidy.
-- Razorpay redelivers webhooks (Incident #15's neighbourhood): the capture path
-- can run twice for one payment. A serial id would have paid the rep twice for
-- one sale. The payment's own id makes a second insert a no-op collision.

create table if not exists public.sales_conversions (
  -- One payment, one conversion, one incentive. Idempotent by construction.
  payment_id   uuid primary key references public.student_payments(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,

  -- THE SNAPSHOT. on delete restrict, not set null: a rep row that has been
  -- paid incentive against cannot be deleted out from under its own ledger.
  rep_id       uuid not null references public.profiles(id) on delete restrict,

  -- What the student actually paid, in paise, copied at realisation. Copied
  -- rather than joined because student_payments.amount is mutable in principle
  -- and an incentive must be computable from a frozen number.
  amount_paise int  not null check (amount_paise > 0),
  plan         text,

  realised_at  timestamptz not null,

  -- Set when the student's money goes back. The incentive on THIS transaction
  -- stands withdrawn (Clause 7) and nothing else is touched.
  refunded_at  timestamptz,

  -- HOW we concluded this rep closed it, so a disputed row can be explained
  -- rather than defended. 'owner_at_payment' = they owned the lead when the
  -- money landed. Future bases (a rep-entered claim, an admin correction) get
  -- their own value and stay distinguishable forever.
  basis        text not null default 'owner_at_payment'
    check (basis in ('owner_at_payment', 'admin_assigned')),

  created_at   timestamptz not null default now()
);

-- The payroll read: one rep, one month.
create index if not exists sales_conversions_rep_month_idx
  on public.sales_conversions (rep_id, realised_at desc);
create index if not exists sales_conversions_student_idx
  on public.sales_conversions (student_id);

comment on table public.sales_conversions is
  'The incentive ledger. One row per realised payment, rep_id frozen at realisation. This is the ONLY thing a counsellor is paid from — never lead_outreach.owner_id, which is mutable and describes today rather than the moment of sale.';
comment on column public.sales_conversions.rep_id is
  'SNAPSHOT — who owned the lead when the money landed. Deliberately NOT kept in step with lead_outreach.owner_id: reassigning a lead must never move money that has already been earned.';

-- Same deny-by-default posture as every other sales table: RLS on, no
-- policies, service-role only. A rep reads their own earnings through a server
-- route that scopes by their session, never through a client-side policy.
alter table public.sales_conversions enable row level security;
revoke insert, update, delete on public.sales_conversions from anon, authenticated;

-- ── When the money went back ────────────────────────────────────────────────
--
-- student_payments.status has ALWAYS permitted 'refunded' — the CHECK
-- constraint lists it. Nothing has ever written it. The refund webhook revoked
-- premium, emitted a timeline event and logged a security event, then left the
-- row saying 'paid' forever.
--
-- So every surface that counts revenue or conversions counted refunded money:
-- the founder's revenue screen, the rep portfolio's "Won (paid)", and — from
-- 2 September — a 10% incentive on a sale that was handed back. The webhook now
-- writes both columns; this one exists so "when" is answerable, which is what
-- decides WHICH MONTH loses the incentive.
alter table public.student_payments
  add column if not exists refunded_at timestamptz;

comment on column public.student_payments.refunded_at is
  'Set by the Razorpay refund webhook alongside status=refunded. Until 28 Aug 2026 a refunded payment kept status=paid forever, so refunded money counted as revenue and would have paid commission.';

-- ── The terms, as configuration rather than code ────────────────────────────
--
-- SCALE-CONTRACT §7 and the precedent set by 20260825a: nothing hard-codes two
-- people or one pay scale. A third hire on different terms is an UPDATE.
--
-- BOTH COLUMNS ARE NULLABLE AND THAT IS THE DESIGN — the same reasoning that
-- gave part_time no default. A rate we were never told is not zero. Defaulting
-- incentive_percent to 0 would compute a confident ₹0 payout for a rep whose
-- terms simply had not been entered, and the founder would pay it. Null makes
-- lib/sales-earnings.ts report "terms not stated" instead, per Law L1: a
-- trustworthy UNKNOWN beats a precise lie.
alter table public.sales_rep_config
  add column if not exists monthly_fixed_paise int,
  add column if not exists incentive_percent numeric(5,2);

alter table public.sales_rep_config
  drop constraint if exists sales_rep_config_fixed_bounds;
alter table public.sales_rep_config
  add constraint sales_rep_config_fixed_bounds
  check (monthly_fixed_paise is null or monthly_fixed_paise between 0 and 100000000);

alter table public.sales_rep_config
  drop constraint if exists sales_rep_config_incentive_bounds;
alter table public.sales_rep_config
  add constraint sales_rep_config_incentive_bounds
  check (incentive_percent is null or incentive_percent between 0 and 100);

comment on column public.sales_rep_config.monthly_fixed_paise is
  'Fixed monthly professional fee, paise. NULL = never stated; earnings report UNKNOWN rather than zero.';
comment on column public.sales_rep_config.incentive_percent is
  'Percent of realised amount per conversion. NULL = never stated; earnings report UNKNOWN rather than a confident zero payout.';

-- ── Speed to lead ───────────────────────────────────────────────────────────
--
-- first_contact_sla_minutes has existed since 20260824c and NOTHING has ever
-- measured against it: there was no record of when a lead was assigned, so
-- "was first contact inside the SLA?" had no left-hand side. 20260825a said so
-- out loud — "lead_outreach has no assigned_at column until 2B-2, so how many
-- leads a rep already received today is genuinely unmeasurable".
--
-- This is 2B-2. Both columns are written by the assignment and logging paths;
-- neither is back-fillable, so both stay NULL for anything that happened
-- before today and every reader must treat NULL as "unknown", never as "never
-- contacted" — the distinction the data-quality panel reports on.
alter table public.lead_outreach
  add column if not exists assigned_at timestamptz,
  add column if not exists first_contact_at timestamptz;

create index if not exists lead_outreach_awaiting_first_contact_idx
  on public.lead_outreach (assigned_at)
  where first_contact_at is null and owner_id is not null;

comment on column public.lead_outreach.assigned_at is
  'When this lead was given to its current owner. Starts the first-contact SLA clock. NULL = assigned before 28 Aug 2026, or never assigned — never read as "just now".';
comment on column public.lead_outreach.first_contact_at is
  'First logged contact attempt after assignment. NULL means unknown, NOT "never called" — rows predating 28 Aug 2026 have no history to back-fill.';
