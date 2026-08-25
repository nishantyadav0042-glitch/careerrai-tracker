-- ── The intervention ledger — CareerRai's learning substrate ────────────────
--
-- Founder directive, 24 Aug 2026. The system today COMPUTES (crons recompute
-- momentum, churn risk, lanes) but does not LEARN: nothing anywhere records
-- "we did X to a student in state S, and Y happened next", so no rule has ever
-- changed because of a measured outcome.
--
-- This table is that missing half. Append-only, one row per meaningful human
-- intervention, capturing the student's state BEFORE, what the human actually
-- did, and what the student did for the seven days AFTER.
--
-- WHY A NEW TABLE (the proof obligation):
--   · sales_activity records WHAT A REP CLAIMS THEY DID. It has no before-state,
--     no student-said category, and no after-outcome. Extending it would
--     overload one row with two different epistemic classes — a rep's claim and
--     the product's observation — which is the exact separation this codebase
--     spends its provenance system maintaining.
--   · student_events is a raw behavioural firehose with no notion of a human act.
--   · sales_followup records promises, not interventions or outcomes.
--   · No existing table can answer "which intervention, on which state, at what
--     time, produced a student who came back".
--
-- WHAT THIS TABLE IS NOT: it is not a second CRM, not a second activity log,
-- and not a source of truth for lead state. lead_outreach remains the state;
-- sales_activity remains the claim history. This is the LEARNING record, and
-- it points at both.

create table if not exists public.intervention_ledger (
  id            bigint generated always as identity primary key,

  -- ── WHO / WHEN ──
  student_id    uuid not null references public.profiles(id) on delete cascade,
  rep_id        uuid not null references public.profiles(id) on delete restrict,
  -- The activity row this intervention corresponds to, so a learning record can
  -- always be traced back to the claim that produced it. ON DELETE SET NULL:
  -- losing the pointer must never delete the lesson.
  activity_id   bigint references public.sales_activity(id) on delete set null,
  occurred_at   timestamptz not null default now(),

  -- ── STATE BEFORE (so an outcome can be judged against where they started) ──
  state_before          text not null,        -- NEW | ACTIVE | AT_RISK | DORMANT
  lane                  text,                 -- classifyLane verdict at the time
  days_since_last_log   int,
  streak_before         int,
  prior_interventions   int not null default 0,
  tenure_days           int,
  -- THE field that separates a channel failure from a message failure. Without
  -- it we could never tell "our words did not work" from "they were never
  -- reachable in the first place" — and 611 students have a phone but no push.
  reachable_by_push     boolean,

  -- ── THE ACT ──
  channel               text not null,        -- phone | whatsapp | in_app
  ist_hour              smallint,             -- 0-23, for timing analysis
  weekday               smallint,             -- ISO 1=Mon .. 7=Sun
  intervention_type     text not null,        -- activation|restart|diagnostic|conversion
  ask_made              text,                 -- what the rep asked for, short
  micro_commitment      boolean not null default false,

  -- ── WHAT THE STUDENT SAID (the product-intelligence field) ──
  reason_category       text,
  reason_verbatim       text,                 -- required when reason='other'
  objection             text,

  -- ── OUTCOME (written later by the observation sweep, never by the rep) ──
  logged_same_day       boolean,
  logged_d1             boolean,
  logged_d3             boolean,
  logged_d7             boolean,
  sustained_7d          boolean,              -- logged on 7 of the next 7 days
  streak_resumed        boolean,
  session_booked        boolean,
  session_completed     boolean,
  outcome_measured_at   timestamptz,          -- NULL = window still open

  created_at    timestamptz not null default now()
);

-- ── Vocabulary constraints: the taxonomy lives in code AND here ─────────────
-- Mirrors src/lib/intervention-taxonomy.ts. A guard test reads THIS file and
-- fails the build if the two drift, the same discipline already applied to
-- LEAD_STATUSES and ACTIVITY_STATUSES.

alter table public.intervention_ledger
  add constraint intervention_ledger_state_check
  check (state_before in ('NEW', 'ACTIVE', 'AT_RISK', 'DORMANT'));

alter table public.intervention_ledger
  add constraint intervention_ledger_type_check
  check (intervention_type in ('activation', 'restart', 'diagnostic', 'conversion'));

alter table public.intervention_ledger
  add constraint intervention_ledger_channel_check
  check (channel in ('phone', 'whatsapp', 'in_app'));

alter table public.intervention_ledger
  add constraint intervention_ledger_reason_check
  check (reason_category is null or reason_category in (
    'coaching_timetable_conflict', 'plan_not_relevant', 'app_confusing',
    'never_saw_notification', 'technical_issue',
    'no_time', 'exam_far_away', 'overwhelmed', 'exam_anxiety', 'using_other_prep',
    'wanted_mentor', 'price',
    'not_interested', 'wrong_number', 'other'
  ));

-- `other` without the student's words records that something happened while
-- destroying what it was. Enforced by the DATABASE, not by intent: this is the
-- lesson of the capacity work — an invariant the application merely means is
-- not an invariant.
alter table public.intervention_ledger
  add constraint intervention_ledger_other_needs_verbatim
  check (reason_category <> 'other'
         or (reason_verbatim is not null and length(btrim(reason_verbatim)) >= 3));

alter table public.intervention_ledger
  add constraint intervention_ledger_hour_check
  check (ist_hour is null or ist_hour between 0 and 23);

alter table public.intervention_ledger
  add constraint intervention_ledger_weekday_check
  check (weekday is null or weekday between 1 and 7);

-- An outcome is either fully unmeasured or carries its measurement time. A row
-- claiming a d7 result with no measured_at cannot be trusted or re-run.
alter table public.intervention_ledger
  add constraint intervention_ledger_outcome_coherent
  check (outcome_measured_at is not null or (logged_d7 is null and sustained_7d is null));

-- ── Indexes: the three questions this table exists to answer ───────────────
-- "what happened to this student"
create index if not exists intervention_ledger_student_idx
  on public.intervention_ledger (student_id, occurred_at desc);
-- "what did this rep do, and what came of it"
create index if not exists intervention_ledger_rep_idx
  on public.intervention_ledger (rep_id, occurred_at desc);
-- "which reasons are students giving" — the product-intelligence query
create index if not exists intervention_ledger_reason_idx
  on public.intervention_ledger (reason_category, occurred_at desc)
  where reason_category is not null;
-- "whose outcome window is still open" — drives the observation sweep
create index if not exists intervention_ledger_pending_outcome_idx
  on public.intervention_ledger (occurred_at)
  where outcome_measured_at is null;

-- Same deny-by-default posture as every other sales table: RLS on, no policies,
-- service-role only.
alter table public.intervention_ledger enable row level security;
revoke insert, update, delete on public.intervention_ledger from anon, authenticated;

comment on table public.intervention_ledger is
  'Append-only learning record: student state BEFORE a human intervention, what the human did, and what the student did for 7 days after. Not a CRM: lead_outreach owns state, sales_activity owns the rep''s claim. This owns the lesson.';

comment on column public.intervention_ledger.reachable_by_push is
  'Whether the student could receive a notification at intervention time. Separates "our message did not work" from "they were never reachable" — 611 students have a phone but no push subscription.';
