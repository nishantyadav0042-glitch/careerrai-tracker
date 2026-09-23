-- ── THE DISPLAY OUTCOME HAS BEEN REJECTED BY A CHECK CONSTRAINT SINCE 17 SEP ──
--
-- Day-1 → Day-2 mission, 22 Sep 2026 (Incident #104).
--
-- notification_deliveries.display_status was given a CHECK constraint on
-- 17 Sep by migration 20260917a_display_instrumentation (applied to production
-- from a pull request that was never merged, PR #203):
--
--     display_status in ('shown', 'failed', 'unknown')
--
-- The code that actually shipped the same day (PR #204, 20260917b) reused the
-- column, reading it as plain text — "displayed_at / display_status /
-- display_error ALREADY EXIST ... 100% NULL" — and writes a different
-- vocabulary from lib/notification-endpoints.ts displayColumns():
--
--     'resolved' | 'error' | 'not_attempted'
--
-- Every UPDATE that carried a display outcome has therefore violated the
-- constraint and been rejected in full. confirmDelivery() did not read the
-- error, so nothing was logged: 0 of 7,238 deliveries in the last seven days
-- have any display column set, and — because between 17 and 22 Sep the
-- display outcome rode the SAME update as the receipt — the receipt was
-- rejected with it. That is the 62% → 12% receipt collapse Incident #102
-- attributed to chaining the beacon behind showNotification(). The chaining
-- may also have cost requests; this constraint provably cost every write that
-- arrived.
--
-- WHAT THIS DOES. Replaces the constraint with one that names the vocabulary
-- the code writes. The code is the authority: it is on main, tested
-- (push-display-truth.guard.test.ts pins 'resolved'/'error'), and the values
-- carry more information than the unmerged ones did ('not_attempted' is a
-- state the old set could not express). A guard test now ties the two
-- together so they cannot drift again (Invariant #2: a rule that lives in
-- code AND config needs a test that joins them).
--
-- Reversible: the DOWN is the old constraint, restated at the bottom. No data
-- is touched — every row is NULL, which both constraints accept.

alter table notification_deliveries
  drop constraint if exists notification_deliveries_display_status_chk;

alter table notification_deliveries
  add constraint notification_deliveries_display_status_chk
  check (display_status is null or display_status in ('resolved', 'error', 'not_attempted'));

comment on column notification_deliveries.display_status is
  'Outcome of showNotification() as the service worker saw it: resolved (the OS accepted the render request), error (it rejected — nothing displayed), not_attempted. Vocabulary is owned by lib/notification-endpoints.ts displayColumns(); a guard test pins this constraint to it. Never proof a human saw anything.';

-- DOWN (do not run unless rolling back the code that writes this vocabulary):
-- alter table notification_deliveries drop constraint if exists notification_deliveries_display_status_chk;
-- alter table notification_deliveries add constraint notification_deliveries_display_status_chk
--   check (display_status is null or display_status in ('shown', 'failed', 'unknown'));
