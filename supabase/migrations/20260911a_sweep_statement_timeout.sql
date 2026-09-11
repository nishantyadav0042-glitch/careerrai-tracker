-- ── THE SWEEP'S LAST BATCH IS THE EXPENSIVE ONE ─────────────────────────────
--
-- Two nights running, `sweep_telemetry` returned "canceling statement due to
-- statement timeout" on the write-only rule. The first night (batch 20,000) it
-- deleted 0. The second night (batch 2,000) it deleted 8,000 — four clean
-- batches — and died on the fifth.
--
-- Measured on production rather than guessed at:
--
--   a FULL batch of 2,000 rows          ~0.24 ms/row
--   the FINAL batch, 556 rows           5.7 SECONDS, ~10 ms/row
--
-- The cost is not the delete. When fewer rows remain than the limit, the scan
-- cannot stop early — it has to traverse the whole qualifying range, through
-- every dead tuple the previous batches left behind, to PROVE there is nothing
-- more to find. So the timeout lands on the last batch of a drain, precisely
-- when the work is already done, and it will land there every night the sweep
-- catches up. Which is now every night.
--
-- Shrinking the batch does not help: it makes the final scan MORE frequent.
-- The statement is legitimate and bounded — p_limit caps the work, the rails
-- above cap the blast radius — it is simply slower than the default cap when
-- it has to prove exhaustion. So give this one function room.
--
-- 25s, against a route maxDuration of 300 and a nightly 03:20 IST run when the
-- app is asleep. Function-scoped: nothing else in the database is affected.

create or replace function public.sweep_telemetry(
  p_table  text,
  p_events text[],
  p_cutoff timestamptz,
  p_limit  integer
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
set statement_timeout = '25s'
as $$
declare
  v_deleted integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 50000 then
    raise exception 'sweep_telemetry: p_limit must be between 1 and 50000, got %', p_limit;
  end if;
  if p_cutoff is null or p_cutoff > now() - interval '7 days' then
    raise exception 'sweep_telemetry: cutoff must be at least 7 days old, got %', p_cutoff;
  end if;

  if p_table = 'student_events' then
    -- Rail 2. The learning loop lives in this table; a sweep must name what it
    -- is deleting. An empty or null list is a bug, not "sweep everything".
    if p_events is null or coalesce(array_length(p_events, 1), 0) = 0 then
      raise exception 'sweep_telemetry: student_events requires an explicit event list';
    end if;
    with doomed as (
      select ctid from public.student_events
      where created_at < p_cutoff and event = any(p_events)
      limit p_limit
    )
    delete from public.student_events t using doomed d where t.ctid = d.ctid;
    get diagnostics v_deleted = row_count;

  elsif p_table = 'perf_events' then
    -- Page-load timings. Read only by /admin/perf, which looks back one week.
    with doomed as (
      select ctid from public.perf_events where created_at < p_cutoff limit p_limit
    )
    delete from public.perf_events t using doomed d where t.ctid = d.ctid;
    get diagnostics v_deleted = row_count;

  else
    raise exception 'sweep_telemetry: table % is not sweepable', p_table;
  end if;

  return v_deleted;
end
$$;

revoke all on function public.sweep_telemetry(text, text[], timestamptz, integer) from public;
revoke all on function public.sweep_telemetry(text, text[], timestamptz, integer) from anon;
revoke all on function public.sweep_telemetry(text, text[], timestamptz, integer) from authenticated;
grant execute on function public.sweep_telemetry(text, text[], timestamptz, integer) to service_role;

comment on function public.sweep_telemetry(text, text[], timestamptz, integer) is
  'Batched telemetry deletion. Two tables only; student_events requires an explicit event list so the learning loop (app_open, push_*, auth_*) can never be swept by accident; cutoff must be >= 7 days old; 25s statement timeout because the final batch of a drain must scan the whole range to prove exhaustion. service_role only.';
