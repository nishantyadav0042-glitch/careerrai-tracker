-- ═══════════════════════════════════════════════════════════════════════════
-- CAREERRAI — STUDY PLAN ZERO-ERROR GATE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Founder, 14 Aug: "ZERO STUDY-PLAN ERRORS. Not 99%. Not 99.9%. One broken
-- student's study plan is a production failure."
--
-- Run this against production before every deploy. Every row it returns with
-- fails > 0 is a student whose plan is wrong RIGHT NOW. There is no acceptable
-- non-zero number in the `fails` column.
--
--   psql "$DATABASE_URL" -f scripts/plan-integrity-audit.sql
--
-- Each check names the invariant it defends and the failure it would let
-- through. Checks are ordered by blast radius, worst first.
--
-- WHAT THIS CANNOT SEE: it audits stored state, not the code that produced it.
-- A plan can be internally consistent and still be built from a stale input.
-- The code-side invariants (one focus resolver, one plan-date authority, one
-- day-builder per student) are pinned by the vitest guards in
-- src/lib/plan-integrity.guard.test.ts, which runs in the same gate.

\set ON_ERROR_STOP on

with

-- ── 1. ONE STUDENT = ONE AUTHORITATIVE PLAN ───────────────────────────────
-- Backed by UNIQUE (student_id, routine_date). This check is the canary for
-- that constraint being dropped, or for a rebuilt environment that never had
-- it — at which point both upserts silently degrade to inserts.
dup_plan as (
  select 'P0  duplicate plan for student+date' as check, count(*)::bigint as fails
  from (select student_id, routine_date from daily_routines group by 1,2 having count(*) > 1) x
),

-- ── 2. PLAN IDENTITY ──────────────────────────────────────────────────────
-- A task id must identify exactly one piece of planning state within its day,
-- because completions are keyed on it.
dup_task_id as (
  select 'P0  duplicate task id inside one plan', count(*)::bigint
  from (
    select dr.id from daily_routines dr,
      lateral (select tk->>'id' tid from jsonb_array_elements(dr.tasks) tk) t
    group by dr.id having count(*) <> count(distinct t.tid)
  ) y
),
task_no_id as (
  select 'P0  task with no id', count(*)::bigint
  from daily_routines dr, jsonb_array_elements(dr.tasks) tk where tk->>'id' is null
),

-- ── 3. UNEXPLAINED REPETITION ─────────────────────────────────────────────
-- The same topic twice in one day is the student doing the same work twice and
-- believing it was prescribed. Found once in production (12 Aug).
dup_topic as (
  select 'P0  same topic scheduled twice in one day', count(*)::bigint
  from (
    select dr.id from daily_routines dr,
      lateral (select (tk->>'section')||'|'||coalesce(tk->>'topic','') st
               from jsonb_array_elements(dr.tasks) tk where tk->>'topic' is not null) t
    group by dr.id having count(*) <> count(distinct t.st)
  ) z
),

-- ── 4. OWNERSHIP + ORPHANS ────────────────────────────────────────────────
orphan_plan as (
  select 'P0  plan with no student', count(*)::bigint from daily_routines dr
  where not exists (select 1 from profiles p where p.id = dr.student_id)
),
orphan_completion as (
  select 'P0  completion with no plan for that date', count(*)::bigint
  from routine_task_completions c
  where not exists (select 1 from daily_routines dr
                    where dr.student_id = c.student_id and dr.routine_date = c.routine_date)
),
-- A tick pointing at a task that is no longer in the plan: the student
-- completed work the plan no longer admits to having asked for. This is what a
-- regeneration over ticked work leaves behind.
stale_completion as (
  select 'P0  completion pointing at a task not in that plan', count(*)::bigint
  from routine_task_completions c
  join daily_routines dr on dr.student_id = c.student_id and dr.routine_date = c.routine_date
  where not exists (select 1 from jsonb_array_elements(dr.tasks) tk where tk->>'id' = c.task_id)
),

-- ── 5. DATE INTEGRITY ─────────────────────────────────────────────────────
-- A plan dated ahead of the student's own study day would be served as "today"
-- by any reader that trusts the latest row. +1 tolerated: the study day rolls
-- at 03:00 IST, so a legitimately-generated tomorrow can exist briefly.
future_plan as (
  select 'P0  plan dated in the future', count(*)::bigint
  from daily_routines where routine_date > (now() at time zone 'Asia/Kolkata')::date + 1
),

