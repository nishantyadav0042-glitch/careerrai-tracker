-- Notification Reliability V2, Installment 2, Part 1/6/8 — the recovery
-- lifecycle. Investigating the 49 provider-dead students from Installment 1
-- found the real reason recovery was invisible: push-healer.tsx's catch
-- block was `/* silent — never break the app over a push heal */`. 7 of the
-- 49 genuinely returned to the app since dying (real /student/* visits,
-- standalone PWA, real device) and none of them healed — but "the healer
-- ran and failed" was indistinguishable from "the healer never ran", because
-- neither left any trace. These two columns make every attempt visible,
-- whether it succeeds or fails.
alter table profiles add column if not exists push_recovery_attempted_at timestamptz;
alter table profiles add column if not exists push_recovery_last_error text;

comment on column profiles.push_recovery_attempted_at is
  'Stamped by push-healer.tsx on EVERY heal attempt while permission is granted and the subscription is unusable — success or failure. Never left silent. Cleared is not applicable here: a fresh successful attempt just moves push_subscribed_at/push_resubscribed_at forward, which classifyRecovery() in notification-state.ts compares against this to derive "recovered".';
comment on column profiles.push_recovery_last_error is
  'The real reason the LAST recovery attempt did not leave the student with an active subscription (e.g. subscribe_threw:AbortError, persist_failed, permission_not_granted). Null when the last attempt succeeded, or when none is on record. Previously this information existed nowhere — the healer''s failure and its cause were both invisible.';
