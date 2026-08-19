-- Store-rating ask (founder reminder 11 Aug, re-cut 19 Aug)
--
-- A light in-app nudge toward the App Store / Play Store review at happy
-- moments: a streak milestone, a completed mock debrief, the onboarding
-- Blueprint reveal. Server-persisted rather than localStorage, so the cooldown
-- and the lifetime cap hold across a student's DEVICES, not per-browser --
-- the same "shown, then resolved" shape study_action_log already established.
--
-- RE-CUT, NOT MERGED, and two things changed from the parked version:
--
--   1. The admin read policy used `profiles.role = 'admin'`. Every other admin
--      check in this database goes through is_admin(), which reads
--      auth.users.raw_user_meta_data -- a source no client can write. Using
--      profiles.role would have made a second, weaker definition of "admin",
--      which is the duplication this codebase has spent the week removing.
--      (profiles.role is no longer client-writable as of today's B' gate, so
--      this is consistency rather than a live hole.)
--
--   2. Client writes are revoked explicitly. RLS with no write policy already
--      denies them, but every table touched today states it in the grant as
--      well -- defence in depth, and it makes the intent readable without
--      having to reason about policy absence.
--
-- Rows are written ONLY by /api/rating-prompt/show and /resolve, both of which
-- authenticate the caller and scope the write to their own student_id.

create table if not exists public.rating_prompts (
  id          bigint generated always as identity primary key,
  student_id  uuid        not null references public.profiles(id) on delete cascade,
  trigger     text        not null,  -- 'streak_milestone' | 'mock_completed' | 'blueprint_reveal'
  platform    text,                  -- 'ios' | 'android' -- which store link was offered
  shown_at    timestamptz not null default now(),
  action      text,                  -- 'rated' | 'dismissed' | 'never_ask_again', null until resolved
  action_at   timestamptz
);

create index if not exists idx_rating_prompts_student_shown
  on public.rating_prompts (student_id, shown_at desc);

alter table public.rating_prompts enable row level security;

drop policy if exists "student reads own rating prompts" on public.rating_prompts;
create policy "student reads own rating prompts" on public.rating_prompts
  for select using (student_id = (select auth.uid()));

drop policy if exists "admin reads all rating prompts" on public.rating_prompts;
create policy "admin reads all rating prompts" on public.rating_prompts
  for select using (public.is_admin((select auth.uid())));

revoke insert, update, delete on public.rating_prompts from anon, authenticated;
