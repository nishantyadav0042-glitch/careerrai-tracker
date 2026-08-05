-- ── Who owns the permanent room ────────────────────────────────────────────
-- A room belongs to a specific Google ACCOUNT, not just to a buddy. If a
-- mentor reconnects with a different address, the old room lives on a calendar
-- we can no longer touch — the link would still "work" while being invisible
-- and unmanageable to us. Recording the owner is what lets us notice.
alter table public.profiles
  add column if not exists buddy_meet_email text,
  add column if not exists buddy_meet_calendar_id text;

comment on column public.profiles.buddy_meet_email is
  'Google account that owns buddy_meet_url. A mismatch on reconnect forces a new room.';
comment on column public.profiles.buddy_meet_calendar_id is
  'Calendar the permanent event lives on. Server-side only — never sent to a client.';

-- ── Audit log ──────────────────────────────────────────────────────────────
-- Every consequential integration action, in one place, in order. Written by
-- the server only.
create table if not exists public.integration_audit_log (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  -- Whose integration this is about (the buddy or student).
  subject_id  uuid references public.profiles(id) on delete set null,
  -- Who caused it: the subject themselves, an admin, or null for a cron/system.
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  -- Free-form context. NEVER tokens: see the check constraint below.
  detail      jsonb not null default '{}'::jsonb,
  ok          boolean not null default true
);

create index if not exists integration_audit_subject_idx
  on public.integration_audit_log (subject_id, created_at desc);
create index if not exists integration_audit_action_idx
  on public.integration_audit_log (action, created_at desc);

-- A log is the likeliest place for a secret to leak by accident — someone
-- dumps an API response into `detail` and now the refresh token is in a table
-- half the team can read. Make it impossible rather than a review comment.
alter table public.integration_audit_log
  drop constraint if exists audit_detail_carries_no_secrets;
alter table public.integration_audit_log
  add constraint audit_detail_carries_no_secrets check (
    not (detail ?| array['refresh_token', 'access_token', 'client_secret', 'id_token', 'code'])
  );

alter table public.integration_audit_log enable row level security;

-- No policies, by design: the service role bypasses RLS, and nobody else has
-- any business reading this table directly. Admin surfaces go through an API
-- route that checks the role first.
