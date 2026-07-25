-- ── Evidence, not opinions ──────────────────────────────────────────────────
--
-- Until now the app has held 11,078 rows of what students SAY about their
-- topics (topic_coverage: "learning", "revising") and 96 rows of what they
-- actually DID. 115 opinions per piece of evidence. Every projection, every
-- ring, every finish date rests on the opinions.
--
-- topic_coverage answers "what stage do you think you're at". This table
-- answers "what did you actually do, and did you get it right" — the only
-- question from which readiness can be derived rather than claimed. It is
-- append-only: each row is one practice block a student reported, never
-- edited, so the evidence trail behind any score can always be shown back.
--
-- Deliberately NOT stored here: any score, percentile or readiness verdict.
-- Those are computed from these rows at read time (src/lib/evidence.ts), so
-- the rule that produced a number can change without rewriting history.

create table if not exists public.topic_evidence (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references auth.users(id) on delete cascade,
  section      text not null,
  topic        text not null,
  -- The rung of the ladder this block sat on. 'timed' is practice under exam
  -- clock, which is a different skill from untimed accuracy and so is counted
  -- separately rather than folded into 'hard'.
  difficulty   text not null check (difficulty in ('easy','medium','hard','timed')),
  attempted    smallint not null check (attempted between 1 and 500),
  correct      smallint not null check (correct >= 0),
  -- Where the block came from, so a later audit can tell self-reported
  -- practice apart from anything the system observed directly.
  source       text not null default 'manual' check (source in ('routine','log','manual','mock')),
  -- The study day it belongs to (IST log day), which is not always the day the
  -- row was inserted — a student logging last night at 1am means yesterday.
  logged_for   date not null default (now() at time zone 'Asia/Kolkata')::date,
  created_at   timestamptz not null default now(),

  -- correct can never exceed attempted. A UI bug that lets it through would
  -- produce accuracy over 100% and quietly discredit every number built on it.
  constraint topic_evidence_correct_lte_attempted check (correct <= attempted)
);

-- The two reads that exist: "all evidence for this student's topic" (the
-- per-topic checklist) and "this student's recent evidence" (freshness).
create index if not exists topic_evidence_student_topic_idx
  on public.topic_evidence (student_id, topic);
create index if not exists topic_evidence_student_date_idx
  on public.topic_evidence (student_id, logged_for desc);

alter table public.topic_evidence enable row level security;

-- (select auth.uid()) not auth.uid(): the subquery form is hoisted to an
-- InitPlan and evaluated once per statement instead of once per row. Same
-- policy, same isolation — see 20260725_rls_initplan_and_fk_index.sql.
drop policy if exists "students read own evidence" on public.topic_evidence;
create policy "students read own evidence" on public.topic_evidence
  for select using (student_id = (select auth.uid()));

drop policy if exists "students insert own evidence" on public.topic_evidence;
create policy "students insert own evidence" on public.topic_evidence
  for insert with check (student_id = (select auth.uid()));

-- Append-only by design: no update, no delete policy. A student who mis-logs
-- adds a correcting row; nobody rewrites the past. Admin reads go through the
-- service-role client, which bypasses RLS.
drop policy if exists "admins read all evidence" on public.topic_evidence;
create policy "admins read all evidence" on public.topic_evidence
  for select using (exists (select 1 from public.profiles p
                            where p.id = (select auth.uid()) and p.role = 'admin'));
