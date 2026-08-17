-- Store-rating ask (founder reminder, set 11 Aug, actioned 17 Aug): a light
-- in-app nudge toward the App Store / Play Store review at happy moments —
-- a streak milestone, a completed mock debrief, the onboarding Blueprint
-- reveal. Server-persisted (not localStorage) so the cooldown and lifetime
-- cap hold across devices, matching the pattern study_action_log already
-- established for "shown, then resolved" event rows.
create table if not exists public.rating_prompts (
  id          bigint generated always as identity primary key,
  student_id  uuid        not null references public.profiles(id) on delete cascade,
  trigger     text        not null,  -- 'streak_milestone' | 'mock_completed' | 'blueprint_reveal'
  platform    text,                  -- 'ios' | 'android' — which store link was offered
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
  for select using (exists (select 1 from public.profiles p
                            where p.id = (select auth.uid()) and p.role = 'admin'));
