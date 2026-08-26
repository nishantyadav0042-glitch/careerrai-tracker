-- ── PARITY, PART 3: the six tables the adversarial round depends on ─────────
--
-- Founder decision, 26 Aug: restore ONLY what the next audit gate needs, not
-- all 79 zero-object tables. Blanket restoration would expand the migration
-- surface without improving the safety gate it is meant to unlock.
--
-- The whole-schema inventory (docs/SCHEMA-PARITY.md) established the rule this
-- migration exists to satisfy:
--
--     A green adversarial test on a table with missing production
--     constraints is not evidence of safety.
--
-- Each of these six carries an adversarial test that cannot be honest without
-- it:
--
--   idempotency_keys      duplicate payment / duplicate callback
--   chat_messages         "3 messages" counted against real rows
--   notifications         duplicate notification
--   notification_duplicate_suppressions   ... and its dedup record
--   refund_requests       a refund cannot re-grant
--   google_oauth_tokens   mentor connection state
--
-- All six were EMPTY on test when this was written (0 rows each), and every FK
-- and uniqueness check was run against that data first: 0 orphans, 0 duplicate
-- ids, 0 same-day duplicates. Nothing here can fail on existing rows.
--
-- Applied to careerrai-test (endycmkdphymmhzniaih) on 26 Aug 2026.
-- NOT applied to production: every object below already exists there. Each was
-- replayed verbatim from production's pg_get_constraintdef()/indexdef output
-- and md5-verified afterwards.
--
-- ── ONE OBJECT HERE MATTERS BEYOND PARITY ──────────────────────────────────
--
-- `notifications_once_per_day_per_type` is a UNIQUE index on
--     (user_id, type, (created_at AT TIME ZONE 'Asia/Kolkata')::date)
-- for 21 named notification types.
--
-- That is a working, server-side, per-user, per-calendar-day cap — the exact
-- shape the buddy-promotion requirement needs, already in production and
-- already proven for notifications. The promotion throttle does not need a new
-- pattern invented for it; it needs THIS one. It also answers the open
-- question about the day boundary: the established convention in this database
-- is the Asia/Kolkata calendar day, not UTC.
--
-- Note what makes it work: the cap is a UNIQUE INDEX, so it fails CLOSED at
-- the database. It cannot be bypassed by a second device, a cleared cache, or
-- a storage exception — which is precisely how the current localStorage
-- promotion throttle fails.

-- ── idempotency_keys ────────────────────────────────────────────────────────
alter table public.idempotency_keys add constraint idempotency_keys_pkey primary key (user_id, endpoint, key);
alter table public.idempotency_keys add constraint idempotency_keys_user_id_fkey foreign key (user_id) references profiles(id) on delete cascade;
create index idempotency_keys_created_idx on public.idempotency_keys using btree (created_at);

-- ── chat_messages ───────────────────────────────────────────────────────────
alter table public.chat_messages add constraint chat_messages_pkey primary key (id);
alter table public.chat_messages add constraint chat_messages_student_id_fkey foreign key (student_id) references profiles(id) on delete cascade;
alter table public.chat_messages add constraint chat_messages_buddy_id_fkey foreign key (buddy_id) references profiles(id) on delete cascade;
alter table public.chat_messages add constraint chat_messages_sender_id_fkey foreign key (sender_id) references profiles(id) on delete cascade;
alter table public.chat_messages add constraint chat_messages_body_check CHECK (((char_length(body) <= 2000) AND ((char_length(body) >= 1) OR (attachment_path IS NOT NULL) OR (deleted_at IS NOT NULL))));
alter table public.chat_messages add constraint attachment_is_all_or_nothing CHECK ((((attachment_path IS NULL) AND (attachment_name IS NULL) AND (attachment_mime IS NULL) AND (attachment_size IS NULL) AND (attachment_kind IS NULL)) OR ((attachment_path IS NOT NULL) AND (attachment_name IS NOT NULL) AND (attachment_mime IS NOT NULL) AND (attachment_size IS NOT NULL) AND (attachment_kind IS NOT NULL))));
alter table public.chat_messages add constraint attachment_kind_allowed CHECK (((attachment_kind IS NULL) OR (attachment_kind = ANY (ARRAY['image'::text, 'document'::text]))));
alter table public.chat_messages add constraint attachment_mime_allowed CHECK (((attachment_mime IS NULL) OR (attachment_mime = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'application/pdf'::text, 'application/msword'::text, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'::text, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'::text, 'application/vnd.ms-excel'::text, 'application/vnd.ms-excel.sheet.macroEnabled.12'::text, 'text/csv'::text]))));
alter table public.chat_messages add constraint attachment_size_capped CHECK (((attachment_size IS NULL) OR ((attachment_kind = 'image'::text) AND (attachment_size > 0) AND (attachment_size <= 10485760)) OR ((attachment_kind = 'document'::text) AND (attachment_size > 0) AND (attachment_size <= 20971520))));
create index idx_chat_messages_buddy_id on public.chat_messages using btree (buddy_id);
create index idx_chat_messages_pair on public.chat_messages using btree (student_id, buddy_id, created_at desc);
create index idx_chat_messages_sender_id on public.chat_messages using btree (sender_id);
create index idx_chat_messages_unread on public.chat_messages using btree (student_id, buddy_id) where (read_at is null);

