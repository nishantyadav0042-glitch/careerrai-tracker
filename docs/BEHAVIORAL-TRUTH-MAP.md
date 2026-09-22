# CareerRai Behavioural Truth Map

22 Sep 2026. **Read-only.** No code change, no database write, no
instrumentation, no deploy, no product change. Database access was `SELECT`
only; source claims are cited to file and line.

Its purpose is narrow: **from here on, CareerRai must not be able to fool itself
with an event that does not mean what we think it means.** Three times in one
day an analysis mistook absence in a query for absence in the world — the 266,
the 7.6-minute dwell, and a sequence query that tokenised a task tick as
`task_complete`, an event that is never emitted.

Labels are strict. **ESTABLISHED** = read from source or returned by a
production query. **INFERRED** = a reading of established facts.
**WE DO NOT KNOW** = the evidence does not settle it, and nothing is filled in.

---

## 1. The event vocabulary

**ESTABLISHED.** The declared vocabulary is the `EventName` union,
`src/lib/journey.ts:199-429`. Reconciled against every distinct value in
`student_events`:

| | count |
|---|---|
| declared in `EventName` | **150** |
| actually firing in production | **125** |
| **firing but NOT declared** | **7** |
| **declared but never fired** | **32** |

*(A few "declared" entries — `attempted`, `failed`, `opened`, `signup` — are
prop literals my extraction caught inside the same line range, not event names.
Noted rather than silently dropped.)*

**Firing without being declared:** `busy_day`, `first_insight_shown`,
`pageview`, `plan_block_added`, `purchase_attributed`, `timetable_confirmed`,
`timetable_parsed`. These bypass the type, so the union is **not** a complete
inventory and must never be treated as one.

**Never fired, though declared** — the operationally important ones:
`pay_failed`, `pay_exception`, `pay_order_failed`, `pay_script_failed`,
`auth_session_lost`, `auth_logout`, `auth_identity_started`,
`pay_blocked_flag_off`, `pay_free_unlock`, `meta_escape_click`.

> **No payment-failure event has ever fired.** Four distinct failure events are
> declared and all four are empty. We cannot see a failed payment from
> telemetry.

### Categories — never interchangeable

| cat | meaning | examples |
|---|---|---|
| **A** UI interaction | a tap/gesture occurred | `tap`, `log_open`, `install_click`, `checkin_answered` |
| **B** navigation | a screen was entered/left | `screen_view`, `screen_exit`, `app_open` |
| **C** intent | student signalled an aim, nothing committed | `first_log_prompt` (ask shown), `buddy_plan_click`, `session_book_click` |
| **D** successful action | the client believes it worked | `daily_log`, `checkin_completed`, `timetable_saved` |
| **E** DB mutation | a server write is claimed | `completion_write` (carries `ok`) |
| **F** study evidence | a claim about real study | **none is an event** — see §4 |
| **G** error | a failure surfaced | `log_error`, `log_blocked`, `timetable_parse_failed` |
| **H** system/background | fired without a student act | `session_forensics`, `storage_persistence`, `daily_slot_served`, `insight_shown` |
| **I** onboarding/demo | simulation, never real | `log_tour_done`, `sample_insight_shown`, `plan_snapshot_shown` |
| **J** notification | send/expose/act | `push_*`, `reopen_nudge_*`, `buddy_nudge_*` |

**Category I is the trap.** `log_tour_done` and `sample_insight_shown` describe
a *practice* interface (§3 of the log-semantics audit). `plan_snapshot_shown`
fires in `src/components/onboarding/plan-snapshot.tsx:89` — an **onboarding**
component. **It is not a tracker plan view and must never be read as one.**

### First production dates — the regime boundaries

| event | first seen | note |
|---|---|---|
| `app_open` | 2026-07-15 | oldest behavioural event |
| `pageview` | 2026-07-15 → **2026-07-27** | dead; replaced |
| `log_open`, `first_log_prompt` | 2026-07-20 | |
| `log_dismissed` | **2026-07-25** | **5 days of opens with no dismissals recorded** |
| `screen_view` | **2026-08-07** | |
| `screen_exit` | **2026-08-08** | **dwell and scroll begin here** |
| `log_tour_done` | 2026-08-13 | |
| `plan_snapshot_shown` | 2026-08-14 → **2026-09-16** | **dead since 16 Sep** |
| `completion_write` | **2026-08-19** | task-tick telemetry begins |
| `auth_*` | 2026-08-27 | |
| `app_installed` | 2026-08-28 | |
| `push_ask_*`, `resource_*` | 2026-09-01 | |
| `tap` | **2026-09-07** | 166 users only |

