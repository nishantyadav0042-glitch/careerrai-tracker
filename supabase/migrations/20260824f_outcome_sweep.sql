-- ── The other half of the learning loop ─────────────────────────────────────
--
-- The ledger records what a rep DID and what the student SAID. This records
-- what the student then actually did — and it is written by the product, from
-- daily_reports, never by the rep. That split is the only reason the outcome
-- columns are worth anything as evidence.
--
-- WHAT THIS IS NOT: it is not attribution. `logged_d3 = true` means "this
-- student logged within three days of being contacted". It does NOT mean the
-- contact caused it, and no column here is named as though it did. Comparing
-- reached against unreached WITHIN THE SAME LANE is the founder view's job;
-- this function only establishes the facts that comparison needs.

-- ── 1. Outcomes are facts about the past ────────────────────────────────────
-- Once measured, an outcome cannot be re-measured into a different answer. The
-- sweep is written to only fill NULLs, but "the code is careful" is not an
-- invariant — this is.

create or replace function public.intervention_outcome_immutable()
returns trigger
language plpgsql
as $$
declare
  col text;
begin
  foreach col in array array['logged_same_day','logged_d1','logged_d3','logged_d7',
                             'sustained_7d','streak_resumed','session_booked','session_completed']
  loop
    if (to_jsonb(old) -> col) <> 'null'::jsonb
       and (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      raise exception 'intervention_ledger: % is already measured and cannot be changed', col
        using errcode = 'check_violation';
    end if;
  end loop;

  -- The act itself is history too. A reason can be corrected by a human while
  -- it is fresh; who was contacted, when, and in what state cannot.
  if new.student_id <> old.student_id or new.rep_id <> old.rep_id
     or new.occurred_at <> old.occurred_at or new.state_before <> old.state_before then
    raise exception 'intervention_ledger: the intervention record itself is append-only'
      using errcode = 'check_violation';
  end if;

  return new;
end
$$;

drop trigger if exists intervention_outcome_immutable_guard on public.intervention_ledger;
create trigger intervention_outcome_immutable_guard
  before update on public.intervention_ledger
  for each row
  execute function public.intervention_outcome_immutable();

-- ── 2. The sweep ────────────────────────────────────────────────────────────
--
-- MATURITY IS THE WHOLE DESIGN. A window that has not elapsed has no answer,
-- and writing `false` into it early is not a conservative default — it is a
-- fabricated negative that would permanently understate every intervention
-- measured near the present. An unelapsed window stays NULL, and the founder
-- view renders NULL as "not yet measurable", never as a failure.

create or replace function public.sweep_intervention_outcomes(p_limit int default 500)
returns table (candidates int, measured int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidates int;
  v_measured int;
begin
  -- Dropped explicitly as well as ON COMMIT: calling the sweep twice inside
  -- one transaction (a test, a manual re-run) would otherwise fail on an
  -- already-existing temp table.
  drop table if exists _sweep;
  create temp table _sweep on commit drop as
  select l.id,
         l.student_id,
         l.occurred_at,
         -- Contact is restricted to 09:00–21:00 IST, so an intervention can
         -- never fall in the 00:00–05:30 IST window where the IST calendar
         -- date and the 5:30am study day disagree.
         ((l.occurred_at at time zone 'Asia/Kolkata')::date) as d0
  from public.intervention_ledger l
  where (l.logged_d1 is null and l.occurred_at < now() - interval '1 day')
     or (l.logged_d3 is null and l.occurred_at < now() - interval '3 days')
     or (l.logged_d7 is null and l.occurred_at < now() - interval '7 days')
  order by l.occurred_at
  limit p_limit;

  select count(*) into v_candidates from _sweep;

  with facts as (
    select s.id, s.d0, s.occurred_at, s.student_id,
      -- Cumulative "within N days", and DELIBERATELY EXCLUDING the day of the
      -- call: report_date is a date, so a same-day log may well have happened
      -- hours BEFORE the rep dialled. Counting it as an outcome would credit
      -- the intervention with a log that preceded it.
      (exists (select 1 from public.daily_reports r where r.student_id = s.student_id
                and r.report_date > s.d0 and r.report_date <= s.d0 + 1)) as l1,
      (exists (select 1 from public.daily_reports r where r.student_id = s.student_id
                and r.report_date > s.d0 and r.report_date <= s.d0 + 3)) as l3,
      (exists (select 1 from public.daily_reports r where r.student_id = s.student_id
                and r.report_date > s.d0 and r.report_date <= s.d0 + 7)) as l7,
      -- Recorded as context, never as an outcome, for the ordering reason above.
      (exists (select 1 from public.daily_reports r where r.student_id = s.student_id
                and r.report_date = s.d0)) as lsame,
      -- Did it STICK: three separate days inside the week, not one polite log.
      (select count(distinct r.report_date) from public.daily_reports r
        where r.student_id = s.student_id
          and r.report_date > s.d0 and r.report_date <= s.d0 + 7) as days7,
      -- Two consecutive days — a rhythm restarting rather than one tap.
      (exists (select 1 from public.daily_reports a
                join public.daily_reports b
                  on b.student_id = a.student_id and b.report_date = a.report_date + 1
               where a.student_id = s.student_id
                 and a.report_date > s.d0 and a.report_date <= s.d0 + 6)) as consec,
      (exists (select 1 from public.video_sessions v where v.student_id = s.student_id
                and v.created_at > s.occurred_at
                and v.created_at <= s.occurred_at + interval '7 days')) as booked,
      (exists (select 1 from public.video_sessions v where v.student_id = s.student_id
                and v.created_at > s.occurred_at
                and v.created_at <= s.occurred_at + interval '7 days'
                and v.session_status = 'completed')) as done
    from _sweep s
  )
  update public.intervention_ledger l
     set -- coalesce(existing, new) — an already-measured window keeps its
         -- answer. Combined with the immutability trigger this is belt and
         -- braces, on purpose: this is the table the funding conversation
         -- will be argued from.
         logged_same_day = coalesce(l.logged_same_day,
           case when l.occurred_at < now() - interval '1 day' then f.lsame end),
         logged_d1 = coalesce(l.logged_d1,
           case when l.occurred_at < now() - interval '1 day' then f.l1 end),
         logged_d3 = coalesce(l.logged_d3,
           case when l.occurred_at < now() - interval '3 days' then f.l3 end),
         logged_d7 = coalesce(l.logged_d7,
           case when l.occurred_at < now() - interval '7 days' then f.l7 end),
         sustained_7d = coalesce(l.sustained_7d,
           case when l.occurred_at < now() - interval '7 days' then f.days7 >= 3 end),
         streak_resumed = coalesce(l.streak_resumed,
           case when l.occurred_at < now() - interval '7 days' then f.consec end),
         session_booked = coalesce(l.session_booked,
           case when l.occurred_at < now() - interval '7 days' then f.booked end),
         session_completed = coalesce(l.session_completed,
           case when l.occurred_at < now() - interval '7 days' then f.done end),
         outcome_measured_at = now()
    from facts f
   where l.id = f.id;

  get diagnostics v_measured = row_count;

  return query select v_candidates, v_measured;
end
$$;

-- Cron and server code reach this through the service role. Students and
-- anonymous callers have no business measuring outcomes at all.
revoke all on function public.sweep_intervention_outcomes(int) from public, anon, authenticated;
grant execute on function public.sweep_intervention_outcomes(int) to service_role;

comment on function public.sweep_intervention_outcomes(int) is
  'Observation only. Fills matured outcome windows on intervention_ledger from daily_reports and video_sessions. Never overwrites a measured window, never writes an unelapsed one, and asserts no causal claim.';

create index if not exists intervention_ledger_unmeasured_idx
  on public.intervention_ledger (occurred_at)
  where logged_d7 is null;
