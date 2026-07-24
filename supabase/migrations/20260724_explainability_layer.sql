-- Explainability layer.
-- 1) Store the explanation ALONGSIDE every score (not a separate lookup) so a
--    stale explanation can never drift from the score it justifies.
alter table public.student_dna add column if not exists explanations jsonb;

-- 2) Change history — every time DNA is recomputed, if a score moved, record
--    the delta + the top drivers that caused it. This is the timeline: "why did
--    Rahul's purchase_intent go 52 -> 84 on 24 Jul?"
create table if not exists public.student_dna_history (
  id          bigserial primary key,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  metric      text not null,          -- activation | consistency | momentum | purchase_intent | churn_risk
  prev_value  smallint,
  new_value   smallint,
  drivers     jsonb not null default '[]'::jsonb,  -- top factors that explain the delta
  created_at  timestamptz not null default now()
);
create index if not exists idx_dna_history_student on public.student_dna_history (student_id, created_at desc);
create index if not exists idx_dna_history_metric on public.student_dna_history (metric, created_at desc);

-- 3) Decision audit log — every Next-Best-Action the Brain ever surfaced, plus
-- (filled in later, when we know) whether it was executed and what happened.
-- This is how the Brain eventually learns which recommendations actually work.
create table if not exists public.decision_log (
  id           bigserial primary key,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  action_id    text not null,          -- convert_now | winback_human | ... (product-brain.ts candidate id)
  label        text not null,
  channel      text not null,
  impact       smallint not null,
  why          text not null,
  ranked       jsonb not null default '[]'::jsonb,   -- the full ranked candidate list at decision time
  executed     boolean not null default false,
  outcome      text,                    -- purchased | ignored | recovered | ... (filled in later)
  outcome_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_decision_log_student on public.decision_log (student_id, created_at desc);
create index if not exists idx_decision_log_action on public.decision_log (action_id, created_at desc);
create index if not exists idx_decision_log_pending on public.decision_log (created_at) where outcome is null;