---

## 2. The action → proof matrix

The most important table here. `PROVEN` means every link in the chain is
observable; `PARTIAL` means a link is missing or conditional; `NOT OBSERVABLE`
means the chain breaks.

| user action | client event | API | server result | DB state | UI result | verdict |
|---|---|---|---|---|---|---|
| Submit the log sheet | `daily_log` (D) | `/api/logging/log-daily` | 200 + `report_date` | `daily_reports` row + `streak_data` | feedback sheet | **PROVEN** |
| Tap task Done | `completion_write` (E, carries `ok`, `status`) | `/api/routine/complete-task` | 200 | `routine_task_completions` row | card ticks | **PARTIAL** — event only from 19 Aug; row is *toggle state* |
| Complete the whole plan | `daily_log` `{surface:'plan_card'}` | same route | RPC `is_new_log` | `daily_reports` row | "Ready for tomorrow" | **PARTIAL** — the `surface` prop only exists from 16 Sep |
| **Untick a task** | `completion_write` | same route | 200 | **row DELETED** | card unticks | **NOT OBSERVABLE before 19 Aug** |
| Open the log | `log_open` (A) | none | — | none | sheet opens | **PROVEN** (from 20 Jul) |
| Abandon the log | `log_dismissed` (A) | none | — | none | sheet closes | **PARTIAL** — from 25 Jul only |
| View the plan on the tracker | **none** | `/api/routine/today` | 200 | `daily_routines` upsert | plan renders | **NOT OBSERVABLE** — no event distinguishes this from any tracker visit |
| Plan generated | **none** | `/api/routine/today:263` | 200 or **500** | `daily_routines` row | plan renders | **PARTIAL** — the 500 path emits nothing |
| Actually study | **none exists** | — | — | `study_duration` (self-report) | — | **NOT OBSERVABLE** — see §4 |
| Upload a timetable | `timetable_upload_start` → `timetable_parsed` → `timetable_saved` | upload route | — | timetable state | plan replaced | **PROVEN** |
| Pay | `pay_order_created` → `pay_checkout_opened` → *(success)* | Razorpay + callback | verified signature | `payments` row | unlock | **PARTIAL** — `pay_success_callback` has fired **twice, ever**; no failure event has **ever** fired |
| Receive a notification | dispatch → `notifications` row | — | push service accepted | `received_at`, `push_verified_at` | banner | **PARTIAL** — acceptance ≠ display |
| See a notification | **none** | — | — | — | — | **NOT OBSERVABLE** |
| Close the app / leave | `screen_exit` (B) | — | — | — | — | **PARTIAL** — from 8 Aug, and a killed tab may send nothing |

### Event ↔ database disagreement, measured

| behaviour | students in DB | students with the client event | DB but no event | event but no DB |
|---|---|---|---|---|
| task tick | **160** | 136 | **49** | **25** |
| daily log | **332** | 175 | **157** | 0 |
| plan generated | **1,080** | 511 (`plan_snapshot_shown`) | 587 | 18 |

**`daily_log` captures 175 of 332 students — 53%.** Any funnel built on the
event rather than the table understates logging by nearly half.

---

## 3. False-absence risks

Every place a query can say *"the student did not do X"* when it means
*"we cannot see whether the student did X."*

