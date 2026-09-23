-- ── DAY-1 → DAY-2 BRIDGE: the bootstrap report (read-only) ─────────────────
--
-- Day-1 → Day-2 mission, 22 Sep 2026. The classification rules are the ones
-- in src/lib/os/day-bridge.ts (stateLeftBehind / classifyReturn); this SQL
-- exists so the FIRST report could be produced from production before any
-- TypeScript reader existed. When a reader is written, it must call the
-- TypeScript, and this file becomes a cross-check, not a second authority.
--
-- Population: real students (no demo, no @careerrai.in, no "Razorpay Review")
-- with at least one real study day (daily_reports.study_duration > 0).
-- Day-1 = the first real study date (IST). "Return" = the first student_events
-- row on a LATER IST day within 7 days. Day-2 = that return day.
--
-- Every column is a reading of rows. Nothing here is intent, and nothing here
-- is causal.

with contaminants as (
  select id from profiles
  where coalesce(is_demo,false) or email ilike '%careerrai.in' or full_name ilike 'razorpay%'
),
rs as (
  select d.student_id,
         min(d.report_date::date) day1,
         count(distinct d.report_date::date) study_days
  from daily_reports d
  join profiles p on p.id = d.student_id and p.role = 'student'
  where d.study_duration > 0 and d.student_id not in (select id from contaminants)
  group by 1
),
base as (
  select student_id, day1, study_days, (study_days >= 2) is_r from rs
),
-- Day-1 state
plan1 as (
  select b.student_id, r.tasks, r.version
  from base b join daily_routines r on r.student_id = b.student_id and r.routine_date = b.day1
),
plan1_topics as (
  select p.student_id, t->>'id' task_id, t->>'topic' topic, ord
  from plan1 p, jsonb_array_elements(p.tasks) with ordinality as x(t, ord)
),
ticks1 as (
  select b.student_id, c.task_id, c.completed_at, c.confidence
  from base b join routine_task_completions c on c.student_id = b.student_id and c.routine_date = b.day1
),
day1 as (
  select b.student_id, b.day1, b.is_r,
    (select count(*) from plan1_topics t where t.student_id = b.student_id) planned,
    (select count(*) from ticks1 t where t.student_id = b.student_id) done,
    (select count(*) from ticks1 t where t.student_id = b.student_id and t.confidence = 'blue') half,
    exists (select 1 from plan1 p where p.student_id = b.student_id) has_plan,
    (select array_agg(distinct t.topic) from plan1_topics t where t.student_id = b.student_id
       and t.topic is not null
       and not exists (select 1 from ticks1 k where k.student_id = t.student_id and k.task_id = t.task_id and coalesce(k.confidence,'') <> 'blue')) unfinished_topics,
    (select array_agg(distinct t.topic) from plan1_topics t where t.student_id = b.student_id and t.topic is not null) planned_topics,
    exists (select 1 from student_events e where e.user_id = b.student_id and e.event = 'resource_opened'
            and (e.created_at at time zone 'Asia/Kolkata')::date = b.day1) resource_opened,
    exists (select 1 from student_events e where e.user_id = b.student_id and e.event = 'daily_log'
            and coalesce(e.props->>'surface','log_sheet') = 'log_sheet'
            and (e.created_at at time zone 'Asia/Kolkata')::date = b.day1) sheet_logged,
    (select coalesce(d.study_duration_source,'(null)') from daily_reports d where d.student_id = b.student_id and d.report_date::date = b.day1 and d.study_duration > 0 limit 1) closed_source,
    (select max(e.created_at) from student_events e where e.user_id = b.student_id and e.event = 'screen_exit'
       and e.props->>'reason' = 'hidden' and (e.created_at at time zone 'Asia/Kolkata')::date = b.day1) last_hidden_at,
    (select max(e.created_at) from student_events e where e.user_id = b.student_id
       and (e.created_at at time zone 'Asia/Kolkata')::date = b.day1) last_event_at,
    exists (select 1 from student_events e where e.user_id = b.student_id
            and (e.created_at at time zone 'Asia/Kolkata')::date = b.day1
            and (e.event = 'log_error' or (e.event = 'completion_write' and coalesce(e.props->>'status','200') <> '200'))) error_day1
  from base b
),
-- The return
ret as (
  select d.student_id,
    (select min(e.created_at) from student_events e where e.user_id = d.student_id
       and (e.created_at at time zone 'Asia/Kolkata')::date > d.day1
       and (e.created_at at time zone 'Asia/Kolkata')::date <= d.day1 + 7) first_at
  from day1 d
),
ret2 as (
  select r.student_id, r.first_at, (r.first_at at time zone 'Asia/Kolkata')::date day2,
    (select e.event from student_events e where e.user_id = r.student_id and e.created_at = r.first_at order by e.id limit 1) first_kind,
    (select e.display_mode from student_events e where e.user_id = r.student_id and e.created_at = r.first_at order by e.id limit 1) first_mode,
    exists (select 1 from notifications n where n.user_id = r.student_id and n.app_opened_at is not null
            and n.app_opened_at between r.first_at - interval '60 seconds' and r.first_at + interval '60 seconds') via_notification
  from ret r where r.first_at is not null
),
plan2_topics as (
  select r.student_id, t->>'id' task_id, t->>'topic' topic
  from ret2 r join daily_routines dr on dr.student_id = r.student_id and dr.routine_date = r.day2,
       jsonb_array_elements(dr.tasks) as t
),
first_tick2 as (
  select distinct on (c.student_id) c.student_id, c.task_id, c.completed_at, p.topic
  from ret2 r join routine_task_completions c on c.student_id = r.student_id and c.routine_date = r.day2
  left join plan2_topics p on p.student_id = c.student_id and p.task_id = c.task_id
  order by c.student_id, c.completed_at
),
day2 as (
  select r.*,
    f.topic first_tick_topic, f.completed_at first_tick_at,
    exists (select 1 from student_events e where e.user_id = r.student_id and e.event = 'daily_log'
            and coalesce(e.props->>'surface','log_sheet') = 'log_sheet'
            and (e.created_at at time zone 'Asia/Kolkata')::date = r.day2) sheet_logged2,
    exists (select 1 from student_events e where e.user_id = r.student_id
            and (e.created_at at time zone 'Asia/Kolkata')::date = r.day2
            and e.path in ('/student/tracker','/student/plan','/student/plan/topics','/student/blueprint')) study_surface2,
    exists (select 1 from daily_reports d where d.student_id = r.student_id and d.report_date::date = r.day2 and d.study_duration > 0) studied2,
    exists (select 1 from daily_routines dr where dr.student_id = r.student_id and dr.routine_date = r.day2) plan2_exists,
    exists (select 1 from student_events e where e.user_id = r.student_id
            and (e.created_at at time zone 'Asia/Kolkata')::date = r.day2
            and (e.event = 'log_error' or (e.event = 'completion_write' and coalesce(e.props->>'status','200') <> '200'))) error_day2
  from ret2 r left join first_tick2 f on f.student_id = r.student_id
),
joined as (
  select d1.*, d2.first_at, d2.day2, d2.first_kind, d2.first_mode, d2.via_notification,
    d2.first_tick_topic, d2.sheet_logged2, d2.study_surface2, d2.studied2, d2.plan2_exists, d2.error_day2,
    (d2.day2 = d1.day1 + 1) next_day,
    -- offered a resume: day-2's plan carries a day-1 unfinished topic
    exists (select 1 from plan2_topics p where p.student_id = d1.student_id and p.topic = any(d1.unfinished_topics)) resume_offered,
    case
      when d2.student_id is null then 'G_abandoned'
      when d2.first_tick_topic is not null and d2.first_tick_topic = any(coalesce(d1.unfinished_topics, array[]::text[])) then 'A_resumed_unfinished'
      when d2.first_tick_topic is not null and d2.first_tick_topic = any(coalesce(d1.planned_topics, array[]::text[])) then 'B_continued_plan'
      when exists (select 1 from routine_task_completions c where c.student_id = d1.student_id and c.routine_date = d2.day2) then 'C_started_new_task'
      when d2.sheet_logged2 then 'E_log_only'
      when d2.study_surface2 then 'D_browsed_no_action'
      else 'F_other_surface'
    end kind,
    extract(epoch from (d2.first_at - coalesce(d1.last_hidden_at, d1.last_event_at)))/3600.0 hours_to_reentry
  from day1 d1 left join day2 d2 on d2.student_id = d1.student_id
)
select
  case when is_r then 'R' else 'O' end cohort,
  count(*) n,
  -- 1-3: what they were left with
  count(*) filter (where has_plan) had_plan,
  round(avg(planned) filter (where has_plan),1) avg_planned,
  round(avg(done) filter (where has_plan),1) avg_done,
  count(*) filter (where has_plan and planned > done) left_unfinished,
  count(*) filter (where done = 0) no_tick_day1,
  count(*) filter (where resource_opened) resource_day1,
  count(*) filter (where closed_source = 'credited') closed_by_tick,
  count(*) filter (where sheet_logged) sheet_day1,
  count(*) filter (where last_hidden_at is not null) has_hidden_end,
  count(*) filter (where error_day1) error_day1,
  -- 4, 6: how and when they came back
  count(*) filter (where first_at is not null) returned_7d,
  count(*) filter (where next_day) returned_next_day,
  round(percentile_cont(0.5) within group (order by hours_to_reentry) filter (where hours_to_reentry is not null and hours_to_reentry >= 0), 1) med_hours_to_reentry,
  count(*) filter (where via_notification) via_notification,
  count(*) filter (where first_mode in ('standalone','twa','ios_app')) return_installed_surface,
  -- 5, 7, 10: what they did first
  count(*) filter (where kind = 'A_resumed_unfinished') a_resumed,
  count(*) filter (where kind = 'B_continued_plan') b_continued,
  count(*) filter (where kind = 'C_started_new_task') c_new_task,
  count(*) filter (where kind = 'D_browsed_no_action') d_browsed,
  count(*) filter (where kind = 'E_log_only') e_log_only,
  count(*) filter (where kind = 'F_other_surface') f_other,
  count(*) filter (where kind = 'G_abandoned') g_abandoned,
  count(*) filter (where first_at is not null and resume_offered) resume_offered_on_return,
  count(*) filter (where first_at is not null and plan2_exists) plan_existed_on_return,
  -- 8, 9
  count(*) filter (where studied2) studied_on_return_day,
  count(*) filter (where error_day2) error_day2
from joined
group by 1 order by 1 desc;
