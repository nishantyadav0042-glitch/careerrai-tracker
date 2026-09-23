-- ── DAY-2 RETURN, FIRST 120 SECONDS (read-only, pre-registered 23 Sep 2026) ──
--
-- Protocol: docs/DAY2-OBSERVATION-PROTOCOL.md. Definitions are fixed here
-- BEFORE any post-deploy return was observed; do not edit them to fit data.
--
-- Unit: a study episode = (student, IST day D) with daily_reports.study_duration > 0,
-- D >= 2026-09-22, D < today (IST). Genuine students only.
-- Return: the first student_events row on an IST day in (D, D+7].
-- Cohorts (per episode):
--   A_repeat                       returned, and study recorded on the return day
--   B_returned_no_recorded_study   returned, no study RECORDED on the return day
--                                  (never "did not study": external study is unobserved)
--   C_gone                         no event in (D, D+7] and the window has closed
--   C_pending                      no event yet, window still open
--   B_pending_day_open             returned today; no verdict until the IST day ends
--
-- Entry fields (launch, session_new) exist only for returns after 2026-09-23
-- 02:42 UTC; earlier returns read 'pre-instr'. `tap` rows are swept after 14
-- days (telemetry-retention WRITE_ONLY_EVENTS), so first-action fields must be
-- read within two weeks of the return.
with c as (select id from profiles where coalesce(is_demo,false) or email ilike '%careerrai.in' or full_name ilike 'razorpay%'),
sd as (
  select d.student_id, d.report_date::date sday
  from daily_reports d join profiles p on p.id=d.student_id and p.role='student'
  where d.study_duration>0 and d.student_id not in (select id from c) group by 1,2),
t as (select (now() at time zone 'Asia/Kolkata')::date today),
ep as (select sd.student_id, sd.sday from sd, t where sd.sday >= date '2026-09-22' and sd.sday < t.today),
ev as (
  select e.id, e.user_id, e.created_at, e.event, e.props, e.display_mode, (e.created_at at time zone 'Asia/Kolkata')::date ist_day
  from student_events e where e.user_id in (select student_id from ep) and e.created_at >= timestamptz '2026-09-21 18:30:00+00'),
r as (
  select ep.*, (select min(ev.created_at) from ev where ev.user_id=ep.student_id and ev.ist_day > ep.sday and ev.ist_day <= ep.sday+7) first_at
  from ep),
r2 as (
  select r.*, (r.first_at at time zone 'Asia/Kolkata')::date rday,
    fr.event first_kind, fr.props->>'launch' launch, fr.props->>'session_new' session_new, fr.display_mode surface,
    ft.created_at first_tap_at, ft.props->>'el' first_tap_el,
    (select min(ev.created_at) from ev where ev.user_id=r.student_id and ev.event='tap' and ev.created_at>=r.first_at
       and ev.ist_day=(r.first_at at time zone 'Asia/Kolkata')::date
       and ((ev.props->>'el') ilike 'mark_progress%' or ev.props->>'el' in ('finished_it','got_halfway','half','done'))) first_task_at
  from r
  -- The entry row is the first app_open/app_resume within 5 s of the first
  -- event: overlays (push_ask_mounted, buddy_nudge_mounted) can log a few ms
  -- before app_open and carry no launch prop.
  left join lateral (select * from ev where ev.user_id=r.student_id and ev.event in ('app_open','app_resume')
                     and ev.created_at between r.first_at and r.first_at+interval '5 seconds'
                     order by ev.created_at, ev.id limit 1) fr on true
  left join lateral (select * from ev where ev.user_id=r.student_id and ev.event='tap' and ev.created_at>=r.first_at
                     and ev.ist_day=(r.first_at at time zone 'Asia/Kolkata')::date order by ev.created_at limit 1) ft on true),
w as (
  select r2.*,
    exists(select 1 from ev where ev.user_id=r2.student_id and ev.created_at between r2.first_at and r2.first_at+interval '120 seconds' and ev.event='completion_write' and coalesce(ev.props->>'status','200')='200') w_tick,
    exists(select 1 from ev where ev.user_id=r2.student_id and ev.created_at between r2.first_at and r2.first_at+interval '120 seconds' and ev.event='resource_opened') w_resource,
    exists(select 1 from ev where ev.user_id=r2.student_id and ev.created_at between r2.first_at and r2.first_at+interval '120 seconds' and ev.event in ('log_open','daily_log')) w_log,
    exists(select 1 from ev where ev.user_id=r2.student_id and ev.created_at between r2.first_at and r2.first_at+interval '120 seconds'
           and (ev.event='log_error' or (ev.event='completion_write' and coalesce(ev.props->>'status','200')<>'200'))) w_error,
    exists(select 1 from ev where ev.user_id=r2.student_id and ev.created_at between r2.first_at and r2.first_at+interval '120 seconds' and ev.event='screen_exit' and ev.props->>'reason'='hidden') w_exit,
    exists(select 1 from sd where sd.student_id=r2.student_id and sd.sday=r2.rday) studied_rday,
    exists(select 1 from sd where sd.student_id=r2.student_id and sd.sday>r2.rday and sd.sday<=r2.sday+7) studied_later
  from r2)
select w.sday::text d1, left(w.student_id::text,8) sid,
  case when first_at is null then (case when (select today from t) > sday+7 then 'C_gone' else 'C_pending' end)
       when studied_rday then 'A_repeat'
       when rday >= (select today from t) then 'B_pending_day_open'   -- return day not over yet
       else 'B_returned_no_recorded_study' end cohort,
  rday::text d2, first_kind, coalesce(launch,'pre-instr') launch, session_new, surface,
  round(extract(epoch from first_tap_at-first_at)) s_to_first_tap,
  case when first_tap_el is null then null
       when first_tap_el ilike 'mark_progress%' or first_tap_el in ('finished_it','got_halfway','half','done') then 'task'
       when first_tap_el ilike 'learn_it%' then 'resource'
       when first_tap_el ilike '%log%' then 'log'
       when first_tap_el ilike 'got_it%' or first_tap_el in ('later','not_now','skip_this') then 'dismiss_overlay'
       when first_tap_el ilike 'plan_row%' or first_tap_el ilike 'todays_study_plan%' or first_tap_el in ('whole_plan','my_cat_plan','topics_covered') then 'plan'
       when first_tap_el in ('reschedule','save') then 'reschedule'
       when first_tap_el in ('home','more','profile','my_buddy','daily_tips') or first_tap_el ilike 'back_to%' then 'navigation'
       else 'other' end first_action,
  round(extract(epoch from first_task_at-first_at)) s_to_first_task,
  w_tick, w_resource, w_log, w_error, w_exit, studied_later
from w order by d1, cohort, sid;
