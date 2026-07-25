-- Applied to production 25 July 2026. Recorded here so the repo matches the DB.
--
-- THE LEARNING LOOP for study recommendations.
--
-- A recommendation engine gives advice from today's rules. A learning engine
-- changes tomorrow's rules because of yesterday's outcomes. This table is the
-- difference: every recommendation is recorded, then reconciled against what
-- the student actually did (api/cron/reconcile-actions), and the resulting
-- follow-rates re-rank that student's future advice.
--
-- Same mechanic the Product Brain already uses for notifications (decision_log
-- + reconcile-decisions) — one closed-loop pattern in this codebase, not two.
--
-- What compounds here is not uploads or PDFs. It is which KINDS of advice a
-- student acts on, and which kinds move real coverage. Month 1 ranks by fixed
-- heuristics; by month 6 the engine knows this student ignores revision
-- prompts and always acts on weak-section ones. Across thousands of students
-- that becomes knowledge nobody replicates by writing a better prompt.
create table if not exists public.study_action_log (
  id          bigint generated always as identity primary key,
  student_id  uuid        not null references public.profiles(id) on delete cascade,
  kind        text        not null,
  topic       text,
  section     text,
  minutes     integer,
  rank        smallint    not null default 0,
  shown_at    timestamptz not null default now(),
  outcome     text,          -- 'followed' | 'ignored', NULL until resolved
  outcome_at  timestamptz
);

create index if not exists idx_study_action_log_student_shown
  on public.study_action_log (student_id, shown_at desc);
create index if not exists idx_study_action_log_unresolved
  on public.study_action_log (shown_at) where outcome is null;

alter table public.study_action_log enable row level security;

drop policy if exists "student reads own action log" on public.study_action_log;
create policy "student reads own action log" on public.study_action_log
  for select using (student_id = (select auth.uid()));

drop policy if exists "admin reads all action logs" on public.study_action_log;
create policy "admin reads all action logs" on public.study_action_log
  for select using (exists (select 1 from public.profiles p
                            where p.id = (select auth.uid()) and p.role = 'admin'));