-- ── notifications ───────────────────────────────────────────────────────────
alter table public.notifications add constraint notifications_pkey primary key (id);
alter table public.notifications add constraint notifications_user_id_fkey foreign key (user_id) references profiles(id) on delete cascade;
create index idx_notifications_user_read on public.notifications using btree (user_id, read, created_at desc);
create index idx_notifications_user_type_created on public.notifications using btree (user_id, type, created_at desc);
create unique index notifications_once_per_day_per_type on public.notifications using btree (user_id, type, (((created_at AT TIME ZONE 'Asia/Kolkata'::text))::date)) where ((created_at >= '2026-08-16 13:16:00+00'::timestamp with time zone) AND (type = ANY (ARRAY['onboarding_morning'::text, 'onboarding_evening'::text, 'activation'::text, 'builder_recovery'::text, 'revision_due'::text, 'topic_earned'::text, 'mission_changed'::text, 'weekly_evolved'::text, 'inactive_recovery'::text, 'companion_kickoff'::text, 'companion_morning'::text, 'companion_spark'::text, 'companion_fact'::text, 'companion_open'::text, 'companion_wind'::text, 'companion_progress'::text, 'companion_log'::text, 'companion_close'::text, 'daily_heartbeat'::text, 'log_recovery'::text, 'buddy_evening'::text])));

-- ── notification_duplicate_suppressions ─────────────────────────────────────
alter table public.notification_duplicate_suppressions add constraint notification_duplicate_suppressions_pkey primary key (id);
alter table public.notification_duplicate_suppressions add constraint notification_duplicate_suppressions_student_id_fkey foreign key (student_id) references profiles(id) on delete cascade;
create index notification_duplicate_suppressions_at_idx on public.notification_duplicate_suppressions using btree (suppressed_at desc);

-- ── refund_requests ─────────────────────────────────────────────────────────
-- NOTE the FK target: auth.users, not profiles. Reproduced as production has
-- it. It is the only table in this set that reaches outside the public schema,
-- which matters when building fixtures — a profile row alone is not enough.
alter table public.refund_requests add constraint refund_requests_pkey primary key (id);
alter table public.refund_requests add constraint refund_requests_student_id_key unique (student_id);
alter table public.refund_requests add constraint refund_requests_student_id_fkey foreign key (student_id) references auth.users(id) on delete cascade;
alter table public.refund_requests add constraint refund_requests_status_check check ((status = any (array['pending'::text, 'approved'::text, 'rejected'::text])));

-- ── google_oauth_tokens ─────────────────────────────────────────────────────
alter table public.google_oauth_tokens add constraint google_oauth_tokens_pkey primary key (user_id);
alter table public.google_oauth_tokens add constraint google_oauth_tokens_user_id_fkey foreign key (user_id) references profiles(id) on delete cascade;
