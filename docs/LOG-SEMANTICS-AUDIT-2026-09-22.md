# READ-ONLY LOG SEMANTICS AUDIT

22 Sep 2026. No code changed, no migration run, no product change, no deploy.
Database access was `SELECT` only. One repository operation was performed:
`git fetch --unshallow`, because the session's clone was grafted at 20 Aug and
Part 2 is unanswerable without real history. It added history; it changed no
file and pushed nothing.

Evidence labels are used strictly: **ESTABLISHED** (read from source or
returned by a production query), **INFERRED** (a reading of established facts),
**NOT ESTABLISHED** (the evidence does not settle it).

---

## 1. Actual definition of a study log

**ESTABLISHED. The source of truth is the table `daily_reports`.**

Schema, `supabase/migrations/001_initial_schema.sql:23-45`:

| column | type | note |
|---|---|---|
| `student_id` | UUID → profiles | |
| `report_date` | DATE | the study day, **not** `created_at` |
| `study_duration` | NUMERIC(4,1) | hours; **0 is legal and common** |
| `topics_covered` | TEXT[] | |
| `mock_taken`, `day_outcome`, `plan_fit`, `blocker_reason`, `study_duration_source` | | added later (§2) |
| | | `UNIQUE (student_id, report_date)` — one row per student per study day |

**There are exactly two application write paths, and both go through one RPC.**
Verified by repo-wide sweep — no direct `.insert()` or `.upsert()` into
`daily_reports` exists anywhere in `src/`:

| # | writer | file:line | trigger |
|---|---|---|---|
| E1 | the log sheet | `src/app/api/logging/log-daily/route.ts:138` | student submits the log form |
| E2 | the plan card | `src/app/api/routine/complete-task/route.ts:241` (retry `:248`) | plan fully done, or Emergency-Mode minimum done, or client sends `closeDay: true` |

Both call `admin.rpc('upsert_log_and_streak', …)`. Frontend entry points:
`src/hooks/useLogging.ts:70-92` (E1) and
`src/components/DailyTracker/TodaysRoutineCard.tsx` (E2).

Ten other files touch `daily_reports`. **All ten are `SELECT` only** — checked
individually: the six cron jobs, `routine/today`, `mock-debrief`,
`request-refund`, `check-red-flags`. **No cron writes a log row.**

### The completion condition

- **E1**: any successful POST. Validation (`route.ts:60-78`) accepts
  `hours = 0` with **no sections** — an honest "I did not study today".
  `log_date` may be today or yesterday only (`:95-99`).
- **E2**: `route.ts:174` —
  `(fullyDone || emergencyMinimumDone || closeDay === true) && completions.length > 0 && !skipDayClose`.
  `planFullyDone` excludes half-ticks (founder ruling, 18 Aug, `:155-162`).

### A → G, as asked

| | action | writes `daily_reports`? | what it writes |
|---|---|---|---|
| A | opening the tracker | **No** | `daily_routines` row (plan), via `routine/today:263` |
| B | viewing a study plan | **No** | `screen_view` / `plan_snapshot_shown` events |
| C | starting / ticking a task | **No** | `routine_task_completions` row |
| D | ticking the *last* task (plan complete) | **YES** | full row via E2 |
| E | submitting the log sheet | **YES** | full row via E1 |
| F | the onboarding log tour | **No** — see §3 | `log_tour_done` event only |
| G | opening and abandoning the log | **No** | `log_open` → `log_dismissed` events |

### What does NOT count

**ESTABLISHED:** F never counts. C alone never counts — only the completing tick
does. G never counts.

### The trap in the other direction

**ESTABLISHED.** `src/lib/os/study-truth.ts:12-26` (written 16 Sep) states the
rule plainly: *"A LOG IS NOT A STUDY SESSION."* Production, all time:

- **1,041** `daily_reports` rows
- **492 (47%)** have `study_duration = 0` — the student recorded *not* studying

So "has a log row" and "studied" are different populations. The previous
analysis used the first and reported it as the second.

---

## 2. Logging system timeline

