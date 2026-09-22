# The activation cliff — 22 September 2026

A diagnosis of why students arrive, complete setup, reach the core screen, and
never log a study day. Read-only analysis against production
(`pobhpszlsozeonejtzqy`). Nothing was built or changed to produce it.

**This replaces the "449 students didn't develop intent" framing**, which was
directionally right and mechanically wrong.

---

## The funnel, as production reports it

```
1,209 registered        real students (excludes test/demo)
  635 opened the app    in the last 30 days
  198 logged a day      in the last 30 days
    6 have ever paid
```

The gap that matters is **437 students who opened the app in 30 days and
logged nothing**. That number was previously stated as 449; 437 is the figure
after excluding non-real accounts and null user ids.

---

## What is ESTABLISHED (measured, not interpreted)

### 1. It is activation, not retention

| | students |
|---|---|
| Opened 30d, no log 30d | 437 |
| — of which **never logged a day, EVER** | **412** |
| — logged before, lapsed | 25 |

Almost nobody is falling out of a habit. They never started one.

### 2. It is day one, not a slow fade

Of the 412 who never logged:

| visit pattern | students | completed onboarding |
|---|---|---|
| **One day only** | **266 (65%)** | 251 (94%) |
| 2–3 days | 129 (31%) | 120 (93%) |
| 4–7 days | 14 (3%) | 14 (100%) |
| 8+ days | **3** | 3 (100%) |

The "repeatedly present but never acting" population — the intuitive
hypothesis — **is 17 students.** The real cohort is 266 who came once, opened
the app 2.7 times in a single sitting, and never returned.

### 3. They reached the right screen

Of those 266, the last screen before disappearing:

| screen | students |
|---|---|
| **`/student/tracker`** | **159 (60%)** |
| `/student/buddy` | 18 |
| `/start` | 16 |
| `/welcome` | 11 |
| everything else | ≤10 each |

`/student/tracker` is the screen whose purpose is logging a study day.

### 4. They stayed on it

Of those 159, time on the tracker before leaving for good:

| dwell | students | avg scroll |
|---|---|---|
| under 3s — bounced | 22 (14%) | 18% |
| 3–15s — glanced | 42 (26%) | 47% |
| 15–60s — read it | 36 (23%) | 42% |
| **over 60s — sat with it** | **59 (37%)** | 46% |

The 59 averaged **7.6 minutes**. 60% of the 159 stayed 15 seconds or longer.

### 5. Setup state does not distinguish them

| cohort | n | has `student_dna` |
|---|---|---|
| the 266 who left on day one | 266 | **266** |
| active loggers (control) | 202 | 200 |

They were not blocked by incomplete setup. They held the same prerequisites as
the students who do log.

---

## What is INFERRED, and must not be promoted to fact

> **"Intent is not missing."**

This is a *reading* of the dwell evidence, not a measurement. Seven and a half
minutes on a study tracker is consistent with intent — and also with
confusion, with waiting for something to load, or with a phone left unlocked
on a table.

**What the database actually establishes is narrower and still strong:**

> Presence and sustained attention exist on the core screen without the
> logging action occurring.

---

## What is NOT KNOWN

**Why.** The database shows presence, duration, scroll and the absence of the
action. It cannot show whether the control was unfindable, the form too heavy,
the ask unclear, or whether something failed silently.

**The next question is now narrow enough to earn qualitative evidence:**

> What prevents a student sitting on `/student/tracker` for several minutes
> from completing their first study log?

---

## How to answer it — no build

1. **Reproduce the first-time experience** on a genuinely fresh account with
   no logged days, and see what those 59 saw.
2. **Interview ~5 students** from the high-dwell, never-logged cohort. They
   are identifiable from the query below.

The interviews are the higher-value evidence. The database has gone as far as
it can: it has localised the failure but cannot explain the mechanism.

**Do not change the product first.** A narrow hypothesis is exactly what earns
qualitative evidence rather than a guess.

---

## Reproducibility

Data completeness verified: `app_open` and `screen_exit` both survive to
23 Aug 2026, so the 30-day window is complete and **not** truncated by the
telemetry retention sweep.

The cohort, for the interview list:

```sql
with real as (
  select id from profiles
  where role='student' and is_test_account is not true and is_demo is not true),
one_day as (
  select o.user_id from (
    select user_id, count(distinct (created_at at time zone 'Asia/Kolkata')::date) days
    from student_events
    where event='app_open' and created_at > now()-interval '30 days' and user_id is not null
    group by 1) o
  join real r on r.id = o.user_id
  where o.days = 1
    and o.user_id not in (select distinct student_id from daily_reports)),
last_exit as (
  select e.user_id, e.props,
         row_number() over (partition by e.user_id order by e.created_at desc) rn
  from student_events e join one_day n on n.user_id = e.user_id
  where e.event='screen_exit' and e.created_at > now()-interval '30 days')
select p.full_name, p.phone, round((l.props->>'dwell_ms')::numeric/1000) seconds_on_tracker
from last_exit l join profiles p on p.id = l.user_id
where l.rn = 1
  and l.props->>'screen' = '/student/tracker'
  and (l.props->>'dwell_ms')::numeric > 60000
order by seconds_on_tracker desc;
```
