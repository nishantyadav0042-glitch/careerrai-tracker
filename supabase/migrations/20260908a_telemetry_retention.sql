-- ── TELEMETRY RETENTION ─────────────────────────────────────────────────────
--
-- Production sits on Supabase's free tier: a 500 MB ceiling, 379 MB used on
-- 7 Sep 2026, growing ~15 MB a day. At that rate writes start failing around
-- 15 September and students cannot log study. Three tables are 290 MB of the
-- 379, and all three are telemetry — nothing a student produced.
--
-- The dangerous version of this fix is a DELETE with a date in it. student_events
-- also carries the learning loop: `app_open` feeds the activation funnel, which
-- compares July's cohort against September's and has NO time filter by design.
-- Deleting by age alone would quietly destroy the one measurement the company
-- runs on, and nothing would fail loudly when it did.
--
-- So the rails live HERE, not in the caller:
--
--   1. Only two tables can ever be swept. Anything else raises.
--   2. student_events REQUIRES an explicit event list. There is no code path,
--      no bug and no bad deploy that can sweep the table wholesale — the worst
--      a caller can do is delete the event names it names.
--   3. The cutoff must be at least 7 days old. "Delete everything since
--      yesterday" is not expressible.
--   4. service_role only. Never anon, never authenticated.
--
-- Batched by ctid so one call is one bounded statement: no long lock, no
-- statement timeout, and a partial sweep simply resumes on the next call.

create or replace function public.sweep_telemetry(
  p_table  text,
  p_events text[],
  p_cutoff timestamptz,
  p_limit  integer
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
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
  'Batched telemetry deletion. Two tables only; student_events requires an explicit event list so the learning loop (app_open, push_*, auth_*) can never be swept by accident; cutoff must be >= 7 days old. service_role only.';
