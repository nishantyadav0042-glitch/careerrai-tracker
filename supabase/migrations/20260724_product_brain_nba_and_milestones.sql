-- The Product Brain's output per student: a ranked Next-Best-Action.
alter table public.student_dna add column if not exists next_best_action jsonb;

-- Derived SEMANTIC business events (not raw taps) — emitted only on a real state
-- TRANSITION, so downstream systems (notifications, personalization, reporting,
-- later ML) react to meaningful change instead of millions of low-level events.
create table if not exists public.student_milestones (
  id          bigserial primary key,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  milestone   text not null,   -- student_became_at_risk | _recovered | _became_engaged | ...
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_student_milestones_student on public.student_milestones (student_id, created_at desc);
create index if not exists idx_student_milestones_type on public.student_milestones (milestone, created_at desc);
