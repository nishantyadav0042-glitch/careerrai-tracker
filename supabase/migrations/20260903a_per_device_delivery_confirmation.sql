-- ── ONE DELIVERY FACT PER (NOTIFICATION, DEVICE) ────────────────────────────
--
-- Task #79, found in the 3 Sep reach audit.
--
-- notification_deliveries.device_confirmed_at was populated in 0 of 682 rows,
-- and notification_endpoints.last_delivery_confirmed_at in 0 of 171. The
-- columns shipped in 20260901a; nothing ever wrote them, because the service
-- worker's arrival beacon carries only a notification id. Every receipt was
-- therefore keyed to a STUDENT, never to the DEVICE that displayed it.
--
-- That was harmless only by accident: the Step 1 backfill made the registry
-- exactly one endpoint per student (171 rows, 171 distinct URLs, 171 distinct
-- students), so student-level receipt happened to equal device-level receipt.
-- Step 2 (3 Sep) enabled many endpoints per student. The first student to
-- register a second device makes every reach number ambiguous.
--
-- This index is what makes the confirmation IDEMPOTENT rather than merely
-- usually-fine. A push event can fire the beacon more than once (the SW
-- retries once on a failed POST, and the OS may replay a push), and two
-- beacons racing must not be able to write two delivery facts for the same
-- (notification, device). Uniqueness in the DATABASE is the only thing that
-- holds under genuine concurrency — a read-then-write in application code is
-- a race with good intentions, the same lesson already paid for in
-- 20260828c (activation is refund-final).
--
-- Verified safe to build before writing it: on 3 Sep production held 682
-- delivery rows, 0 duplicate (notification_id, endpoint_id) pairs and 0 rows
-- with either key null, so this index builds without a cleanup step.
--
-- recordDelivery() upserts on this constraint from here on, so a legitimate
-- re-send to the same endpoint UPDATES its delivery row instead of raising a
-- unique violation — and deliberately does not touch device_confirmed_at,
-- so a re-send can never erase a confirmation the device already gave us.

create unique index if not exists notification_deliveries_unique_attempt
  on notification_deliveries (notification_id, endpoint_id);

comment on index notification_deliveries_unique_attempt is
  'One delivery fact per (notification, endpoint). Makes the service worker''s arrival beacon idempotent under concurrent/replayed pushes, and is the conflict target recordDelivery() upserts on.';
