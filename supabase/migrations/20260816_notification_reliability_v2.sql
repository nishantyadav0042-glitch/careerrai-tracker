-- Notification Reliability V2 — Phase 5, 11, 20
--
-- Phase 20 (schema formalization): received_at (notifications) and
-- push_verified_at / push_subscribed_at / push_resubscribed_at / app_installed_at
-- (profiles) already exist in production — confirmed by direct
-- information_schema query — but appear in no prior migration file, which
-- means a fresh environment built from this repo would not have them. All
-- five ADD COLUMN statements below are IF NOT EXISTS: on production they are
-- no-ops that only formalize history; on a fresh environment they create the
-- columns for the first time. Nothing here alters existing data.
alter table notifications add column if not exists received_at timestamptz;
alter table profiles add column if not exists push_verified_at timestamptz;
alter table profiles add column if not exists push_subscribed_at timestamptz;
alter table profiles add column if not exists push_resubscribed_at timestamptz;
alter table profiles add column if not exists app_installed_at timestamptz;

-- Phase 5: a real send-lifecycle status. dispatch() previously reported
-- 'sent' the moment a database row was written, before the push transport
-- was even attempted — every "N reminded" count in every cron's own log was
-- therefore a row count, not a delivery-attempt count. send_status now
-- carries the actual outcome; send_error carries the transport's own
-- rejection reason (already computed in push.ts's PushResult.reason, but
-- previously discarded); failed_at timestamps a confirmed transport failure
-- the same way pushed_at timestamps a confirmed acceptance.
alter table notifications add column if not exists send_status text;
alter table notifications add column if not exists send_error text;
alter table notifications add column if not exists failed_at timestamptz;

comment on column notifications.send_status is
  'Real transport outcome: created | provider_accepted | failed | duplicate_suppressed. Never optimistic — set only after the actual attempt.';
comment on column notifications.send_error is
  'The push transport''s own failure reason (see push.ts PushResult.reason), e.g. vapid_not_configured, no_subscription, send_failed_410. Null unless send_status = failed.';

-- Phase 11: a database-level backstop against duplicate sends, not just an
-- application-level dedup check. Proven bug: decision-engine had no per-day
-- dedup query at all, and with two live schedulers (Vercel + the GitHub
-- Actions fallback) firing the same cron 15 minutes apart, ~10-20
-- students/day received the identical inactive_recovery push twice.
--
-- Scoped to the exact STUDENT_BUDGET_TYPES list in notification-os.ts — the
-- one shared daily-cadence budget already treats these as "one logical touch
-- per type per day" by design (each Study Companion slot is its own type
-- string, so this holds for every entry, not just the flat-cadence ones).
-- KEEP THIS LIST IN SYNC WITH notification-os.ts's STUDENT_BUDGET_TYPES —
-- src/lib/notification-os.test.ts asserts the two match.
--
-- IST calendar day, matching dispatch()'s own budget-window boundary
-- (midnight IST), not the 05:30 IST study-day boundary used elsewhere —
-- this constraint exists to stop duplicate SENDS of the same cron cycle,
-- which is a midnight-to-midnight IST concept in this codebase already.
--
-- SCOPED TO created_at >= 2026-08-16 13:16 UTC (this migration's own
-- production-verification snapshot) DELIBERATELY. 226 real historical
-- duplicate rows already exist before that point (the exact proven bug this
-- migration fixes) — a unique index over all history would fail to create
-- at all, and silently deleting/merging 226 real rows (some may carry real
-- clicked_at/received_at engagement evidence) is a data-destroying decision
-- this migration does not make unilaterally. History stays as the audit
-- trail of the bug; only new duplicates are now structurally impossible.
create unique index if not exists notifications_once_per_day_per_type
  on notifications (user_id, type, ((created_at at time zone 'Asia/Kolkata')::date))
  where created_at >= '2026-08-16 13:16:00+00'
    and type in (
      'onboarding_morning', 'onboarding_evening', 'activation', 'builder_recovery',
      'revision_due', 'topic_earned', 'mission_changed', 'weekly_evolved', 'inactive_recovery',
      'companion_kickoff', 'companion_morning', 'companion_spark', 'companion_fact', 'companion_open',
      'companion_wind', 'companion_progress', 'companion_log', 'companion_close',
      'daily_heartbeat', 'log_recovery', 'buddy_evening'
    );
