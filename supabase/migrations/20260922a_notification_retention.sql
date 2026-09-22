-- ── THE NOTIFICATION TRAY IS NOT AN ARCHIVE ─────────────────────────────────
--
-- Measured 22 Sep 2026. Production is 431 MB against the free tier's 500 MB,
-- growing ~3.9 MB a day: read-only around 10 October, which means students
-- cannot log study and counsellors cannot mark a card.
--
-- `notifications` is 106.7 MB of it and is the fastest-growing table in the
-- database — 73 MB on 7 Sep, 88 on 13 Sep, 106.7 today, about 57% of all
-- growth. The telemetry sweep (20260908a) cannot touch it: its rails allow
-- two tables and this is not one of them, deliberately, because this table
-- also holds payment receipts, session reminders and escalations.
--
-- What is actually growing is one thing. 128,537 of the table's 161,956 rows
-- (79%) are the Study Companion's four daily slots, and 5,039 rows a day
-- arrive at a base of 1,232 students. Of the last seven days' companion rows,
-- 69% never left the building — send_status 'created', pushed_at null, no
-- endpoint to send to — and across fourteen days the whole cadence produced
-- 48 clicks. We are paying disk to store notifications nobody was sent.
--
-- WHY THIS IS A SEPARATE FUNCTION, not a third branch of sweep_telemetry:
-- the blast radius is different in kind. sweep_telemetry destroys
-- instrumentation. This destroys rows a student can see. Different rails
-- belong on different sides of a wall, and a caller that wants one must ask
-- for it by name.
--
-- THE RAILS:
--
--   1. Companion types only. Not "an explicit list" — an explicit list whose
--      every element matches 'companion\_%'. A bad deploy, a typo or a
--      compromised caller cannot reach payment_success, session_reminder or
--      escalation, because the DATABASE refuses the type, not the caller.
--   2. Delivery must be named: 'pushed' or 'unpushed', never both at once and
--      never omitted. The two have different readers and therefore different
--      windows, and a sweep that does not know which it is deleting is a bug.
--   3. Cutoff at least 14 days old — twice the telemetry rail, because these
--      rows are student-visible and a short window is how you delete
--      something someone is still looking at.
--   4. Never a row the decision engine still references. decision_log's FK is
--      NO ACTION, so one such row would raise and take the whole batch with
--      it; the NOT EXISTS makes "still accounted for" mean "not expired"
--      rather than "nightly failure". (0 such rows today; the column is
--      populated by code that ships, not by history.)
--   5. service_role only. Never anon, never authenticated.
--
-- notification_deliveries cascades on delete and is swept along with its
-- parent. That is intended: a delivery record for a deleted notification is
-- an orphan, and it is 6.1 MB of the same problem.
--
-- Batched by ctid, and 25s of statement timeout for the same reason
-- 20260911a gave sweep_telemetry it: the final batch of a drain must scan the
-- whole qualifying range to prove there is nothing left, and that is the one
-- that runs long. There is no index on (type, created_at) here and this
-- migration does not add one — an index to make a space-reclaiming sweep
-- faster would cost megabytes of the space it reclaims, and a bounded seq
-- scan at 03:20 IST is the cheaper side of that trade.

create or replace function public.sweep_notifications(
  p_types    text[],
  p_delivery text,
  p_cutoff   timestamptz,
  p_limit    integer
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
set statement_timeout = '25s'
as $$
declare
  v_deleted integer := 0;
  v_type    text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 50000 then
    raise exception 'sweep_notifications: p_limit must be between 1 and 50000, got %', p_limit;
  end if;

  -- Rail 3. Twice the telemetry cutoff: these rows are student-visible.
  if p_cutoff is null or p_cutoff > now() - interval '14 days' then
    raise exception 'sweep_notifications: cutoff must be at least 14 days old, got %', p_cutoff;
  end if;

  -- Rail 1. An explicit list, every element of it a companion slot.
  if p_types is null or coalesce(array_length(p_types, 1), 0) = 0 then
    raise exception 'sweep_notifications: an explicit type list is required';
  end if;
  foreach v_type in array p_types loop
    if v_type is null or v_type !~ '^companion_[a-z]+$' then
      raise exception 'sweep_notifications: % is not a companion type and may never be swept', coalesce(v_type, '<null>');
    end if;
  end loop;

  -- Rail 2. Say which half you mean.
  if p_delivery is null or p_delivery not in ('pushed', 'unpushed') then
    raise exception 'sweep_notifications: p_delivery must be ''pushed'' or ''unpushed'', got %', coalesce(p_delivery, '<null>');
  end if;

  with doomed as (
    select n.ctid
    from public.notifications n
    where n.created_at < p_cutoff
      and n.type = any(p_types)
      and ((p_delivery = 'unpushed' and n.pushed_at is null)
        or (p_delivery = 'pushed'   and n.pushed_at is not null))
      -- Rail 4.
      and not exists (select 1 from public.decision_log d where d.notification_id = n.id)
    limit p_limit
  )
  delete from public.notifications t using doomed d where t.ctid = d.ctid;
  get diagnostics v_deleted = row_count;

  return v_deleted;
end
$$;

revoke all on function public.sweep_notifications(text[], text, timestamptz, integer) from public;
revoke all on function public.sweep_notifications(text[], text, timestamptz, integer) from anon;
revoke all on function public.sweep_notifications(text[], text, timestamptz, integer) from authenticated;
grant execute on function public.sweep_notifications(text[], text, timestamptz, integer) to service_role;

comment on function public.sweep_notifications(text[], text, timestamptz, integer) is
  'Batched deletion of expired Study Companion notifications. Companion types only (enforced by pattern, not by the caller); delivery half must be named; cutoff >= 14 days; never a row decision_log still references. notification_deliveries cascades. service_role only.';
