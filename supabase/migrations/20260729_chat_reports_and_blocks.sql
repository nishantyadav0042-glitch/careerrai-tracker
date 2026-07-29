-- App Store Guideline 1.2 (and Play's UGC policy) require FOUR things of any
-- app carrying user-generated content:
--   1. a filter for objectionable material          → community-safety.ts ✅
--   2. a way to report offensive content            → Daily Pick only, ❌ for chat
--   3. the ability to BLOCK abusive users           → did not exist anywhere ❌
--   4. published contact information                → /contact ✅
--
-- Until now the mentor chat had neither a report nor a block. It was invisible
-- to the last review only because the reviewer could not log in — the very bug
-- this resubmission fixes. With login working AND the review account seeded with
-- a mentor and a live conversation, a reviewer lands directly on 1:1 chat with
-- no way to report or stop it. That is the newly reachable rejection.

create table if not exists public.chat_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references auth.users(id) on delete cascade,
  reported_id  uuid not null references auth.users(id) on delete cascade,
  reason       text not null check (reason in ('abusive','harassment','spam_or_ad','off_topic','safety','other')),
  note         text,
  blocked      boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists chat_reports_reported_idx on public.chat_reports (reported_id, created_at desc);
create index if not exists chat_reports_reporter_idx on public.chat_reports (reporter_id, created_at desc);

-- A block is its own row, not a column on the report: a student may block
-- without reporting, and unblock without deleting the report history.
create table if not exists public.chat_blocks (
  id          uuid primary key default gen_random_uuid(),
  blocker_id  uuid not null references auth.users(id) on delete cascade,
  blocked_id  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint chat_blocks_once unique (blocker_id, blocked_id)
);

create index if not exists chat_blocks_pair_idx on public.chat_blocks (blocker_id, blocked_id);

alter table public.chat_reports enable row level security;
alter table public.chat_blocks  enable row level security;

-- All traffic goes through the API on the service role; the policies keep direct
-- access honest. A reporter may read what they filed and nothing else — reports
-- are never visible to the person reported.
drop policy if exists "read own chat reports" on public.chat_reports;
create policy "read own chat reports" on public.chat_reports
  for select using (auth.uid() = reporter_id);

drop policy if exists "read own chat blocks" on public.chat_blocks;
create policy "read own chat blocks" on public.chat_blocks
  for select using (auth.uid() = blocker_id);
