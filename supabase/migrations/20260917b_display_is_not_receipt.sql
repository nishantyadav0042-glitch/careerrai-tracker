-- ── A SERVICE-WORKER RECEIPT IS NOT PROOF THAT ANYTHING WAS DISPLAYED ───────
--
-- Founder, 17 Sep 2026: "notification dikhna bahut zaroori hai". To fix that we
-- first have to be able to SEE it, and today we cannot.
--
-- THE EVIDENCE THAT FORCED THIS. Over 14 days, 100 notifications were CLICKED —
-- unarguable proof they were rendered on a student's screen. **18 of those 100
-- have `device_confirmed_at = NULL`.** The receipt beacon was lost while the
-- notification was plainly displayed.
--
-- And 18% is a FLOOR, not a ceiling: it is measured only on notifications that
-- were clicked, i.e. on devices whose network was good enough to open the app.
-- Where the beacon died of a bad connection, the click usually died with it.
--
-- So the 53% "device confirmed" rate is not a delivery rate. True delivery sits
-- somewhere between 53% and ~100% and nothing we store can narrow it. Every
-- platform decision taken on that number — including "Android needs a Play
-- Store build" — was taken on a measurement, not on a fact.
--
-- WHAT THIS MIGRATION DOES, AND DELIBERATELY DOES NOT DO.
--
-- Additive only. `device_confirmed_at` keeps its name, its data and its
-- meaning, because it IS the evidence above: destroying it would destroy the
-- audit trail that proved the problem (founder's own correction, 17 Sep).
-- `sw_receipt_at` is its honest twin, written at the same instant, and
-- everything built from here reads the new name. The old column is retired by
-- disuse, not by deletion.
--
-- `displayed_at`, `display_status` and `display_error` ALREADY EXIST on this
-- table and are 100% NULL across all 14,445 deliveries — somebody designed this
-- exact funnel and nothing was ever wired to write it. They are reused rather
-- than duplicated; only the two timestamps that had no home are added.
--
-- WHAT NONE OF THESE COLUMNS MEAN. `displayed_at` records that
-- `showNotification()` RESOLVED — the browser accepted the render request and
-- handed it to the OS. It is not proof a human saw anything. Do Not Disturb,
-- Focus, OEM standby and a screen in a pocket all sit past this boundary, and
-- no web API crosses it. `clicked_at` remains the only production evidence
-- that a student actually saw a notification.
alter table notification_deliveries
  add column if not exists sw_receipt_at timestamptz,
  add column if not exists display_attempted_at timestamptz,
  add column if not exists display_error_at timestamptz;

comment on column notification_deliveries.sw_receipt_at is
  'The service worker woke AND its beacon reached us. A LOWER BOUND on delivery: proven lost on 18% of notifications that were demonstrably displayed (clicked). Never read as a delivery rate.';
comment on column notification_deliveries.device_confirmed_at is
  'RETAINED FOR HISTORY (17 Sep 2026). Same instant as sw_receipt_at, which supersedes it. Kept because it carries the evidence that receipts undercount displays.';
comment on column notification_deliveries.display_attempted_at is
  'showNotification() was called. Proves the SW ran far enough to try.';
comment on column notification_deliveries.displayed_at is
  'showNotification() RESOLVED — the OS accepted the render request. NOT proof a human saw it.';
comment on column notification_deliveries.display_error_at is
  'showNotification() REJECTED — nothing was displayed. On iOS, repeated failures cost the subscription.';
