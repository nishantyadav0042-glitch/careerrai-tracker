# Retention baseline — frozen 26 Aug 2026, pre-deploy

**Why this file exists.** The retention build (sample insight, one-pitch rule,
Log Breakers) is code-complete and forensically audited, but NOT deployed.
"Did it work?" can only ever be answered against the numbers from BEFORE it
went live — so those numbers are frozen here, measured once, with their exact
definitions, the night before the deploy train. If this file's figures are
recomputed later and differ, the recomputation is wrong: post-deploy students
will be in the data by then. That is the point.

Measured on production (`pobhpszlsozeonejtzqy`) on 26 Aug 2026, real students
only (`role='student'`, not demo, not test account). One student's dates are
distinct `daily_reports.report_date` values.

## The frozen numbers

| Metric | Definition | Value |
|---|---|---:|
| Students | eligible base | **865** |
| First-log conversion | ever logged at least one day | **208 (24.0%)** |
| Logged exactly once | log_days = 1 | **142** |
| Any return | log_days ≥ 2, ever | **66 (31.7% of loggers)** |
| **Day-2 return** | logged again ≤ 1 day after first log | **45 (21.6%)** |
| Day-7 return | logged again ≤ 7 days after first log | **62 (29.8%)** |
| Day-14 return | logged again ≤ 14 days after first log | **64 (30.8%)** |

Note on drift from earlier session figures (871/212/70): those were measured a
day earlier with `is_test_account` unfiltered in one query; this table is the
canonical, consistently-filtered baseline. Freeze THESE.

## The success criteria (founder, 26 Aug)

The build is judged a success only when, for cohorts who signed up AFTER the
deploy:

1. **Day-2 return rate** rises measurably above **21.6%**, and then
2. **Day-7 return** rises above **29.8%**.

Feature completion is not success. Students coming back is success.

## How to measure the post-deploy cohort

Same query, restricted to students created after the deploy timestamp, and
only counting students old enough to have reached the checkpoint (a student
who joined yesterday is not a Day-7 failure):

```sql
with s as (
  select p.id, (p.created_at at time zone 'Asia/Kolkata')::date as joined
    from public.profiles p
   where p.role='student' and coalesce(p.is_demo,false)=false
     and coalesce(p.is_test_account,false)=false
     and p.created_at >= '<DEPLOY TIMESTAMP UTC>'
), logs as (
  select r.student_id, array_agg(distinct r.report_date order by r.report_date) as days
    from public.daily_reports r join s on s.id=r.student_id group by r.student_id
), m as (
  select l.student_id, days[1] as first_log,
         exists (select 1 from unnest(days) d where d > days[1] and d <= days[1] + 1) as day2,
         exists (select 1 from unnest(days) d where d > days[1] and d <= days[1] + 7) as day7
    from logs l
)
select count(*) as first_loggers,
       count(*) filter (where day2) as day2,
       round(100.0*count(*) filter (where day2)
             / nullif(count(*) filter (where first_log <= ((now() at time zone 'Asia/Kolkata')::date - 2)),0),1) as pct_day2_eligible,
       round(100.0*count(*) filter (where day7)
             / nullif(count(*) filter (where first_log <= ((now() at time zone 'Asia/Kolkata')::date - 8)),0),1) as pct_day7_eligible
  from m;
```

Also worth watching, same period: `sample_insight_shown` (new event) against
first real logs, and `log_tour_done` skip-rate against its frozen 79%.

## Scope freeze

The retention + buddy-pitch build is FROZEN as of `fc40ebf`. No further
coding, refactors or audits on this scope. The only next steps are:
deploy (with migrations `20260826h` + `20260826i`) → production smoke →
this measurement.