-- ── 6. CAPACITY / STUDENT-HOURS MISMATCH ──────────────────────────────────
-- The plan must be as long as the hours it claims it was built for.
-- Coaching days are exempt BY DESIGN: an uploaded timetable sets the day's
-- length, and padding it to the profile's hours is the duplication bug that
-- lib/timetable-day exists to prevent.
hours_mismatch as (
  select 'P1  workload disagrees with the hours it was built for', count(*)::bigint
  from daily_routines dr
  join profiles p on p.id = dr.student_id
  where dr.generated_hours is not null
    and coalesce(p.plan_source,'careerrai') <> 'coaching'
    and abs(dr.est_minutes - dr.generated_hours * 60) > 15
),
-- The row's own arithmetic must close.
sum_mismatch as (
  select 'P1  est_minutes <> sum of its own tasks', count(*)::bigint
  from (
    select dr.id from daily_routines dr, jsonb_array_elements(dr.tasks) tk
    group by dr.id, dr.est_minutes
    having abs(sum((tk->>'estMinutes')::numeric) - dr.est_minutes) > 1
  ) m
),
-- A single block over the documented cap. Coaching days exempt: the sheet's
-- own minutes are authoritative even when a class runs three hours.
over_cap as (
  select 'P1  single task over the 120-minute cap', count(*)::bigint
  from daily_routines dr
  join profiles p on p.id = dr.student_id, jsonb_array_elements(dr.tasks) tk
  where (tk->>'estMinutes')::numeric > 120
    and coalesce(p.plan_source,'careerrai') <> 'coaching'
),

-- ── 7. SHAPE ──────────────────────────────────────────────────────────────
empty_plan as (
  select 'P1  plan with no tasks', count(*)::bigint
  from daily_routines where jsonb_typeof(tasks) <> 'array' or jsonb_array_length(tasks) = 0
),
zero_minute_task as (
  select 'P1  task with no time on it', count(*)::bigint
  from daily_routines dr, jsonb_array_elements(dr.tasks) tk
  where coalesce((tk->>'estMinutes')::numeric, 0) <= 0
),

-- ── 8. COACHING INTEGRATION ───────────────────────────────────────────────
-- A confirmed timetable that covers a date must OWN that date. Any task on a
-- covered day whose topic the sheet did not name is the coverage matrix still
-- writing into a day it no longer governs.
coaching_contamination as (
  select 'P0  coaching day contains a topic the sheet never assigned', count(*)::bigint
  from (
    select dr.student_id, dr.routine_date, tk->>'topic' as topic
    from daily_routines dr
    join profiles p on p.id = dr.student_id
    join student_timetables t on t.student_id = dr.student_id,
    jsonb_array_elements(dr.tasks) tk
    where p.plan_source = 'coaching'
      and t.confirmed_at is not null
      and tk->>'topic' is not null
      and dr.routine_date >= t.confirmed_at::date
      -- only days the sheet actually speaks for
      and exists (select 1 from jsonb_array_elements(t.blocks) b
                  where (b->>'date')::date = dr.routine_date and b->>'topic' is not null)
      and not exists (select 1 from jsonb_array_elements(t.blocks) b
                      where (b->>'date')::date = dr.routine_date and b->>'topic' = tk->>'topic')
  ) c
),

-- ── 9. CONTENT vs STATE ───────────────────────────────────────────────────
-- "Learn X" for a topic the student has already finished. The task's verb is
-- derived from coverage status, so a mismatch means the plan was built from a
-- stale read of that student's state.
finished_but_learning as (
  select 'P1  first-contact task for an already-finished topic', count(*)::bigint
  from daily_routines dr
  join topic_coverage tc
    on tc.student_id = dr.student_id
   and tc.topic = (select tk->>'topic' from jsonb_array_elements(dr.tasks) tk
                   where tk->>'topic' is not null limit 1),
  lateral (select tk->>'topic' t, tk->>'target' g from jsonb_array_elements(dr.tasks) tk) x
  where dr.routine_date >= (now() at time zone 'Asia/Kolkata')::date - 7
    and x.t = tc.topic and tc.status = 'exam_ready' and x.g ilike 'Learn %'
)

select * from dup_plan
union all select * from dup_task_id
union all select * from task_no_id
union all select * from dup_topic
union all select * from orphan_plan
union all select * from orphan_completion
union all select * from stale_completion
union all select * from future_plan
union all select * from coaching_contamination
union all select * from hours_mismatch
union all select * from sum_mismatch
union all select * from over_cap
union all select * from empty_plan
union all select * from zero_minute_task
union all select * from finished_but_learning
order by check;
