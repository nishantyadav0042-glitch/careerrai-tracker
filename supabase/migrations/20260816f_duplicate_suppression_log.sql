-- Notification Reliability V2, Installment 5, Phase 6 — make the PRODUCTION
-- duplicate rate measurable, not merely inferable.
--
-- Founder review of Installment 4, verbatim: "0 confirmed in the concurrency
-- test != 0 duplicate rate in production... add explicit duplicate_suppressed
-- events/counters so the production rate becomes measurable. Do not rely only
-- on the unique constraint rejecting an insert."
--
-- Exactly the gap this closes: when the once-per-day unique index rejects a
-- racing insert, dispatch() correctly returns 'duplicate_suppressed' — but
-- the notifications row was never created (that's the point), so there was
-- nothing anywhere to count. The suppression was real and completely
-- invisible. Each row here is one genuine prevented duplicate.
create table if not exists notification_duplicate_suppressions (
  id bigint generated always as identity primary key,
  student_id uuid not null references profiles(id) on delete cascade,
  notification_type text not null,
  suppressed_at timestamptz not null default now(),
  -- 'db_unique_index'  = Postgres 23505 from notifications_once_per_day_per_type
  --                      (a genuine concurrent race that reached the database)
  -- 'app_precheck'     = a cron's own same-day check caught it first
  --                      (cheaper, and the common case — never reaches the DB)
  detected_by text not null
);

create index if not exists notification_duplicate_suppressions_at_idx
  on notification_duplicate_suppressions (suppressed_at desc);

comment on table notification_duplicate_suppressions is
  'One row per PREVENTED duplicate notification. Written by dispatch() when the unique index rejects a same-day repeat (detected_by=db_unique_index). Makes the production duplicate-suppression rate a measured number instead of an inference from the absence of duplicates.';
