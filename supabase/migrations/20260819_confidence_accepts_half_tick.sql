-- P0, 19 Aug 2026: the half-tick has never been storable.
--
-- 20260706_add_confidence_to_task_completions.sql created:
--   CHECK (confidence IS NULL OR confidence IN ('green','yellow','red'))
--
-- P0-2.1 (18 Aug) then chose 'blue' as HALF_TICK_SIGNAL and began writing it
-- from both the plan card and the log sheet. The constraint predates that by
-- six weeks, so every half-tick insert raises 23514, complete-task returns
-- 500, and the integrated flow's `.catch(() => {})` discards it. The student's
-- "Got halfway" is recorded nowhere, while their credited hours still price it
-- as half a task.
--
-- Confirmed in production before writing this: 269 completion rows exist —
-- 238 'green', 29 legacy NULL, 2 'red'. ZERO 'blue', ever. The value has never
-- once been stored.
--
-- WHY THIS GOES FIRST, ahead of the A1 transaction work: under a single
-- log+completions transaction a rejected half-tick would ROLL BACK THE WHOLE
-- LOG, converting the silent loss of one completion into total loss of the
-- student's day. The landmine has to be cleared before anything is built on it.
--
-- The column carries a SECOND meaning by design (P0-2.1, Incident #23): the
-- plan card has no confidence control, so 'blue' rides the existing column as
-- the portion marker rather than adding a duplicate flag for a two-value state
-- the sheet already encodes. Widening the vocabulary is therefore the intended
-- fix, not a workaround.
--
-- Widening only. The old constraint is DROPPED rather than supplemented,
-- because two CHECKs on one column both apply and a permissive one beside a
-- restrictive one would change nothing. No row is read, rewritten or deleted:
-- every value already stored ('green', 'red', NULL) is still legal afterwards,
-- so the new constraint validates the existing table without touching it.

ALTER TABLE public.routine_task_completions
  DROP CONSTRAINT IF EXISTS routine_task_completions_confidence_check;

ALTER TABLE public.routine_task_completions
  ADD CONSTRAINT routine_task_completions_confidence_check
  CHECK (confidence IS NULL OR confidence IN ('green', 'yellow', 'red', 'blue'));
