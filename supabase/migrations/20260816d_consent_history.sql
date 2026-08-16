-- Notification Reliability V2, Installment 4, Batch C — an immutable
-- consent/subscription audit trail. Every write to notif_prefs.push or
-- push_subscription so far has been a point-in-time overwrite — the
-- CURRENT state is knowable, but "what happened, in what order" never was.
-- This table is append-only by convention (no UPDATE/DELETE path is ever
-- written against it): current state stays on profiles exactly as before;
-- this is the history that state doesn't carry.
create table if not exists notification_consent_events (
  id bigint generated always as identity primary key,
  student_id uuid not null references profiles(id) on delete cascade,
  event_type text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists notification_consent_events_student_idx
  on notification_consent_events (student_id, created_at desc);

comment on table notification_consent_events is
  'Append-only. event_type in: permission_granted, permission_denied, subscription_created, subscription_refreshed, subscription_died, recovery_required, recovery_attempted, recovery_succeeded, recovery_failed, user_disabled_notifications. detail carries the real reason where one exists (push_died_at status, push_recovery_last_error, etc.) — never invented.';