| risk | WHAT WE CAN CLAIM | WHAT WE CANNOT CLAIM |
|---|---|---|
| **Task ticks before 19 Aug** | A surviving `routine_task_completions` row proves a tick that was not undone | That a student never ticked. **No event existed.** |
| **Ticked then unticked** | **ESTABLISHED: untick DELETES the row** (`complete-task/route.ts:82`). **20 of 136 students (15%) with a successful tick write have zero surviving rows.** | That students with no row never interacted with a task. At least 15% of observed tickers are invisible in the table, and pre-19-Aug **the rate cannot be measured at all**. |
| **Dwell / scroll before 8 Aug** | Dwell and scroll for sessions from 8 Aug onward | Anything about attention before 8 Aug. `screen_exit` did not exist. |
| **Log dismissals 20–25 Jul** | Opens in that window | Abandonment rate in that window |
| **Plan viewing, any era** | That a `daily_routines` row exists | That the student saw it, or what was on the screen |
| **Plan generation failure** | That no row exists | Why. The 500 path (`routine/today:571`) emits no event. |
| **Actual study** | That a student *reported* hours | That any studying occurred. Every hour figure is self-report or derived from ticks. |
| **Study session continuation** | Nothing | Anything. No event marks study starting or ending. |
| **Content consumption** | `resource_opened` from 1 Sep | Whether anything was read, or for how long |
| **Failed taps / ignored UI** | `completion_write` failures from 19 Aug (30 of 1,182 writes, 2.5%) | Any failure before 19 Aug, or any tap that never reached a handler |
| **Notification seen** | That we dispatched, and that a device beaconed receipt | That a human saw it. **Delivery ≠ display ≠ attention.** |
| **Notification acted on** | A click beacon where present | Attribution of a later action to a notification |
| **Payment failure** | Nothing | Anything. Four failure events declared, **zero fired**. |
| **App exit / browser navigation** | `screen_exit` from 8 Aug | A hard close, a crash, or a killed tab |
| **`tap` coverage** | Taps for **166 users from 7 Sep** | Any generalisation to the 1,209 |

---

## 4. The study mechanism, from database truth

| claim | strongest evidence | class |
|---|---|---|
| 1. A plan existed | `daily_routines` row for that student+date | **DIRECT** |
| 2. The plan was displayed | *(none)* — the row is written by the route that serves it, so a row implies the route returned 200; it does not prove render | **INDIRECT** |
| 3. A task was interacted with | `completion_write` (from 19 Aug); `routine_task_completions` row (toggle state) | **INDIRECT** — deletions erase it |
| 4. A task was completed | surviving `routine_task_completions` row | **DIRECT**, for ticks not undone |
| 5. **Actual study occurred** | `daily_reports.study_duration > 0` — **self-reported or derived from ticks** | **INDIRECT at best. There is no direct evidence of studying anywhere in this system.** |
| 6. A study session continued | *(nothing)* | **UNKNOWN** |
| 7. The student returned | `app_open` on a later IST day | **DIRECT** (from 15 Jul) |
| 8. A next study day occurred | a second `daily_reports` row with `study_duration > 0` | **INDIRECT**, same limit as 5 |

> **The most consequential line in this document:** CareerRai has **no direct
> evidence that any student has ever studied.** Every study number is a
> self-report in a form, or hours credited from ticking a plan. That is not a
> defect to fix — it is the honest boundary of what a tracker can know — but no
> analysis may cross it without saying so.

---

## 5. Measurement regimes

Do not pool across these boundaries silently.

