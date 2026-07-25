-- ── Daily Challenge + students-helping-students ─────────────────────────────
--
-- One question per section per day, same for every student. What no
-- competitor does: the answer is written into topic_evidence, so a daily
-- question is measurement, not just content. Community submissions (questions
-- and tips) enter through a verification queue — nothing a student writes
-- reaches other students until a human approves it, because the researched
-- failure mode of every CAT Telegram group is unverified advice at scale.
-- Design: docs/DAILY-CHALLENGE-DESIGN.md.

create table if not exists public.daily_challenges (
  id            uuid primary key default gen_random_uuid(),
  live_date     date,                  -- null while draft; set when scheduled
  section       text not null check (section in ('QA','DILR','VARC')),
  topic         text not null,         -- canonical TOPIC_METADATA name, enforced in API
  question      text not null,
  options       jsonb not null,        -- array of option strings (2..6)
  correct_index smallint not null check (correct_index >= 0 and correct_index <= 5),
  difficulty    text not null default 'medium' check (difficulty in ('easy','medium','hard','timed')),
  explanation   text not null,
  source        text not null default 'careerrai' check (source in ('careerrai','student')),
  contributor_id uuid references auth.users(id) on delete set null,
  status        text not null default 'draft' check (status in ('draft','approved','live','retired','rejected')),
  created_at    timestamptz not null default now()
);

-- One challenge per section per day. Partial: drafts (null live_date) don't collide.
create unique index if not exists daily_challenges_one_per_day
  on public.daily_challenges (live_date, section) where live_date is not null;

create table if not exists public.challenge_attempts (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references auth.users(id) on delete cascade,
  challenge_id  uuid not null references public.daily_challenges(id) on delete cascade,
  choice        smallint not null check (choice >= 0 and choice <= 5),
  is_correct    boolean not null,
  seconds_taken integer check (seconds_taken between 0 and 3600),
  created_at    timestamptz not null default now(),
  -- One attempt, ever. The first answer is the honest one; re-attempts after
  -- seeing the verdict would corrupt both the community split and the
  -- student's own evidence.
  constraint challenge_attempts_once unique (student_id, challenge_id)
);

create index if not exists challenge_attempts_challenge_idx
  on public.challenge_attempts (challenge_id);

create table if not exists public.student_submissions (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('question','tip')),
  topic         text,                  -- canonical; required for tips, enforced in API
  payload       jsonb not null,        -- question: {question,options,correct_index,explanation} · tip: {text}
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  published_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists student_submissions_status_idx
  on public.student_submissions (status, created_at desc);
create index if not exists student_submissions_topic_pub_idx
  on public.student_submissions (topic) where status = 'approved' and kind = 'tip';

-- topic_evidence gains the 'daily' source — a challenge answer IS evidence.
alter table public.topic_evidence drop constraint if exists topic_evidence_source_check;
alter table public.topic_evidence
  add constraint topic_evidence_source_check
  check (source in ('routine','log','manual','mock','daily'));

-- RLS. All student traffic flows through the API (service role), but the
-- policies keep direct access honest: students see live challenges, their own
-- attempts, their own submissions, and published tips — never the pending
-- queue, never another student's attempt.
alter table public.daily_challenges enable row level security;
alter table public.challenge_attempts enable row level security;
alter table public.student_submissions enable row level security;

drop policy if exists "students read live challenges" on public.daily_challenges;
create policy "students read live challenges" on public.daily_challenges
  for select using (status = 'live' and live_date is not null);

drop policy if exists "students read own attempts" on public.challenge_attempts;
create policy "students read own attempts" on public.challenge_attempts
  for select using (student_id = (select auth.uid()));

drop policy if exists "students insert own attempts" on public.challenge_attempts;
create policy "students insert own attempts" on public.challenge_attempts
  for insert with check (student_id = (select auth.uid()));

drop policy if exists "students read own submissions" on public.student_submissions;
create policy "students read own submissions" on public.student_submissions
  for select using (student_id = (select auth.uid()));

drop policy if exists "students insert own submissions" on public.student_submissions;
create policy "students insert own submissions" on public.student_submissions
  for insert with check (student_id = (select auth.uid()));

drop policy if exists "anyone reads published tips" on public.student_submissions;
create policy "anyone reads published tips" on public.student_submissions
  for select using (status = 'approved' and kind = 'tip' and published_at is not null);
