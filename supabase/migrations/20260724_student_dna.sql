-- Student DNA — one continuously-recomputed behavioural fingerprint per student
-- (deterministic + explainable; `signals` keeps the raw inputs so scores are
-- justifiable and an ML model can later replace a rule without changing consumers).
create table if not exists public.student_dna (
  student_id            uuid primary key references public.profiles(id) on delete cascade,
  activation            smallint,
  consistency           smallint,
  momentum              smallint,
  purchase_intent       smallint,
  churn_risk            smallint,
  journey_stage         text,
  signals               jsonb not null default '{}'::jsonb,
  computed_at           timestamptz not null default now()
);
create index if not exists idx_student_dna_stage on public.student_dna (journey_stage);
create index if not exists idx_student_dna_churn on public.student_dna (churn_risk desc);