Every table's earliest row is **2026-07-12** (`daily_reports`,
`routine_task_completions`, `daily_routines`, and the earliest real
`profiles.created_at`). **ESTABLISHED: no student in production predates
12 July**, so any code shipped before that date applies uniformly to everyone.

| DATE | COMMIT | FILES | WHAT CHANGED | EFFECT ON HISTORICAL COHORTS |
|---|---|---|---|---|
| 2026-06-11 | `2eefe13d` | `api/logging/log-daily`, `hooks/useLogging` | E1 created | None — predates every student |
| 2026-06-14 | (migration `20260614`) | `upsert_log_and_streak` | the RPC created | None — predates every student |
| 2026-07-05 | `46300146` | `api/routine/complete-task` | Routine engine; E2 created | None — predates every student |
| 2026-07-15 | `49be4a85` | log sheet | Half / Fully-done per topic | half-state exists; hours still typed in 0–10 steps |
| 2026-07-25 | `25a82dd8` | `complete-task` | `closeDay` — the card's Done **is** the log's Done | **E2 widens**: finishing the plan now writes a log row |
| 2026-08-09 | `1bb4f564` | `study-credit.ts`, log sheet | hours **derived from coverage**, no longer asked | hours become fractional → triggers Incident #30 |
| 2026-08-09 | `ddf1fe1d` + migration `20260810` | RPC | **rest-day log option; streak counts logged days** | **a zero-hour "I didn't study" row becomes a first-class log** |
| **2026-08-09 → 2026-08-12** | — | — | **OUTAGE (Incident #30)** | **any log carrying fractional hours was rejected, HTTP 500** |
| 2026-08-12 17:38 UTC | `6bbd983b` | migration `20260812` | `p_study_duration` INTEGER → NUMERIC | outage ends |
| 2026-08-13 | `cdf112c9` | `screen-log-tour.tsx` | onboarding ends with a **practice** log | §3 — writes nothing |
| 2026-08-13 | `9c3476db` | plan card | "Logging is the plan card now — three states, one door" | E2 becomes the primary door |
| 2026-08-14 | (see `lib/study-day.ts:5-11`) | `study-day.ts` | **study-day rollover 03:00 IST → 05:30 IST** | logs between 03:00–05:30 IST are stamped on a different `report_date` before vs after |
| 2026-08-19 | `2bdfe70c`, `94fb398a` | migrations `20260818b`, `20260819j` | `study_duration_source` provenance added; RPC stops overwriting wellbeing | **435 of 1,041 rows have `study_duration_source = NULL`** — pre-provenance, meaning unknown |
| 2026-08-19 | `e8477914` | `completion-portion.ts` | a half-tick is PARTIAL, never complete | **E2 narrows**: all-half-ticks no longer closes the day |
| 2026-09-04 | `676a2315` | `first-verdict.ts` | first-session ask replaced with a read of onboarding | changes what a day-one student is asked to do |
| 2026-09-16 | `a6660a6b` | `os/study-truth.ts` | "count the student, not the record" | measurement correction, not behaviour |

**Two changes materially changed the meaning of a log row**, both on 9 Aug:
the rest-day option (a row can now mean "did not study") and coverage-derived
hours. **Two changed who produces one**: 25 Jul (`closeDay` widened E2) and
19 Aug (half-ticks narrowed it).

**NOT ESTABLISHED:** the exact start of the Incident #30 outage. It certainly
ended 12 Aug 17:38 UTC. The incident says *"every student who ever
half-completed a task hit this"*; half-completion shipped 15 Jul, but hours were
integer-typed until 9 Aug. 9 Aug is the **INFERRED** start; a 15 Jul start
cannot be ruled out from source alone.

---

## 3. Onboarding logging semantics

**ESTABLISHED, and guarded. The onboarding log tour writes nothing.**

`src/app/student/onboarding/screens/screen-log-tour.tsx` (added 13 Aug).
Searched the whole file: no `fetch`, no `supabase`, no `.from(`, no
`daily_reports`. Its only outbound calls are `track('sample_insight_shown')` and
`track('log_tour_done')` — rows in `student_events`, not `daily_reports`.
The source comment at `:167-169` says so in as many words: *"Measurement, not a
write: lets us cohort 'practised the log in onboarding' against first real
daily_report."*

Its data is hand-written sample data (`SAMPLE_DAILY`, `SAMPLE_WEEKLY`,
`:31-46`), explicitly *not* engine output.

`src/lib/log-tour.guard.test.ts` enforces it in CI:

- `:24` never references `/api/routine/complete-task`
- `:29-31` never contains `daily_reports`, never `createClient`, never `.from(`
- `:35` the screen must literally say "nothing is saved" to the student

The guard's own rationale (`:19-22`): *"A student who has studied nothing must
never start Day 0 with study data on record… one fabricated 'finished it' at
signup poisons the very first row of a student's history."*

Answering each question directly:

| question | answer |
|---|---|
| Same table as real logs? | **No.** `student_events`, not `daily_reports`. |
| Same activity type? | **No.** `log_tour_done`, not a report row. |
| Same `report_date`? | **N/A** — no report row exists. |
| Creates a completed study day? | **No.** |
| Merely onboarding telemetry? | **Yes.** Exactly that. |
| Affects "days studied"? | **No.** |
| Affects streaks? | **No** — `streak_data` moves only inside `upsert_log_and_streak`. |
| Affects activation metrics? | **No** — `first_log` reads `daily_reports` (§4). |
| Affects the dashboard / tracker? | **No.** |
| Can it become the student's "first log"? | **No.** |

**So hypothesis (2), (4-onboarding) and (6) in the brief are ruled out.** No
onboarding interaction has ever produced a `daily_reports` row.

---

## 4. First-log calculation

| QUERY / FUNCTION | TABLE | FILTERS | DATE FIELD | ACTIVITY TYPE | ONBOARDING INCLUDED | DUPES | SEMANTICS |
|---|---|---|---|---|---|---|---|
| `reachedStage(s,'first_log')` — `src/lib/os/activation-funnel.ts:72` | `daily_reports` | row exists | none | any | no (impossible) | n/a | **first database row** |
| `reachedStage(s,'first_tick')` — `:71` | `routine_task_completions` | row exists | none | any | no | n/a | touched the plan |
| `hasLoggedToday` — `src/hooks/useLogging.ts:59-66` | `daily_reports` | `report_date = getLogDateString()` | `report_date` | any | no | unique key | logged today |
| `loggedDays.size` — `api/cron/onboarding-morning/route.ts:101-104,120` | `daily_reports` | student's rows | `report_date` | any | no | `Set` of dates | **distinct logged days → `dayNumber`** |
| `StudyWeek.studied` — `src/lib/os/study-truth.ts` | `daily_reports` | **`study_duration > 0`** | `report_date` | studied only | no | distinct students | **students who studied** |
| `StudyWeek.logRows` — same | `daily_reports` | none | `report_date` | any | no | rows | "context only — never the headline" |
| streak | `streak_data` via RPC | — | `report_date` | any | no | — | consecutive logged days |

**So production carries two different answers, deliberately:**

- **`activation-funnel.ts` (10 Aug): "first log" = the first `daily_reports` row.**
  That is your option **(1)**. It is the definition the admin funnel renders.
- **`study-truth.ts` (16 Sep): the headline must be `study_duration > 0`.**

**ESTABLISHED: "first log" is *never* option (3) — there is no post-onboarding
filter anywhere — and never option (4) beyond the fact that a completing tick
writes the row.** Nothing in the codebase computes "first genuine study day" as
a distinct concept. That concept does not exist in production.

---

## 5. Day 1 vs Day 2 semantics

**ESTABLISHED: production has no calendar day-numbering. "Day N" is
log-indexed.**

`src/app/api/cron/onboarding-morning/route.ts:120`:

```
const dayNumber = loggedDays.size + 1;   // the day they're about to complete
```

where `loggedDays` is the set of distinct `report_date` values. The same file's
header (`:26-31`) flags this as load-bearing: *"`loggedDays.size` is not only a
gate — it becomes `dayNumber`, and `dayNumber` is rendered to the student as
which day of the 7-day arc they are on."*

Consequences: a student who signs up Monday and logs nothing is still "Day 1" on
Friday. Signup date **never** advances the arc. And `:114` —
`if (loggedDays.size === 0) continue; // activation ladder owns them` — a
student with zero logs is not on the arc at all.

The study day itself runs **05:30 IST → 05:29 IST** (`src/lib/study-day.ts:33-34`,
`STUDY_DAY_ROLLOVER_MINUTES = 330`), changed from 03:00 IST on 14 Aug.
*(Note: the header comment in `src/lib/streak-utils.ts:9-11` still says 3 AM.
Stale documentation, not a defect — `getLogDateString` is a re-export of
`studyDayString`.)*

### The four examples, traced

**Example A** — signs up Mon, onboards Mon, does the log tour Mon, no study Mon,
returns Tue, logs Tue:

| question | production answer |
|---|---|
| signup day | Monday (`profiles.created_at`) |
| onboarding day | Monday (`onboarding_completed = true`; no date column for it) |
| **Day 1** | **Tuesday** — `loggedDays.size + 1` was 1 only once a log existed |
| first log | Tuesday's `daily_reports` row |
| first study day | Tuesday, *if* `study_duration > 0`; otherwise the student has a first log and no first study day |
| activation day | `first_log` stage = Tuesday |

**Example B** — identical minus the log tour: **every answer is the same.** The
tour is invisible to all of it (§3).

**Example C** — onboarding logging Mon, returns Tue and does nothing, studies Wed:
first log = **Wednesday**; first study date = Wednesday; activation = Wednesday.
Day-2 status: `day2_return` is satisfied by an `app_open` **or** a log on
signup+1..+2 (`activation-funnel.ts:73`), so Tuesday's visit alone satisfies it.

**Example D** — signs up Mon, no onboarding log, never returns:

**This is the question that matters, and the answer is: both readings are
available, and production picks the harsher one.**

- By production's definition (`first_log` = a row exists) they are
  **"never logged"**.
- **But there is no code anywhere that defines a day on which a log becomes
  "expected".** No grace period, no "day 1 exempt" rule, no
  `first_expected_log_date`. I searched for it; it does not exist.
- The product *does* ask on day one: `first_log_prompt` fires in the first
  session for some students (observed in event data, §8).

**INFERRED, and I want it read as inference:** a student who signs up and never
returns has no *behavioural* first-log opportunity beyond their single session.
Calling them "never logged" is arithmetically true and explanatorily empty — it
tells you they left, not that they refused to log. **This is a real weakness in
the previous framing.**

---

## 6. Is the 412 number valid?

**OLD QUERY.** Real students with exactly one `app_open` IST-day in a rolling
30-day window, and `user_id NOT IN (SELECT student_id FROM daily_reports)`.

**OLD DEFINITION.** "Logged" = a `daily_reports` row exists, ever.

**PROBLEM — three of them, in increasing severity:**

1. **Rolling-window drift (minor).** The window moved between then and now. The
   same query today returns 633 / 438 / 410 / 28 where it returned
   652 / 437 / 412 / 25. The numbers are not stable and were never labelled as
   a snapshot.
2. **"Logged" ≠ "studied" (material).** A zero-hour row counts. Of the 332 real
   students with any row, **113 have only zero-hour rows** — they never recorded
   a minute of study. The funnel's "logged" stage silently contains them.
3. **The 30-day window truncates history (material, and the one that matters
   most for the 266 — see §7).**

**What 412 gets RIGHT:** for the *never-logged* count specifically, row-existence
is the **most generous possible** definition. A student with zero rows performed
neither E1 nor E2 and did not even record "I didn't study". **412 is a lower
bound on non-activation, not an overcount.** Under the stricter
`study_duration > 0` test the same cohort's never-studied count is **481**, not
410.

**CORRECT DEFINITION.** Separate three stages that the old query fused:
*has a row* → *has a row with `study_duration > 0`* → *has ≥2 such days*.

**CORRECTED NUMBERS — all 1,209 real students, all time, not a window:**

| stage | n | of registered |
|---|---|---|
| registered (real students) | **1,209** | 100% |
| onboarding completed | 1,072 | 88.7% |
| plan generated (`daily_routines`) | 1,080 | 89.3% |
| ticked ≥1 task | **160** | 13.2% |
| **has any `daily_reports` row** | **332** | 27.5% |
| — of which **only** zero-hour rows | 113 | 9.3% |
| **recorded real study (>0h) ever** | **219** | **18.1%** |
| recorded study on ≥2 days | **70** | 5.8% |
| **never any row** | **877** | 72.5% |

Category "no actual study opportunity yet": **does not exist** — every real
student is ≥1 day old and 1,080 of 1,209 had a plan generated.

`ticked a task but no row`: **2 students.** My earlier worry that task-tickers
were being missed by the row-existence test is **wrong** — the overlap is two
people.

---

## 7. Is the 266 cohort valid?

**No. It is overstated by about 30%, and the cause is the rolling window.**

Re-running the cohort today returns **265**. Of those 265:

| test | result |
|---|---|
| onboarding completed | 250 (94%) — **the 94% claim holds** |
| had a `daily_routines` plan | 250 (94%) |
| **ticked even one task** | **0** |
| signed up *before* the 30-day window opened | **64** |
| **opened the app on >1 IST day, all-time** | **78 (29%)** — up to 4 days |
| **genuinely one-day-ever** | **187** |

**ESTABLISHED: 78 of the 265 did come back.** The 30-day window hid visits
older than it. "Came once and never returned" was measured against a window, not
against the student's life. **The day-one cliff cohort is 187, not 266.**

**The 0-of-265 task-tick figure is the strongest fact in this audit.** Not one
of them touched a single task on a plan that 250 of them had.

---

## 8. Is the 28-person interview cohort valid?

**Mostly yes — but they are not one cohort, and I built them as if they were.**

All 28 matched a profile. **0 have any `daily_reports` row** (not even a
zero-hour one) and **0 ticked a single task** — so *"did not log a study day"*
is **still true for all 28** under every definition in §1. **0 joined before
13 Aug**, so all 28 experienced the current onboarding including the log tour,
and none were exposed to the Incident #30 outage. That much is clean.

But the event data splits them into groups with **different mechanisms**:

| group | n | evidence | verdict |
|---|---|---|---|
| **Reached the log and abandoned it** | **6** | `first_log_prompt` → `log_open` → `log_dismissed`; all 6 who opened it dismissed it | **VALID — and the highest-value 6 on the list** |
| **Never opened the log at all** | **22** | no `log_open` event | **VALID**, different question |
| No plan ever generated | 4 | zero `daily_routines` rows despite `onboarding_completed = true` | **VALID, but treat as a possible technical failure** |
| Not one-session students | 2 | 3 `app_open` days, 3 plans each | **VALID**, but the first-session framing does not apply |
| Uploaded a timetable | 1 | `timetable_upload_start` → `parsed` → `saved`, hours after signup | **REMOVE from the "did nothing" framing** — he did substantial work |

Cross-cutting: **18 of 28 completed the log tour, 10 did not**; 9 saw a plan
snapshot.

Specific removals and reclassifications:

- **S-A — RECLASSIFY.** Opened the log at 03:14:38 and
  dismissed it at 03:14:47 — **nine seconds**. Then returned hours later and
  uploaded, parsed and saved a timetable. He is not a student who failed to
  engage; he is a student who chose a different door. Interviewing him as a
  non-logger will produce a misleading answer.
- **S-B, S-C, S-D — FLAG.** Zero `daily_routines`
  rows. `api/routine/today:263` upserts a plan **every time it serves the
  tracker**, so the absence of a row means that route never completed for them.
  `route.ts:571` returns `500 Plan engine error` on a throw. **NOT ESTABLISHED
  that they saw a broken screen** — but "the plan never generated" is a live
  hypothesis for these three and they should be asked what was *on* the screen
  before anything else.
- **S-E, S-F — RECLASSIFY.** Three visit-days and three
  plans each. Still never logged. Arguably *stronger* subjects — repeated intent
  — but do not ask them about "your first session".

**Population context, which reframes the interview:** of the **877** real
students with no log row ever, **279 opened the log sheet and never completed
it**. Across all real students, **577 ever opened the log and only 298 of them
ever produced a row — a 52% completion rate on the log sheet itself.**

---

## 9. Corrected activation funnel

All 1,209 real students, all time. Each number is a `SELECT count(*)`, not a rate.

```
registered (real students)              1,209    100%
  → onboarding complete                 1,072     88.7%
  → plan generated (daily_routines)     1,080     89.3%
  → onboarding log                          0      —   (impossible by design, §3)
  → first genuine study opportunity     1,080     89.3%  (= had a plan)
  → opened the log sheet                  577     47.7%
  → ticked ≥1 plan task                   160     13.2%
  → any daily_reports row                 332     27.5%
      of which zero-hour only             113      9.3%
  → recorded real study (>0h)             219     18.1%
  → repeat study (≥2 days)                 70      5.8%
```

"First genuine study opportunity" is stated as **= had a plan generated**, which
is the closest provable proxy. **There is no `first_expected_log_date` in
production** (§5), so any stricter definition would be invented.

**Cohort stability, by signup week — the finding I did not expect:**

| week | signups | never any row | % |
|---|---|---|---|
| 13 Jul | 115 | 86 | 74.8% |
| 20 Jul | 119 | 72 | 60.5% |
| 10 Aug | 168 | 126 | **75.0%** ← contains the Incident #30 outage |
| 17 Aug | 324 | 242 | 74.7% ← first full week after the log tour |
| 24 Aug | 217 | 169 | 77.9% |
| 31 Aug | 160 | 111 | 69.4% |
| 7 Sep | 78 | 56 | 71.8% ← after the First Verdict |

**ESTABLISHED: the never-logged rate is flat at 70–78% across every regime** —
before and after the log tour, before and after the outage, before and after the
First Verdict. **INFERRED:** the historical-difference risk is real in kind but
small in effect; none of the shipped changes moved this number.

---

## 10. What we were wrong about

1. **"203 logged a study day" was not study.** It counted `daily_reports` rows,
   47% of which record *not* studying. The honest figure for the same window is
   **121 studied**, and all-time **219 of 1,209 (18.1%)** ever recorded real
   study.
2. **"266 came once and never returned" is really 187.** 78 of them opened the
   app on more than one day; the 30-day window hid it. A 30% overstatement, and
   my error: I measured a lifetime claim inside a rolling window.
3. **I never checked `routine_task_completions`.** The production funnel has a
   `first_tick` stage before `first_log` and I skipped it. (It turned out to
   change almost nothing — 2 students — but I did not know that when I wrote the
   conclusion.)
4. **I treated the 28 as one mechanism.** They are at least two: 6 who reached
   the log and abandoned it, 22 who never opened it. The single working question
   we agreed on assumes a single mechanism.
5. **The funnel numbers were presented without a snapshot timestamp.** They moved
   within 48 hours.

**What survives unchanged:** the 28 never logged and never ticked — true under
every definition. Onboarding never fabricated a log. And 0 of 265 day-one
students ticked a task.

---

## 11. What remains unknown

- **The exact start of the Incident #30 outage** — 9 Aug inferred, 15 Jul
  possible. Not established from source.
- **Why 4 of the 28 have no plan row.** Route never ran, or it threw. No
  server-side error telemetry ties to these user ids.
- **Whether 0-of-265 task-ticks means the tick was unfindable, unattractive, or
  unreached.** The database shows absence, not cause.
- **Whether the 279 who opened the log and abandoned it refused the ask or hit a
  problem.** `log_dismissed` records the dismissal, not the reason.
- **What the 435 rows with `study_duration_source = NULL` actually mean.**
  Pre-19-Aug rows; provenance unrecoverable.
- **Whether onboarding-era students saw a materially different first session.**
  The rate is flat (§9), but flatness is consistent with several explanations.

---

## 12. Exact next read-only query

Reproduces the corrected population. `SELECT` only.

```sql
with real as (
  select id, created_at from profiles
  where role = 'student'
    and coalesce(is_test_account,false) = false
    and coalesce(is_demo,false)         = false
),
plan    as (select distinct student_id from daily_routines),
tick    as (select distinct student_id from routine_task_completions),
anyrow  as (select distinct student_id from daily_reports),
studied as (select distinct student_id from daily_reports where study_duration > 0),
rep2    as (select student_id from daily_reports where study_duration > 0
            group by 1 having count(distinct report_date) >= 2),
-- all-time open days: NEVER a rolling window. This is the fix for the 266.
opens as (
  select user_id, count(distinct (created_at at time zone 'Asia/Kolkata')::date) open_days
  from student_events where event = 'app_open' and user_id is not null group by 1
),
logsheet as (select distinct user_id from student_events where event = 'log_open')
select
  count(*)                                                  as registered,
  count(*) filter (where p.student_id is not null)          as plan_built,
  count(*) filter (where l.user_id   is not null)           as opened_log_sheet,
  count(*) filter (where t.student_id is not null)          as ticked_a_task,
  count(*) filter (where a.student_id is not null)          as any_report_row,
  count(*) filter (where a.student_id is not null
                     and s.student_id is null)              as zero_hour_only,
  count(*) filter (where s.student_id is not null)          as studied_ever,
  count(*) filter (where r2.student_id is not null)         as studied_2plus_days,
  count(*) filter (where o.open_days = 1
                     and a.student_id is null)              as one_day_ever_never_logged,
  count(*) filter (where o.open_days = 1
                     and a.student_id is null
                     and l.user_id is not null)             as one_day_opened_log_then_left
from real r
left join plan     p  on p.student_id  = r.id
left join tick     t  on t.student_id  = r.id
left join anyrow   a  on a.student_id  = r.id
left join studied  s  on s.student_id  = r.id
left join rep2     r2 on r2.student_id = r.id
left join opens    o  on o.user_id     = r.id
left join logsheet l  on l.user_id     = r.id;
```

Three rules this query encodes, each one a mistake the last analysis made:
**never use a rolling window for a lifetime claim**; **never say "logged" when
you mean "studied"**; **carry `log_open` alongside the row test**, because the
gap between them is where the mechanism lives.

**Verified output, run 22 Sep 2026:**

| column | value |
|---|---|
| registered | 1,209 |
| plan_built | 1,080 |
| opened_log_sheet | 577 |
| ticked_a_task | 160 |
| any_report_row | 332 |
| zero_hour_only | 113 |
| studied_ever | 219 |
| studied_2plus_days | 70 |
| **one_day_ever_never_logged** | **426** |
| **one_day_opened_log_then_left** | **122** |

Two of these are new and neither existed in the previous analysis.

**426** is the true "opened the app on exactly one day, ever, and never logged"
population across all 1,209 students — measured with no window at all. It is not
comparable to the old 266 or the corrected 187, both of which were scoped to
students who opened *inside* the last 30 days. **426 is the number that should
replace 266 as the headline**, because it is the only one of the three that a
moving window cannot change.

**122** of those 426 opened the log sheet during that single visit and left
without completing it. That is a cohort defined by a *specific abandoned action*
rather than by absence — the sharpest interview population this audit found,
and roughly four times the size of the 28.

---

## 13. The "unconditional ask" hypothesis — and what the evidence does NOT say

Added 22 Sep after the audit, from the same read-only session.

### The guardrail, first

> **The data supports an "unconditional ask" hypothesis, not a causal
> conclusion about onboarding practice or timing. Signup-day first-loggers
> demonstrate that a Day-1 log can be appropriate when the student has actually
> studied.**

That sentence is here to stop today's evidence quietly becoming tomorrow's
"obvious product insight". Anyone citing this section must cite that line with it.

### The hypothesis that survives

**Not** "students won't fill the log because they just practised it" — that one
was tested and killed (below).

**Instead:** *the product asks for a real study log regardless of whether the
student has yet accumulated anything to report.* The ask is **unconditional**.
For a student who has studied, the same interaction works. For a student who has
not, it is an empty form.

This is a conditional hypothesis, which is why it is worth keeping: it does not
prescribe a universal redesign.

### Evidence for it — ESTABLISHED

| measurement | value |
|---|---|
| median gap, onboarding practice → real log ask | **158 seconds** |
| students given the real ask within 5 min of the practice | **195 of 304 (64%)** |
| median time from first opening the real log to dismissing it | **9.4 s** (p25 4.2, p75 18.1) |
| first-opens dismissed under 10 s | **198 of 381 (52%)** |
| first-opens dismissed under 30 s | **333 of 381 (87%)** |

A nine-second dismissal is not a long form, an unclear field, or a confusing
layout. It is open, look, close — the signature of having nothing to enter.

### Evidence AGAINST over-reading it — equally ESTABLISHED

First-ever log row, by when it landed:

| first log | students | zero-hour | avg hours | went on to study |
|---|---|---|---|---|
| **on signup day** | 154 | **26.6%** | **2.10 h** | 119 (77%) |
| on a later day | 178 | 66.9% | 0.90 h | 100 (56%) |

**113 of 154 signup-day first-loggers reported real study.** A Day-1 ask is not
inherently premature. It is premature *for a student who has not studied yet*,
which is a targeting problem, not a sequencing one.

### The onboarding-practice hypothesis: TESTED AND REJECTED

Design: `finish(skipped)` in `screen-log-tour.tsx:166-172` fires `log_tour_done`
on **both** the practise and skip paths, carrying `practiced` and `skipped`.
Every student who reached that screen is therefore in the data, and the practice
taps vary *after* onboarding completion — so the comparison is not confounded by
who finished onboarding. **504 of 658 (77%) skip the practice.**

Among students who also had a plan generated (n = 514):

| outcome | practised (n=195) | no taps (n=319) | difference (95% CI) |
|---|---|---|---|
| opened the real log | 64.1% | 65.2% | **−1.1pp** [−9.6, +7.4] |
| produced a log row | 33.3% | 35.4% | **−2.1pp** [−10.5, +6.4] |
| recorded real study | 23.1% | 24.5% | **−1.4pp** [−8.9, +6.2] |
| median tour → log open | 2.4 min | 2.3 min | +0.1 min |

**The sign runs the wrong way for the hypothesis.** If "I just did this" were the
mechanism, the 77% who skipped the practice should convert *better*. They convert
at 35.4% against 33.3%, well inside noise.

Cross-check, pre/post 13 Aug, students with a plan: opening the log 51.7% → 53.5%;
recording real study 21.1% → **20.0%**. (Logged-anything fell 36.6% → 28.8%, but
that is zero-hour rows moving, and this era comparison is confounded by the rest-day
change, the 9–12 Aug outage and the plan-card rewrite all landing in the gap. The
dose-response test above is the identified one; this is corroboration only.)

**Statistical limit, stated plainly.** These n's exclude an effect larger than
about ±10pp. A 5pp effect would be detected only 21% of the time. **This rules
the tour out as a material cause. It does not prove the effect is zero.**

### What must NOT be quoted

The raw **39.5% vs 59.8%** split (asked within 5 min of practice vs asked later)
is **entangled with returning** and must not be cited. Controlling for whether
the student ever returned, it is **56.3% vs 63.0%** — 6.7pp, not causal. The
39.5% number is retired here so nobody finds it later and uses it.

### Where the interviews go

Two distinct jobs, not one:

- **The 6 who opened and dismissed.** Ask: *"When you opened that screen, what
  did you think it was asking you to do?"* then reconstruct what they did.
  **Never mention the 9-second measurement** — naming the evidence hands them
  the answer (§ interview protocol, ACTIVATION-CLIFF).
- **The 22 who never opened it.** A different problem entirely: what happened
  *before* they decided whether to open the log. **The onboarding-practice
  hypothesis does not explain this group, and neither does anything else yet.**

Beyond the 28, the population-scale version of the same boundary: **577 students
opened the real log and 298 finished it.** The **279** who opened and abandoned —
**122 of them on their only ever visit** — are defined by a specific abandoned
action rather than by absence.

**Next evidence is calls. No build, no instrumentation, no redesign.**

---

## Note on identifiers in this document

Student names and phone numbers are **deliberately absent**. This repository is
public. Individual students in §8 are labelled **S-A … S-F**; the mapping from
those labels to real students lives only in the founder's call list, outside git,
and must never be committed here.
