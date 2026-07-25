-- ── One place to ask "what did students do?" ────────────────────────────────
--
-- Behavioural events live in four tables, each from a different era:
-- student_events (canonical, 10 writers), analytics_events (pre-tracker
-- legacy, 6 writers), funnel_events (pre-auth /start funnel), and
-- routine_engagement_events (one tracker instrument). Every analytics
-- question — including the day-slot research the Home rotation was built on —
-- had to remember to union all four by hand, and a query that forgot one
-- silently under-counted while looking complete.
--
-- This view is the SSOT for READS. Writers stay where they are for now
-- (converging them is a separate, per-deploy migration); what must never
-- happen again is a dashboard undercounting because its author didn't know
-- table #4 existed. perf_events (web vitals) and expedify_events (external
-- CRM sync) are deliberately excluded — different bounded contexts, not
-- student behaviour.

create or replace view public.v_student_activity
with (security_invoker = true) as
select
  'student_events'::text            as source,
  se.user_id                        as student_id,
  se.anon_id,
  se.event,
  se.props,
  se.path,
  se.created_at
from public.student_events se
union all
select
  'analytics_events',
  ae.student_id,
  null,
  ae.event_type,
  ae.metadata,
  null,
  ae.created_at
from public.analytics_events ae
union all
select
  'funnel_events',
  null,
  fe.anon_id,
  fe.step,
  null,
  null,
  fe.created_at
from public.funnel_events fe
union all
select
  'routine_engagement_events',
  re.student_id,
  null,
  re.event,
  jsonb_strip_nulls(jsonb_build_object(
    'seconds_to_start', re.seconds_to_start,
    'seconds_since_started', re.seconds_since_started
  )),
  null,
  re.created_at
from public.routine_engagement_events re;
