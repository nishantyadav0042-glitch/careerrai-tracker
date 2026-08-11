-- Buddy check-in drafts (founder, 10 Aug).
--
-- When an assigned student goes two days without any log, the cron writes ONE
-- row here: a ready-to-send message, in the mentor's voice, built from that
-- student's real data. The mentor taps Send and it goes out from their own ID
-- into the real chat thread.
--
-- The row exists precisely so the mentor is in the loop. We deliberately did
-- NOT auto-send: a message from Shreya's ID that Shreya never saw means the
-- student replies into silence, which damages trust more than sending nothing.

create table if not exists public.buddy_checkin_drafts (
  id            uuid primary key default gen_random_uuid(),
  buddy_id      uuid not null references public.profiles(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  -- What the cron wrote. The mentor may edit before sending; what actually went
  -- out is the chat_messages row pointed to by message_id.
  draft_body    text not null,
  signal        text not null check (signal in ('streak_broken','after_mock','blocker','section_cold','silent')),
  evidence      jsonb not null default '{}'::jsonb,
  missed_days   int  not null,
  created_at    timestamptz not null default now(),
  -- "You missed 2 days" is false by Thursday if written on Monday. A stale
  -- draft must never be sendable from a mentor's ID.
  expires_at    timestamptz not null,
  sent_at       timestamptz,
  dismissed_at  timestamptz,
  message_id    uuid references public.chat_messages(id) on delete set null,
  -- Stamped when the student replies after a sent check-in. Two sent check-ins
  -- with no reply stops the drafting for that student (scale-config).
  replied_at    timestamptz
);

-- One open draft per student at a time. Without this a cron retry, or two runs
-- in one morning, would stack two identical "where are you" messages on the
-- mentor's screen — and the mentor would send both.
create unique index if not exists buddy_checkin_drafts_one_open
  on public.buddy_checkin_drafts (student_id)
  where sent_at is null and dismissed_at is null;

-- The mentor's screen: open drafts for me, newest first.
create index if not exists buddy_checkin_drafts_buddy_open
  on public.buddy_checkin_drafts (buddy_id, created_at desc)
  where sent_at is null and dismissed_at is null;

-- The cron's eligibility read: last sent + unanswered run, per student.
create index if not exists buddy_checkin_drafts_student_sent
  on public.buddy_checkin_drafts (student_id, sent_at desc)
  where sent_at is not null;

alter table public.buddy_checkin_drafts enable row level security;

-- A mentor may read their own drafts. Nobody writes from the client: the cron
-- creates rows and the send/dismiss routes use the service role after checking
-- the pair, so a student can never see the draft that was written about them.
drop policy if exists "buddy reads own checkin drafts" on public.buddy_checkin_drafts;
create policy "buddy reads own checkin drafts"
  on public.buddy_checkin_drafts for select
  using (auth.uid() = buddy_id);
