-- Optimistic concurrency for in-place plan edits.
--
-- add-block, swap-topic and busy-day all read daily_routines.tasks (a JSONB
-- array), modify it in memory, and write the whole array back filtered only by
-- (student_id, routine_date). Two edits that overlap therefore silently lose
-- one of them: tap "one more block" while a swap is in flight and the swap is
-- gone, or the block is, with no error either way. add-block additionally
-- computes est_minutes from its own stale read, so the row's minutes can drift
-- out of agreement with the tasks it holds — which the integrity gate then
-- reports as a corrupt plan with no explanation of how it got there.
--
-- A version counter turns each of those into a compare-and-swap: the writer
-- states which version it read, the UPDATE matches on it, and a write that
-- lost the race changes 0 rows and is retried against fresh state instead of
-- overwriting. See src/lib/plan-mutate.ts.
--
-- Default 0 and NOT NULL so every existing row is immediately valid.

alter table public.daily_routines
  add column if not exists version integer not null default 0;

comment on column public.daily_routines.version is
  'Optimistic-concurrency counter. Bumped by every in-place task edit (add-block, swap-topic, busy-day) via src/lib/plan-mutate.ts. Never written by hand.';
