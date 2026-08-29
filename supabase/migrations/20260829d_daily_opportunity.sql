-- ── WHAT THE SYSTEM GAVE, AND WHAT CAME BACK ───────────────────────────────
--
-- The denominator. Until now the sales system could say what a counsellor
-- LOGGED, and could not say what they were GIVEN — so "did they work the right
-- students?" had no answer, and neither did "how much of today is left?".
-- sales_activity records outreach that happened; nothing recorded the offer.
--
-- Founder, 29 Aug 2026: the counsellor must never have to report this. They do
-- not tell the system "today I was given 72" — the system already knows,
-- because it is the thing that decided. Their only job is the interaction and
-- the outcome. Everything on this table is written by the platform.
--
-- WHY A TABLE AT ALL, when the queue is computed live and stateless. Because
-- the queue answers "who matters NOW", and that is exactly the wrong question
-- at 9pm: by then the morning's list has been recomputed away and the students
-- who were skipped look identical to students who were never chosen. A surfaced
-- row is the only record that a specific student was put in front of a specific
-- person on a specific day. It is an audit trail, not a work list — the queue
-- stays live and this table never feeds it.
--
-- IT MUST NOT BECOME A PERFORMANCE SCORE. SALES-OS.md §0 puts telemetry at P5
-- and forbids it becoming P0. This exists to answer "did the right students get
-- reached, and what changed" — coverage of what mattered — never "who made more
-- calls". `worked_at` is set only by a real disposition, which is why pressing
-- the call button leaves it null.

create table if not exists public.sales_opportunity (
  id            bigserial primary key,

  student_id    uuid not null references public.profiles(id) on delete cascade,
  -- RESTRICT, matching lead_outreach and sales_followup (20260829c): a rep who
  -- has been given work cannot be deleted out from under the record of it.
  rep_id        uuid not null references public.profiles(id) on delete restrict,

  -- IST, not UTC. A UTC day rolls over at 05:30 IST and would blank a
  -- counsellor's progress mid-morning. Written by the application from the same
  -- clock the queue uses, so the two can never disagree about which day it is.
  ist_day       date not null,

  -- Which of the two business goals this contact was for (SALES-OS.md §4).
  objective     text not null check (objective in ('retention', 'conversion')),
  -- The lane that produced the card, and the sentence the counsellor read.
  -- Stored rather than recomputed: six weeks from now the signals will have
  -- moved on, and "why did we call this student on 29 August" must still have
  -- the answer we actually showed, not the answer today's data would give.
  lane          text not null,
  why_today     text not null check (length(btrim(why_today)) > 0),
  -- Sort position within the day. Lower is more urgent. Lets the founder ask
  -- the only coverage question that matters: were the TOP ones reached?
  rank          int not null check (rank >= 0),

  surfaced_at   timestamptz not null default now(),

  -- WORKED MEANS DISPOSITIONED. Set only when a real outcome is recorded.
  -- Opening the card, pressing call, tapping WhatsApp — none of them touch
  -- this, deliberately: a counter that any tap could advance is a counter that
  -- will be advanced by tapping.
  worked_at     timestamptz,
  outcome       text,

  -- ONE STUDENT, ONE CARD, ONE DAY. The founder's "the same student must not
  -- surface twice in a day" as a database fact rather than a frontend hope.
  -- It is also what makes recording idempotent: the queue is rebuilt on every
  -- page load, and every rebuild after the first is a no-op.
  constraint sales_opportunity_one_per_rep_day unique (rep_id, student_id, ist_day),
  -- An outcome without a time, or a time without an outcome, is a half-written
  -- record that would silently corrupt every coverage number computed from it.
  constraint sales_opportunity_worked_complete
    check ((worked_at is null) = (outcome is null))
);

-- The two reads this table exists to serve: one counsellor's day, and one
-- student's history of being offered.
create index if not exists sales_opportunity_rep_day_idx
  on public.sales_opportunity (rep_id, ist_day, rank);
create index if not exists sales_opportunity_student_idx
  on public.sales_opportunity (student_id, ist_day desc);
-- The founder's leakage question — "what was surfaced today and never worked?"
create index if not exists sales_opportunity_unworked_idx
  on public.sales_opportunity (ist_day, rank) where worked_at is null;

comment on table public.sales_opportunity is
  'What the system OFFERED, as opposed to sales_activity which records what happened. Written entirely by the platform; a counsellor never reports their own workload. One row per rep per student per IST day, enforced by a unique constraint.';
comment on column public.sales_opportunity.worked_at is
  'Set ONLY by a recorded disposition. Opening a card or pressing call must never set it — see SALES-OS.md §0, telemetry is P5 and may not become a performance measure.';

alter table public.sales_opportunity enable row level security;
-- Same posture as every other sales table: service role only, no client policy,
-- so RLS denies by default rather than depending on a policy being written well.
revoke all on public.sales_opportunity from anon, authenticated;
