-- ── ONE STUDENT → MANY NOTIFICATION ENDPOINTS ───────────────────────────────
--
-- 1 Sep 2026. `profiles.push_subscription` is a single jsonb column — the
-- schema itself can hold only ONE live device per student. Install on a
-- second device and the newer subscribe silently overwrites the older one;
-- there is no way to reach both a phone and a laptop, and no way to tell
-- "this student has no device" apart from "this student's second device just
-- evicted their first." Founder decision, same day: replace the single column
-- with a real one-to-many registry, one authority, before ANY iOS-native
-- (APNs) work is even possible — a native device token needs somewhere to
-- live that isn't a second jsonb column bolted on next to the first.
--
-- This migration is Step 1 only: additive, zero behaviour change. Nothing
-- yet reads or writes these tables — profiles.push_subscription keeps
-- working exactly as it does today. Step 2 (rewiring sendPushToUser and the
-- two registration routes to read/write this table, dual-write first) is
-- deliberately a separate, independently-tested change to the live send path
-- for ~900 students' daily notifications.

create table if not exists notification_endpoints (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  -- Today only 'web_push' is ever written. 'apns' is reserved for the native
  -- iOS wrapper — there is no ios/ project in this repo to register a device
  -- token from yet (see docs/APP-STORE-SUBMISSION.md), so this value can
  -- exist in the schema years before anything writes it, which is the point:
  -- the day a native app registers a token, it has a home, no new migration.
  provider text not null check (provider in ('web_push', 'apns')),
  platform text not null check (platform in ('android', 'ios', 'desktop', 'unknown')),
  -- Mirrors journey.ts's DisplayMode — where this endpoint was captured.
  app_context text check (app_context in ('standalone', 'twa', 'ios_app', 'browser', 'unknown')),
  -- web_push: the full PushSubscription object (endpoint + keys).
  subscription jsonb,
  -- apns: the device token string. Exactly one of subscription/device_token
  -- is populated, matching which `provider` the row declares.
  device_token text,
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_push_sent_at timestamptz,
  last_delivery_confirmed_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_endpoints_payload_matches_provider check (
    (provider = 'web_push' and subscription is not null and device_token is null)
    or (provider = 'apns' and device_token is not null and subscription is null)
    or (revoked_at is not null) -- a revoked row may have had its payload cleared
  )
);

comment on table notification_endpoints is
  'One row per device a student can be pushed to. Replaces profiles.push_subscription (single-device). A student may have many live rows at once.';

-- A live web_push endpoint is unique per (student, subscription endpoint URL) —
-- stops the same browser registering itself twice, without limiting a
-- student to one browser.
create unique index if not exists notification_endpoints_unique_web_push
  on notification_endpoints (student_id, (subscription ->> 'endpoint'))
  where provider = 'web_push' and revoked_at is null;

create unique index if not exists notification_endpoints_unique_apns
  on notification_endpoints (student_id, device_token)
  where provider = 'apns' and revoked_at is null;

create index if not exists notification_endpoints_student_live_idx
  on notification_endpoints (student_id)
  where revoked_at is null;

alter table notification_endpoints enable row level security;

-- Students never read this table directly (no client-facing endpoint list UI
-- exists), so the only policy needed today is server (service-role) access,
-- which bypasses RLS entirely. This blocks the anon/authenticated roles
-- outright rather than leaving the table wide open by omission.
create policy "service role only" on notification_endpoints
  for all using (false) with check (false);

-- ── PER-ENDPOINT DELIVERY EVIDENCE ──────────────────────────────────────────
--
-- `notifications` stays exactly as-is: one row per logical decision to notify
-- a student (the budget/dedup/state-machine authority in notification-os.ts
-- is unchanged by this migration). This table adds the layer underneath it:
-- one row per (notification, endpoint) actually attempted, so "sent to the
-- student" and "delivered to this specific phone" are no longer the same
-- fact conflated into notifications.pushed_at.
create table if not exists notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  endpoint_id uuid not null references notification_endpoints(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  provider_accepted_at timestamptz,
  device_confirmed_at timestamptz,
  failed_at timestamptz,
  fail_reason text,
  created_at timestamptz not null default now()
);

comment on table notification_deliveries is
  'One row per endpoint a given notification was attempted on. attempted -> provider_accepted_at -> device_confirmed_at is the real per-device funnel; a notification with 2 live endpoints produces 2 rows here.';

create index if not exists notification_deliveries_notification_id_idx
  on notification_deliveries (notification_id);
create index if not exists notification_deliveries_endpoint_id_idx
  on notification_deliveries (endpoint_id);

alter table notification_deliveries enable row level security;
create policy "service role only" on notification_deliveries
  for all using (false) with check (false);

-- ── BACKFILL: every live subscription today becomes endpoint #1 ────────────
--
-- Not a cutover — a snapshot. profiles.push_subscription keeps being the
-- live source of truth until Step 2 rewires the write paths; this just gives
-- the new table real starting data so Step 2 has something to dual-write
-- against instead of an empty table.
--
-- `platform` has no column of its own on profiles — student_events does
-- (populated client-side by journey.ts's detectPlatform()). Joining each
-- student's most recent event for it is the same technique the 1 Sep
-- reachability audit used; guessing platform FROM push_context (a display
-- mode, not a platform) would have been wrong on desktop and on TWA.
with last_platform as (
  select distinct on (user_id) user_id, platform
  from student_events
  where user_id is not null and platform is not null
  order by user_id, created_at desc
)
insert into notification_endpoints (
  student_id, provider, platform, app_context, subscription,
  registered_at, last_seen_at, last_delivery_confirmed_at
)
select
  p.id,
  'web_push',
  coalesce(lp.platform, 'unknown'),
  coalesce(p.push_context, 'unknown'),
  p.push_subscription,
  coalesce(p.push_subscribed_at, p.created_at, now()),
  coalesce(p.push_verified_at, p.push_subscribed_at, p.created_at, now()),
  p.push_verified_at
from profiles p
left join last_platform lp on lp.user_id = p.id
where p.push_subscription is not null
  and p.push_died_at is null
on conflict do nothing;
