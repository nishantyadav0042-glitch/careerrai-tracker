-- Mentoring documents in chat: a resume, an SOP, a scorecard, an annotated PDF.
--
-- Deliberately NOT a file-sharing platform (founder, 5 Aug): images and
-- documents only, one per message, hard size caps, no video/audio/archives/
-- executables.
--
-- Metadata lives here; the FILE lives in Supabase Storage. Nothing binary ever
-- enters Postgres — a 20 MB bytea column would bloat every backup, every
-- replica and every sequential scan of the chat table forever.
--
-- One attachment per message means this is 1:1 with a message, so it is
-- COLUMNS on chat_messages rather than a side table. A join table for a 1:1
-- relationship costs an extra index, an extra round trip on the hottest query
-- in the app (loading a thread), and makes an orphaned row possible.
alter table public.chat_messages
  add column if not exists attachment_path      text,
  add column if not exists attachment_name      text,
  add column if not exists attachment_mime      text,
  add column if not exists attachment_size      bigint,
  add column if not exists attachment_kind      text;

alter table public.chat_messages drop constraint if exists attachment_is_all_or_nothing;
alter table public.chat_messages add constraint attachment_is_all_or_nothing check (
  (attachment_path is null and attachment_name is null and attachment_mime is null
    and attachment_size is null and attachment_kind is null)
  or
  (attachment_path is not null and attachment_name is not null and attachment_mime is not null
    and attachment_size is not null and attachment_kind is not null)
);

-- The allowlist, restated in the database. The API validates too, but a rule
-- that only lives in application code is one refactor away from being gone.
alter table public.chat_messages drop constraint if exists attachment_kind_allowed;
alter table public.chat_messages add constraint attachment_kind_allowed check (
  attachment_kind is null or attachment_kind in ('image', 'document')
);

alter table public.chat_messages drop constraint if exists attachment_size_capped;
alter table public.chat_messages add constraint attachment_size_capped check (
  attachment_size is null
  or (attachment_kind = 'image'    and attachment_size > 0 and attachment_size <= 10485760)
  or (attachment_kind = 'document' and attachment_size > 0 and attachment_size <= 20971520)
);

alter table public.chat_messages drop constraint if exists attachment_mime_allowed;
alter table public.chat_messages add constraint attachment_mime_allowed check (
  attachment_mime is null or attachment_mime in (
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
);

comment on column public.chat_messages.attachment_path is
  'Object key in the private chat-attachments bucket. Never served directly — always via a short-lived signed URL from /api/chat/attachment/[messageId].';

-- ── The bucket ─────────────────────────────────────────────────────────────
-- PRIVATE. A public bucket would make every resume and scorecard readable by
-- anyone who ever saw the URL, forever, with no way to revoke it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments', 'chat-attachments', false, 20971520,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No storage RLS policies for authenticated users, by design: uploads use a
-- server-issued signed upload URL and downloads use a server-issued signed
-- download URL, both minted only after the caller is proven to be a member of
-- that conversation. A client never touches this bucket with its own identity.

-- ── Orphan control ─────────────────────────────────────────────────────────
-- A user picks a file, it uploads, and then they never send the message. The
-- object is now in storage with nothing referencing it, and we pay for it
-- forever. Recording the INTENT makes cleanup exact and cheap: the cron reads
-- unclaimed rows rather than walking every folder in the bucket.
create table if not exists public.attachment_uploads (
  path        text primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz
);

create index if not exists attachment_uploads_unclaimed_idx
  on public.attachment_uploads (created_at) where claimed_at is null;

alter table public.attachment_uploads enable row level security;

comment on table public.attachment_uploads is
  'One row per issued upload URL. Unclaimed rows older than a day are deleted along with their storage objects by /api/cron/release-stale-sessions.';
