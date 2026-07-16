-- Real social proof, computed live from the DB — never hardcoded, never
-- fabricated. One round-trip returns the counts we surface across the app so
-- every number a student sees is literally true.
create or replace function public.social_proof()
returns table(started_total int, mapped_total int, planned_week int, logged_week int)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select id from profiles
    where role = 'student'
      and coalesce(is_test_account, false) = false
      and coalesce(is_demo, false) = false
  )
  select
    (select count(*) from s)::int,
    (select count(distinct student_id) from topic_coverage where student_id in (select id from s))::int,
    (select count(distinct student_id) from daily_routines
       where student_id in (select id from s)
         and routine_date >= (now() at time zone 'Asia/Kolkata')::date - 7)::int,
    (select count(distinct student_id) from daily_reports
       where student_id in (select id from s)
         and report_date >= (now() at time zone 'Asia/Kolkata')::date - 7)::int;
$$;

revoke all on function public.social_proof() from public, anon;
grant execute on function public.social_proof() to service_role, authenticated;
