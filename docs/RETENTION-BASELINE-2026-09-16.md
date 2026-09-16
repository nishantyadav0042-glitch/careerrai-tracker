# Retention baseline — frozen 16 Sep 2026

The state of the product **before** confirm-or-correct logging and plan
healing. Frozen on founder instruction: *"Before changing the logging
experience, record the current baseline… otherwise, three weeks later you'll
have no idea what caused the movement."*

The machine-readable copy is `src/lib/retention-baseline.ts`, which also holds
the decision rule. This page holds the queries, so any number here can be
re-derived rather than believed.

**Every figure is computed from `daily_reports`, never from the `daily_log`
event.** That event undercounted real logs by 80–88% until 15 Sep (Incident
#95), so every retention number quoted before today — including the ~29.4%
Day-2 figure in circulation — sat on a wrong denominator. Measured from the
table, Day-2 is **26.8%**.

Staff, demo and test accounts are excluded throughout.

---

## Return behaviour

Cohort: students whose first log is at least 7 days old, so every one of them
has had a complete 7-day window. **n = 302.**

| Metric | Value | Definition |
|---|---|---|
| Day-2 return | **26.8%** | Logged again on the calendar day after their first log |
| **Second log within 7 days** | **36.1%** | **THE PRIMARY METRIC.** Any second log within 7 days of the first |
| One-and-done | **57.6%** (174) | Entire history is exactly one log |
| Repeat log within 7 days | **59.2%** | Of *every* log by any student, the share followed by another within 7 days (n = 561 logs, 242 students, window 8–37 days ago) |

The gap between 36.1% and 59.2% is the whole first-week problem: a student who
has already returned once repeats readily; a student who has logged once
mostly never comes back.

## Volume — what the change can actually be measured on

| Metric | Value |
|---|---|
| New first-loggers, last 7 days | 27 (**3.9/day**) |
| New first-loggers, last 14 / 30 days | 75 / 212 |
| Logs, last 7 days | 159 |
| **Distinct students logging, last 7 days** | **68** |

## The plan, against what students actually do

Last 30 days, **1,713 generated routines across 798 students.**

| Metric | Value |
|---|---|
| Tasks planned per routine | 4.36 |
| Tasks completed per routine | **0.44** |
| Task completion | **10.0%** |
| Routines where nothing at all was ticked | **83.7%** (1,433 of 1,713) |
| Routines fully completed | 3.4% (59) |
| Planned minutes — median / p90 / max | **300 / 600 / 960** |
| Mean generated hours | 5.47 |
| **Median study actually reported** | **0.6 h — 36 minutes** |
| Routines carrying any calibration | **0.8%** (14 of 1,713) |

**We plan a median of five hours a day. Students do a median of thirty-six
minutes. That is 8.3×**, it regenerates at full size every morning regardless
of what happened yesterday, and 84% of routines never receive a single tick.
The calibration mechanism already exists in `daily_routines.calibration` and is
used on 0.8% of routines.

---

## Reproducing these numbers

Base CTE used by the return queries:

```sql
with real as (
  select d.student_id, d.report_date from daily_reports d
  join profiles p on p.id = d.student_id
  where p.role = 'student'
    and coalesce(p.is_demo, false) = false
    and coalesce(p.is_test_account, false) = false
)
```

**Return rates** — `firsts` is `min(report_date)` per student; the cohort is
`first_log <= current_date - 7`; `day2` is a log at `first_log + 1`; `w1` is any
log in `(first_log, first_log + 7]`.

**Repeat rate** — for every log with `report_date between current_date - 37 and
current_date - 8`, whether another log exists in `(report_date, report_date + 7]`.

**Plan figures** — `daily_routines` joined to a per-day count from
`routine_task_completions` on `(student_id, routine_date)`, restricted to
`routine_date between current_date - 30 and current_date - 1` and
`jsonb_typeof(tasks) = 'array'`.

**Units, and the trap in them.** `daily_routines.est_minutes` is minutes.
`daily_reports.study_duration` is **hours** — `/admin/leads/[id]` renders it as
`Logged {x}h study`. Reading it as minutes turns 36 minutes a day into 36 hours
and inverts the entire finding. That misreading is exactly what Incident #95
cost us, and `retention-baseline.test.ts` now pins both units.

---

## What happens next is already decided

The decision rule lives in `src/lib/retention-baseline.ts` and was written
before any post-change number exists, so that "retention didn't move, let's add
another feature" is not available as a response.

It is read against **repeat log within 7 days**, not against the primary
metric. At 3.9 new first-loggers a day, detecting even a 14-point lift on
`second_log_within_7d` needs roughly 195 students — about 50 days — and a
realistic 8-point lift needs over 600 and cannot be read this year. The repeat
metric covers 68 students a week and the same underlying behaviour: another
useful preparation event. `second_log_within_7d` remains the stated goal and is
reported beside it; it is simply not the gate.

| Signal | Reading | Then |
|---|---|---|
| **Strong** | Repeat logging up ≥ 8 points, and returning logs carry real preparation | The loop works — deepen adaptation, then add timetable context |
| **Weak** | They return, but the logs are empty | An opening problem, not a retention breakthrough. Build no more surface area |
| **None** | Movement under 3 points either way | Stop assuming logging and adaptation are the answer. The interviews decide |
| **Negative** | Repeat logging falls, or students say the changes are wrong | Roll back healing, keep the input, fix the engine |

---

## Addendum, same night — two findings that changed the build

### 1. The five-hour plan is the student's own number

Across the **804 students who have ever been given a routine**: median claimed
**5h/day**, p90 **8h**, max **16h**. **413 of them carry
`study_hours_source = 'student'`** — they personally confirmed it. Median study
actually reported by an active student: **0.6h**.

The plan is not over-reaching. It is faithfully building the day the student
asked for, and then never mentioning the gap again.

This matters because `daily-hours.ts` carries a standing founder decision
(6 Aug): the hours belong to the student and *"nothing in this codebase may
derive, cap, trim, round toward behaviour, or otherwise 'improve' it… The date
gives. The hours don't."* Secretly right-sizing the plan would have violated
it — and would have been the wrong fix anyway, since fifteen hours from a
sincere student is a real answer.

So the product now **shows the student their own two numbers and lets them
move one**. `setDailyHours` remains the only writer. `capBudget()` still has no
caller, pinned by test.

**A capacity model already existed** (`capacity-engine.ts`, tested) and its own
comment recorded that nothing consumed it. The 8.3× mismatch was never a
missing model — it was an unwired one, plus a number nobody was ever shown
again.

### 2. Missed work does not accumulate — VERIFIED

The feared failure mode (*miss Monday → Tuesday holds Monday + Tuesday →
backlog → abandonment*) **does not exist in this engine.** Each day is
regenerated from the student's hours and the topic selector's coverage state;
uncovered topics are re-offered at the same daily size, which is already
"rescheduled, not accumulated".

Measured within-student over 60 days, 506 students, 1,347 routines:

| | |
|---|---|
| Plan size after 0 untouched days | 378 min · 4.43 tasks |
| After 1–3 untouched days | 346 min |
| After 5+ untouched days | 417 min · 4.97 tasks |
| **Mean size against the student's own claim** | **−19.9 min** |

Five missed days would add roughly 22 tasks if work stacked. Tasks move 4.43 →
4.97, and plans run on average twenty minutes *under* what the student asked
for — a backlog would exceed the claim by definition. The 10% drift is
consistent with phase progression and with higher-claiming students missing
more days, not with accumulation.

**Consequence: priority-based plan healing was not built.** It would be surface
area against a problem the data says we do not have. The real defect in the
same area is that the plan regenerates at *full* size regardless of what
happened — which is what the right-size card addresses, through the student.
