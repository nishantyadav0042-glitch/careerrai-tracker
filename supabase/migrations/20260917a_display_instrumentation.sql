-- ── DID THE NOTIFICATION ACTUALLY REACH THE SCREEN? ─────────────────────────
--
-- Founder audit, 17 Sep 2026. The push chain had one dark segment:
--
--   provider accepted → [SW woke] → ??? → student sees it
--
-- `device_confirmed_at` proves only that the service worker executed. sw.js
-- fires that beacon as a SIBLING of showNotification(), never conditional on
-- it, so the two facts are independent:
--
--   • a notification can be DISPLAYED while the beacon fails — measured at
--     13.6% of all clicked notifications (40 of 295), and a click is proof of
--     display, so that is a hard floor, not an estimate;
--   • a service worker can wake, beacon successfully, and display NOTHING —
--     which is exactly what happens when a student revokes notification
--     permission while the push subscription stays valid. The provider keeps
--     accepting, the SW keeps waking, and the screen stays empty. Today that
--     failure is completely invisible.
--
-- These columns close that segment. All additive, all nullable, NO BACKFILL:
-- for every row written before this migration we genuinely do not know whether
-- the notification was displayed, and a guessed value would be worse than a
-- NULL (ENGINEERING-MEMORY L1 — a trustworthy UNKNOWN beats a precise lie).

-- Device-level: which physical device rendered this copy.
alter table notification_deliveries
  add column if not exists displayed_at        timestamptz,
  add column if not exists display_status      text,
  add column if not exists display_error       text,
  add column if not exists permission_at_push  text;

-- display_status is the OUTCOME of showNotification() on the device:
--   'shown'   — the promise resolved; the browser handed it to the OS
--   'failed'  — the promise rejected; display_error carries why
--   'unknown' — the SW could not determine it (defensive; should be rare)
alter table notification_deliveries
  drop constraint if exists notification_deliveries_display_status_chk;
alter table notification_deliveries
  add constraint notification_deliveries_display_status_chk
  check (display_status is null or display_status in ('shown','failed','unknown'));

-- permission_at_push is Notification.permission READ ON THE DEVICE at the
-- instant the push arrived. 'denied' beside a live subscription is the silent
-- failure this whole migration exists to surface.
alter table notification_deliveries
  drop constraint if exists notification_deliveries_permission_chk;
alter table notification_deliveries
  add constraint notification_deliveries_permission_chk
  check (permission_at_push is null or permission_at_push in ('granted','denied','default','unsupported'));

-- Student-level mirror, matching the existing received_at/device_confirmed_at
-- pairing. A student still on the legacy profiles.push_subscription column
-- sends no endpointId and therefore has no delivery row; without this they
-- would contribute no display evidence at all.
alter table notifications
  add column if not exists displayed_at timestamptz;

-- The reach query this is built to answer: "of pushes the provider accepted,
-- how many actually rendered?" — partial, so it stays small.
create index if not exists notification_deliveries_displayed_idx
  on notification_deliveries (displayed_at)
  where displayed_at is not null;

create index if not exists notification_deliveries_display_status_idx
  on notification_deliveries (display_status)
  where display_status is not null;

comment on column notification_deliveries.displayed_at is
  'showNotification() RESOLVED on the device. Proves the browser rendered it to the OS notification surface. Does NOT prove a human looked at the screen — only a click proves that.';
comment on column notification_deliveries.permission_at_push is
  'Notification.permission read on the device when the push arrived. denied + a live subscription = silent failure.';
