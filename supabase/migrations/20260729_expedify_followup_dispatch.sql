-- Follow-up (re-engagement) calls need their own dispatch record.
--
-- expedify_status is the SIGNUP state machine: queued → sending → sent/failed/
-- skipped_activated, and the flush cron claims rows by flipping 'queued' →
-- 'sending'. 104 of the 187 sales-ready students already sit at 'sent' from
-- their signup call. Reusing that column for follow-ups would (a) destroy the
-- record that they were already called once at signup, and (b) put rows into
-- states the flush cron's filters were never written for.
--
-- So a follow-up gets its own timestamp. It is the double-call guard: the
-- dispatcher refuses to re-send anyone called within the cooldown window,
-- which is what stops a re-run of the same admin URL from dialling the same
-- student twice — real money, and a bad second impression.
alter table public.profiles
  add column if not exists expedify_followup_at timestamptz;

comment on column public.profiles.expedify_followup_at is
  'Last time this student was handed to Expedify as a follow_up (re-engagement) lead. Separate from expedify_status, which tracks the signup call only. Doubles as the re-send cooldown guard.';

create index if not exists profiles_expedify_followup_idx
  on public.profiles (expedify_followup_at desc nulls last)
  where role = 'student';
