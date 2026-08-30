-- ── THE PURGE COULD NEVER HAVE WORKED ───────────────────────────────────────
--
-- 30 Aug 2026, Incident #60. `purge-session-handoffs` exists to strip the
-- credential out of a spent hand-off row: it sets `payload = null` the moment
-- a row is used or expired, keeping the row as proof a hand-off happened while
-- the AES-GCM blob of Supabase access+refresh tokens goes away within the hour.
--
-- `payload` was declared NOT NULL. So the scrub's very first statement was
-- rejected by the database on every single run:
--
--   [purge-handoffs] scrub failed: null value in column "payload" of relation
--   "pwa_session_handoff" violates not-null constraint
--
-- Three runs, three identical failures, 595 rows still holding a token pair,
-- oldest from 12 July. The job was not merely ineffective — it had never once
-- completed its first step, and it returned 500 each time, which is the only
-- reason this was visible at all.
--
-- NULLABLE IS THE POINT, not a relaxation. A row whose payload is NULL means
-- "this hand-off happened and its credential has been destroyed". That is a
-- state the schema has to be able to represent, and the NOT NULL forbade it.
-- Rows are still deleted entirely after ROW_TTL_DAYS; this only allows the
-- intermediate state the two-stage design always assumed existed.

alter table public.pwa_session_handoff
  alter column payload drop not null;

comment on column public.pwa_session_handoff.payload is
  'Encrypted Supabase access+refresh token pair. NULL = the hand-off happened and its credential has been scrubbed (see cron/purge-session-handoffs). Never re-add NOT NULL: the purge writes NULL here and a NOT NULL made it fail on every run for days.';
