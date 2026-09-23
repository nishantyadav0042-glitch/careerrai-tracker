# Day-2 Observation Protocol (pre-registered 23 Sep 2026, 04:00 UTC)

Founder instruction, 23 Sep 2026: a 7-day read-only investigation, not
monitoring. This file fixes the question, the definitions and the reporting
format **before** any post-instrumentation Day-2 return has been observed.
Nothing below may be edited to fit what the data shows. A definition change
is a new protocol with a new date, and results under the old one are
reported as they were.

## The one question

> When a student returns after a study day, what is the first observable
> behaviour that separates a return followed by a recorded study day from a
> return that is not?

## Hard rules

1. **Read-only.** No change to student-facing behaviour, schema, study
   definitions, pricing, streaks, notifications, onboarding, plan logic or
   task mechanics during 23–30 Sep, unless a production defect is found. A
   defect fix is reported as such and does not count as an intervention.
2. **No manufactured significance.** Any cell with fewer than 10 episodes is
   reported as `N too small; directional only`. No p-values, no percentages
   on N < 10 without the raw counts beside them.
3. **No slicing until something wins.** The cohorts, fields and first-action
   categories below are the only cuts. A new cut appears only in the Day-7
   memo, labelled post-hoc.
4. **"No CareerRai activity" is never "did not study."** External resources
   are unobserved. Cohort B is "returned, no study RECORDED".
5. Every statement is ESTABLISHED, INFERRED, or NOT ESTABLISHED.

## Unit and cohorts

Query: `docs/sql/day2-return-first-120s.sql`.

- **Episode** = (genuine student, IST day D) with `daily_reports.study_duration > 0`, D ≥ 2026-09-22, D < today (IST).
- **Return** = the student's first `student_events` row on an IST day in (D, D+7].
- **A_repeat**: returned, and a study day is recorded on the return day.
- **B_returned_no_recorded_study**: returned, no study recorded on the return day (return day closed).
- **B_pending_day_open**: returned today, no verdict yet.
- **C_gone**: no event in (D, D+7], window closed.
- **C_pending**: no event yet, window open.

## The first 120 seconds of each return

| Field | Source | Note |
|---|---|---|
| Entry kind | first `app_open` / `app_resume` within 5 s of the first event | |
| Launch route | `props.launch` | only for returns after 2026-09-23 02:42 UTC; earlier = `pre-instr` |
| Cold start vs reload | `props.session_new` | same limit |
| Surface | `display_mode` | installed vs browser |
| First student-initiated action | first `tap` that IST day | categories: task, resource, log, dismiss_overlay, plan, reschedule, navigation, other |
| Seconds to first action | first tap − first event | |
| Seconds to first task interaction | first `mark_progress*` / `finished_it` / `got_halfway` tap | |
| Tick in 120 s | `completion_write` status 200 | |
| Resource in 120 s | `resource_opened` | leaving to a resource is NOT inactivity |
| Log in 120 s | `log_open` or `daily_log` | `log_open` can be auto-prompted |
| Error in 120 s | `log_error`, non-200 `completion_write` | |
| Exit in 120 s | `screen_exit{reason:'hidden'}` | |
| Studied later | study recorded on a later day ≤ D+7 | secondary |

`tap` rows are swept after 14 days, so each episode must be read within two
weeks of its return. The daily report is the record.

## Daily report (08:30 IST, 24–30 Sep)

**Amendment 1, 23 Sep 04:10 UTC, before the first report ran.** This changes
the report format and adds the archive rule. It does not change any
definition.

### The archive is the record

Every run commits `docs/day2-observation/episodes-YYYY-MM-DD.csv` to this
branch: one row per episode, holding every column the query returns. That
means an 8-character pseudonymous id (no name, phone or email), D1, cohort,
D2, entry kind, launch, session_new, surface, seconds to first tap, the first
tap's label and category, seconds to first task, the five 120-second flags,
and studied_later. Earlier files are never edited. A cohort that changes
later (for example, pending to A) appears in the next day's file, so every
Day-7 number can be traced to the rows and the date that produced it after
the underlying `tap` rows are swept.

### Format (brief; no recommendations)

```
Day-2 Observation — Day N (YYYY-MM-DD)
Sample: eligible episodes · pending · A repeat · B returned/no recorded study · C gone
First 120 s (by cohort, raw counts): first action · median s to first action ·
  task · resource · log · exit
Earliest divergence: one sentence, or "none yet"
Evidence quality: N, cells < 10 flagged "directional only", limitations
Founder conclusion — exactly one of:
  Evidence emerging — continue observation
  Ambiguous — instrument, don't build
  Mechanism sufficiently supported — candidate experiment
Pipeline: app_resume rows · app_open rows with launch
```

The daily report states what happened. It never proposes what to build.
Interpretation belongs to the Day-7 memo only. Before any pattern is
called a divergence, it must pass these checks: was the cut pre-registered,
does it repeat across days, could launch route or surface explain it, and is
it plausibly a marker of motivation that existed before the return rather
than something that happened after it.

`app_resume` is not debugged unless it is still zero at a point when hidden
exits followed by 30-minute absences are visible in the data.

## Day-7 decision memo (30 Sep)

Established behaviour · strongest plausible mechanism · competing
explanations · evidence that would falsify it · smallest experiment worth
running · hypotheses to kill.

There are three legitimate outcomes:
- **A. Clear divergence at one transition.** Propose the smallest intervention at that transition.
- **B. Ambiguous.** Instrument the missing transition. Build nothing.
- **C. No divergence.** Kill "today's next action being obvious is the key," and name the next explanation.

## Known constraints on what 7 days can show

- Returns before 02:42 UTC on 23 Sep have no launch or session fields.
- Episodes starting after 23 Sep will not have closed 7-day windows by 30 Sep, so C_gone will be undercounted in the memo. That is stated there, not corrected for.
- Late-September volume has been a few dozen active students a day. Seven days may yield fewer than 30 episodes per cohort. If so, the memo says so and outcome B is the honest default.

## Baseline at registration (23 Sep 04:00 UTC)

Six episodes (D = 22 Sep): two returned today (pending), four not yet returned.
Two post-deploy `app_open` rows, both carrying `launch` and `session_new`.
Zero `app_resume` rows, which is expected at this sample size.