| regime | span | what changed | safe to compare across the boundary |
|---|---|---|---|
| R0 pre-telemetry | 12 Jul – 14 Jul | DB rows only | DB state only |
| R1 basic | 15 Jul – 7 Aug | `app_open`, `log_open`, `daily_log` | opens, log opens, DB state |
| R2 screens | 8 Aug – 12 Aug | `screen_view` / `screen_exit` arrive | **dwell/scroll: R2 onward only** |
| — **outage** | **9 Aug – 12 Aug** | fractional hours rejected, HTTP 500 (Incident #30) | **logging rates: NOT comparable** |
| R3 rest-day logs | from 9 Aug | a zero-hour row becomes a valid log | **"logged" counts: NOT comparable across 9 Aug** |
| R4 tour + plan-card | from 13 Aug | onboarding practice; the plan card becomes the primary log door | log *surface* mix changes |
| R5 rollover | from 14 Aug | study day 03:00 → 05:30 IST | `report_date` for 03:00–05:30 logs shifts |
| R6 task telemetry | **from 19 Aug** | `completion_write`; half-tick no longer closes a day | **task interaction: R6 onward only** |
| R7 provenance | from 19 Aug | `study_duration_source` populated | 435 earlier rows have NULL provenance |
| R8 first verdict | from 4 Sep | first-session ask replaced | first-session behaviour changes |
| R9 surface tag | from 16 Sep | `daily_log` gains `surface` | before this, the two log doors are **one indistinguishable total** |
| — | **16 Sep** | `plan_snapshot_shown` **stops firing** | onboarding-plan exposure: not measurable after 16 Sep |

---

## 6. Cohort A by measurement quality

**A = 70 students with real study (`study_duration > 0`) on ≥2 distinct days.**
They are not one cohort. Split by the regime they entered under:

| entry regime | what is observable for them |
|---|---|
| joined before 8 Aug | no dwell, no scroll, no task telemetry, no auth funnel |
| joined 8–18 Aug | dwell and scroll; **still no task telemetry** |
| joined from 19 Aug | dwell, scroll, task writes with success/failure |
| joined from 7 Sep | the above plus `tap` |

**ESTABLISHED for A as a whole:** 45.7% ticked a task in their first 24 h,
78.6% opened the log, median 73 events in 24 h, 87% returned on days 2–7.
**Those 24-hour figures mix students whose task behaviour was instrumented with
students whose was not**, so the 45.7% is a floor, not a rate.

---

## 7. Success path — observed, not inferred

For the subset where behaviour is genuinely observable, the wording rule holds:
*X was observed before subsequent real-study evidence* — never *X caused it*.

**Observed:** a first task tick within 24 h of signup was observed before real
study recorded on a day ≥2 days later in **33.7%** of cases (n=89), against
**11.6%** for log-opening without a tick (n=396) and **4.4%** for neither
(n=724). The outcome window cannot have been produced by the first-24h
behaviour, so this is not circular.

**WE DO NOT KNOW** whether ticking produces study or merely accompanies a
student who was going to study anyway. Nothing here distinguishes them.

---

## 8. What the observable taps actually show

`completion_write`, the only instrumented study-path interaction, 19 Aug → today:

| measure | value |
|---|---|
| write events | 1,182 |
| distinct students | 138 |
| successful | 1,152 (97.5%) |
| failed | **30 (2.5%)** — kinds `http` and `network`; statuses `0, 200, 400, 404` |
| students with ≥1 failure | 15 |
| **students with successful writes but zero surviving rows** | **20 (15%)** |

A `status: 200` recorded under `ok: false` is itself worth noting: the client
judged a write failed on a 200 response. **WE DO NOT KNOW** why; n is small.

Log-sheet interaction, all eras: **577 students opened it, 298 produced a row.**
First-open → dismissal median **9.4 s**; 52% under 10 s; 87% under 30 s.

**Event count is not engagement.** Median 24 h event counts of 73 / 41 / 20
across cohorts A / B / C are reported as a *volume* difference only; two
students with identical counts can have had opposite journeys.

---

## 9. The three gaps that matter

Not a wishlist. Each is tied to a decision that is currently blocked.

**GAP 1 — Task interaction is a toggle with no history.**
*Why it matters:* the first task tick is the earliest durable divergence we can
see (§7), and it is the one signal the product could act on.
*What we cannot tell:* whether a student touched a task and undid it; how often;
and nothing at all before 19 Aug. 15% of observed tickers leave no row.
*Minimum signal:* an append-only record of tick and untick — one row per
transition, never a delete.

**GAP 2 — Nothing distinguishes "saw the plan" from "opened the app".**
*Why it matters:* the 1,080 → 160 plan-to-tick gap is the largest in the
product, and we cannot say whether the plan was ever on screen.
*What we cannot tell:* whether a non-ticker rejected the plan or never saw it —
Hypotheses 1, 5 and 7 are indistinguishable.
*Minimum signal:* one event when the plan renders with ≥1 task, carrying the
task count. **One event, not a screen-view taxonomy.**

**GAP 3 — Plan-generation failure is silent.**
*Why it matters:* students exist who completed onboarding, reached the tracker,
and have no `daily_routines` row. `routine/today:571` returns 500 and emits
nothing.
*What we cannot tell:* whether they saw a broken screen. This is Hypothesis 7
and it is currently untestable.
*Minimum signal:* an error event on that catch path, carrying the reason.

---

## 10. The minimum learning loop

**Do not build this now.** Specification only.

The loop is `INTENT → ACTION → SYSTEM RESPONSE → SUCCESS/FAILURE → NEXT ACTION
→ LATER OUTCOME`. Today it is complete for the **log sheet** and broken for the
**study path**. Closing it needs **three signals, not a platform**:

1. **Append-only task transitions** (Gap 1) — closes ACTION and NEXT ACTION.
2. **One plan-rendered event** (Gap 2) — closes INTENT, and makes the
   plan→tick gap interpretable for the first time.
3. **An error event on plan generation** (Gap 3) — closes SYSTEM RESPONSE and
   separates failure from refusal.

Two rules the loop must carry, both paid for today:
**never delete a row that records an interaction**, and **every event name used
in an analysis must be checked against `journey.ts` before the query runs**.

---

## 11. CareerRai Behavioural Truth Table

| behaviour | what we measure | what proves it | what does NOT prove it | historical coverage | confidence | important gap |
|---|---|---|---|---|---|---|
| onboarding completion | `profiles.onboarding_completed` | the flag | `log_tour_done` (demo) | all | **high** | no completion timestamp |
| plan generation | `daily_routines` row | the row | `plan_snapshot_shown` (onboarding component) | all | **high** | failures invisible |
| plan display | *(nothing)* | — | a `daily_routines` row; a tracker `screen_view` | none | **none** | **Gap 2** |
| plan interaction | `completion_write` | the event with `ok` | absence of a row | **19 Aug →** | **medium** | **Gap 1** |
| task completion | `routine_task_completions` row | a surviving row | absence — untick deletes | all, lossy | **medium** | 15% invisible |
| study start | *(nothing)* | — | anything | none | **none** | no session concept |
| study continuation | *(nothing)* | — | anything | none | **none** | — |
| log opening | `log_open` | the event | `first_log_prompt` (ask shown, not opened) | **20 Jul →** | **high** | — |
| log submission | `daily_reports` row | the row | `daily_log` event (53% capture) | all | **high** | event under-reports |
| **actual study** | `study_duration > 0` | **nothing — self-report** | the row's existence (47% are zero-hour) | all | **low** | unfixable in principle |
| day close | `daily_reports` row via plan card | RPC `is_new_log` | `dayClosed` (true on every later tap) | all | **medium** | surface unknown pre-16 Sep |
| return next day | `app_open` on a later IST day | the event | `screen_view` | **15 Jul →** | **high** | — |
| notification exposure | `notifications.received_at` | device beacon | `sent`/accepted by push service | partial | **low** | display ≠ delivery |
| notification interaction | click beacon | the beacon | a later action's timing | partial | **low** | no attribution |
| errors | `log_error`, `log_blocked`, `completion_write{ok:false}` | the event | silence | **19 Aug →** for taps | **low** | **no payment failure event has ever fired** |
| app exit | `screen_exit` | the event | absence | **8 Aug →** | **medium** | killed tabs send nothing |

---

# THREE THINGS WE NOW KNOW

1. **`routine_task_completions` is toggle state, not an interaction record.**
   Untick deletes the row (`complete-task/route.ts:82`), and **20 of 136
   instrumented tickers (15%) have zero surviving rows.** Every past statement
   of the form "only N students ever ticked a task" is a floor, not a count.
2. **The log path is well instrumented and the study path is not.**
   `log_open` runs from 20 Jul; task telemetry from **19 Aug**; plan display has
   **no event at all, in any era**. We have been measuring what was easy to
   measure.
3. **There is no direct evidence of studying anywhere in this system**, and
   `daily_log` — the event most likely to be used as a proxy — captures only
   **175 of 332** students who actually hold a log row.

# THREE THINGS WE THOUGHT WE KNEW BUT DON'T

1. **"Only 4 of 990 never-studied students ever ticked a task."** Recorded
   yesterday in §14. It counts *surviving rows*; ticks that were undone leave
   nothing, and before 19 Aug nothing recorded the attempt. **The direction of
   the finding likely holds; the number does not.**
2. **"511 students saw their plan."** `plan_snapshot_shown` is an **onboarding**
   component and stopped firing on **16 Sep**. It never measured plan display,
   and it measures nothing now.
3. **The declared event union is the vocabulary.** It is not: **7 events fire
   that are not in it**, and **32 declared events have never fired**, including
   every payment-failure event.

# THREE QUESTIONS WE CANNOT ANSWER YET

1. **Did students who never ticked a task ever see a plan on screen?**
   No event distinguishes plan display from a tracker visit, in any era.
   **WE DO NOT KNOW.**
2. **How many students hit a plan-generation failure?** The 500 path emits
   nothing. **WE DO NOT KNOW.**
3. **Does ticking a task produce study, or accompany a student who would have
   studied anyway?** The forward test establishes order, never mechanism.
   **WE DO NOT KNOW.**

# ONE NEXT EVIDENCE STEP

**Re-run the §14 divergence restricted to students who entered from 19 Aug
onward** — the only population with task telemetry — using `completion_write`
(attempts, including undone ticks) instead of `routine_task_completions`
(surviving rows).

It is read-only, needs no new instrumentation, and is the only way to learn
whether the tick finding survives when undone ticks are counted. If it holds on
the instrumented cohort, it is real. If it collapses, we were reading a deletion
artifact — and we would have built on it.
