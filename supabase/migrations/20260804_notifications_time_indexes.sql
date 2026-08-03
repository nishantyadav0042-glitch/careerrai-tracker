-- notifications has no index on created_at or pushed_at, so every admin
-- surface that windows on time (launch-metrics 24h fetch, notification-health,
-- momentum, mission-queue "pushed_at >= 7d ago") full-table-scans a table that
-- only grows. Found by the 2026-08-03 admin metric audit (P3).
--
-- Partial index on pushed_at because every reader also filters
-- `pushed_at IS NOT NULL` — unpushed in-app rows never qualify.

create index if not exists idx_notifications_created_at
  on public.notifications (created_at desc);

create index if not exists idx_notifications_pushed_at
  on public.notifications (pushed_at desc)
  where pushed_at is not null;
