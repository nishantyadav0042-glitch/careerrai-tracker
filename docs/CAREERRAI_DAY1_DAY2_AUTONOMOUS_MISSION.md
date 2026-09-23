# CareerRai — Day-1 → Day-2 Autonomous Mission Report

Executed overnight 22–23 Sep 2026 under the founder's autonomous mandate
("Nishant is going to sleep. Take ownership."). Every statement is tagged
**ESTABLISHED** (read from source, measured in production, or verified by a
test), **INFERRED**, or **NOT ESTABLISHED / WE DO NOT KNOW**.

| | |
|---|---|
| Mission branch | `claude/day1-day2-bridge` |
| Branch commit | `5083e81cbfa314d1eeca5ec3fb816579d572627a` |
| Merge commit on `main` (PR #214, squash) | `138f6e74ea3c5502ef678ab15851b7ac1619fc26` |
| Production deployment | `dpl_CzdxwGnvP3GfU6APVGSBmCc9dW4D`, READY, 2026-09-23 02:42 UTC |
| Migration applied to production | `20260923a_display_status_vocabulary` at 02:29 UTC (before the code deploy, deliberately: it unblocks code that was already on main) |
| Baseline before the mission | `main` at `aa36db1`, tsc clean, 6,301 tests passing |

---

## 1. EXECUTIVE SUMMARY

The product question was the transition from a student's first real study
day to their next one. Before this mission the data could not say how a
repeat student came back, whether their return happened at all when the app
was already resident on the phone, or what state a study day had left them
in. It can now, from today forward, and the state-left-behind part can be
read backwards over history.

Three confirmed frictions on the successful path were removed without
changing what the product asks of a student: the reschedule Save no longer
reloads the whole app; the push ask's "Later" now means later; and the
Blueprint's taps have stable names. One suspected friction (the 35% of task-
card taps that led nowhere) was measured and left alone, because the
measurement showed use, not failure.

The largest finding was not on the mission's list. The notification display
measurement shipped on 17 Sep had never written a single row, because a
check constraint from an unmerged branch's migration — applied to production
by me — rejected the vocabulary the merged code writes. The receipt collapse
recorded as Incident #102 has a second, proven cause in the same refusal.
Fixed in production at 02:29 UTC; 43 display outcomes were recorded in the
following hour, the first ever. **ESTABLISHED.**

The first Day-1 → Day-2 report (Section 11) says one surprising thing: repeat
students do not resume. Of 70 who returned, 22 were offered a Day-1
unfinished topic by the next day's plan and 3 took it; 31 ticked a new task.
The product's "carry it forward" mechanism is not what they use. **ESTABLISHED
as a correlation on 70 students; the mechanism is NOT ESTABLISHED.**

## 2. WHAT WE VERIFIED

Before touching code (Phase 1), each claim from the forensic report was
checked against source on `main` at `aa36db1`:

- `app_open` is emitted only from `JourneyTracker` on root-layout mount, i.e. every document load, with no cold-start/reload distinction and no launch route. **ESTABLISHED** (`journey-tracker.tsx:28`).
- A resident PWA reopened by `visibilitychange` produced no event; only `screen_exit{reason:'hidden'}` on the way out. **ESTABLISHED.**
- Session id lives in `sessionStorage` (`cr_sid`) and is minted lazily. **ESTABLISHED** (`journey.ts getSessionId`).
- Reschedule Save calls `window.location.reload()` after a successful POST. **ESTABLISHED** (`pace-card.tsx:171`).
- Push ask "Later" persists nothing, by its own comment. **ESTABLISHED** (`standalone-notif-ask.tsx:243`).
- The task card's whole surface is the tap target and toggles an inline choice row; `finished_it`/`got_halfway` POST to `/api/routine/complete-task`, which inserts the completion and, via `upsert_log_and_streak`, writes the credited `daily_reports` row in the same call. **ESTABLISHED.**
- The `daily_log` event is emitted from both doors (plan card gated on `isNewLog`, log sheet) with a `surface` tag since 16 Sep. **ESTABLISHED.**
- Notification-click attribution exists (`notifications.app_opened_at`, set only with the exact notification id). **ESTABLISHED.**
- `daily_routines` is unique per (student, date); rebuilds increment `version` and only while nothing is ticked; the pre-rebuild task list is not retained (10 of 2,768 rows have version > 1). **ESTABLISHED.**
- `notification_deliveries.display_*` had never been written: 0 of 7,238 rows in 7 days, against a check constraint whose values the code does not write, with the violation in Postgres logs. **ESTABLISHED** (Section 4, Incident #104).
- The docs the mandate named as required reading — `BEHAVIORAL-TRUTH-MAP.md`, `DAY1-DAY2-BRIDGE-AUDIT.md`, `LOG-SEMANTICS-AUDIT-2026-09-22.md` — do not exist on `main` or any branch I can see. The forensic report existed only in my session's scratchpad; it is now committed as `docs/CAREERRAI_SUCCESSFUL_STUDENT_FORENSIC_REPORT.md`. The "42/70 returned next day" figure in the mandate is consistent with this report's roster (42 of 72 first→second gap = 1 day). **ESTABLISHED** that the other three documents are absent; their content was not available to me.

## 3. WHAT WE CHANGED

**Instrumentation**
- `src/lib/session-boundary.ts` (new, pure): `REENTRY_GAP_MS = 30 min`, `classifyLaunch()`, `isReentry()`, the away clock.
- `src/lib/journey.ts`: `sessionIsNew()`; `'app_resume'` registered in `EventName`.
- `src/components/journey-tracker.tsx`: `app_open` carries `launch` and `session_new`; `app_resume{hidden_ms, launch, screen}` on visible after ≥ 30 min hidden; the screen dwell clock restarts on resume.
- `src/lib/os/day-bridge.ts` (new, pure): `stateLeftBehind()`, `classifyReturn()`; parked with a stated reason in the orphan guard until a reader exists.
- `docs/DAY1-DAY2-EVENT-CONTRACT.md`: the contract (what / when / who / where / why / input / output / provenance / idempotency / version / privacy) for each signal, and the analytic definitions of session end and resume-vs-restart.
- `docs/sql/day1-day2-bridge-bootstrap.sql`: the first report's query.

**Reliability**
- `src/components/home/pace-card.tsx`: `router.refresh()` inside `useTransition` replaces the reload; the chosen date shows immediately via a local override that goes inert once the server agrees; `cr-routine-updated` dispatched so the plan card drops its 30-second cache.
- `src/lib/push-ask-snooze.ts` (new, pure) + `standalone-notif-ask.tsx`: Later is stored in `sessionStorage`; `evaluate()` skips with `report('skipped','later_snoozed')`; a re-entry (≥ 30 min hidden, same constant as the tracker) clears it.
- `data-analytics` on the Blueprint's `PlanRow` (`plan_row_*`) and on icon-only back links (`back_to_tracker`, `back_to_blueprint`) in blueprint, topics, analysis, goal and debug; `update-coverage-button.tsx` loses its manual `track('tap')` (it was a second producer, one with no `el`) in favour of `data-analytics`.

**Incident #104**
- `supabase/migrations/20260923a_display_status_vocabulary.sql`: constraint restated to `resolved | error | not_attempted`. Applied to production. Reversible (DOWN stated in the file). No rows touched.
- `src/lib/notification-endpoints.ts`: the three writes in `confirmDelivery()` read and log their `error`.
- `docs/ENGINEERING-MEMORY.md` index row 104 + full archive entry.
- PR #203 closed as superseded, with the reason on the PR.

**Guards / tests** (all new): `session-boundary.test.ts` (13), `push-ask-snooze.test.ts` (6), `os/day-bridge.test.ts` (15), `day1-day2-bridge.guard.test.ts` (19). `orphan-surfaces.guard.test.ts` gained the day-bridge entry. `docs/CODEMAP.md` gained an observability bullet.

## 4. WHY EACH CHANGE WAS AUTHORIZED

| Change | Mandate clause | Evidence that it was confirmed, not assumed |
|---|---|---|
| Session/launch/resume instrumentation | "add instrumentation … Every signal must answer a specific product question" | Phase 1 source read: no signal existed for a resident-app return; `app_open` could not tell reload from open. Questions answered: how did they come back, when did a visit end. |
| Reschedule reload | Phase 7 §1, explicitly | `window.location.reload()` at `pace-card.tsx:171`; timeline of one student: 8 reschedule taps / 6 saves in 30 min; Next 16 `use-router.md` documents `refresh()` as the state-preserving refetch. |
| Later snooze | Phase 7 §2, explicitly | `later()` comment "no persistence"; one student tapped Later 4× in 60 min, two caused by reloads, one by a 9-second resource excursion. Founder's "every open" rule preserved by tying expiry to the same re-entry boundary. |
| Task-card taps: no change | Phase 7 §3, "ONLY fix if evidence establishes friction" | Timing query on all 674 taps: 437 write ≤ 60 s, 87 same-card toggle-close, 43 backgrounded, 28 to a resource, 20 another card, 58 other taps, 1 stream end. No error follows any of them. Friction NOT ESTABLISHED. |
| Analytics labels | Phase 7 §4, explicitly | Blueprint anchors recorded as `a`; `PlanRow` labels embed counts ("146 finished view"); 39 blank-`el` taps traced to the second producer. |
| Constraint migration | "add migrations when genuinely required … fix confirmed bugs"; Phase 10 "document exactly what blocks it" — it was blocked by a constraint, which is a schema fix, not a new implementation | `pg_get_constraintdef` + Postgres error log + 0/7,238 rows. Push delivery logic untouched; only what the server accepts into a measurement column. |
| Closing PR #203 | Phase 10 | Superseded by #204/#212 on main; its migration is what caused #104. |

Nothing changed in: study-day definition, cohort definitions, credit formula, tracker landing, onboarding, log sheet, push strategy or cadence, pricing, payments, marketing, CAT content, mentor systems, security, RLS, auth.

## 5. FILES CHANGED

26 files, +2,238 / −41 (commit `5083e81`):

```
docs/CAREERRAI_SUCCESSFUL_STUDENT_FORENSIC_REPORT.md   (new, the baseline)
docs/CODEMAP.md
docs/DAY1-DAY2-EVENT-CONTRACT.md                        (new)
docs/ENGINEERING-MEMORY-ARCHIVE.md                      (Incident #104)
docs/ENGINEERING-MEMORY.md                              (index row 104)
docs/sql/day1-day2-bridge-bootstrap.sql                 (new)
src/app/student/analysis/page.tsx                       (back link label)
src/app/student/blueprint/page.tsx                      (PlanRow + back link)
src/app/student/debug/page.tsx                          (back link label)
src/app/student/goal/goal-editor.tsx                    (back link label)
src/app/student/plan/topics/page.tsx                    (back link label)
src/components/home/pace-card.tsx                       (no reload)
src/components/journey-tracker.tsx                      (launch, session_new, app_resume)
src/components/standalone-notif-ask.tsx                 (Later snooze)
src/components/update-coverage-button.tsx               (one tap producer)
src/lib/day1-day2-bridge.guard.test.ts                  (new)
src/lib/journey.ts                                      (sessionIsNew, app_resume)
src/lib/notification-endpoints.ts                       (errors logged)
src/lib/orphan-surfaces.guard.test.ts                   (day-bridge parked entry)
src/lib/os/day-bridge.test.ts                           (new)
src/lib/os/day-bridge.ts                                (new)
src/lib/push-ask-snooze.test.ts                         (new)
src/lib/push-ask-snooze.ts                              (new)
src/lib/session-boundary.test.ts                        (new)
src/lib/session-boundary.ts                             (new)
supabase/migrations/20260923a_display_status_vocabulary.sql (new)
```

## 6. DB CHANGES

One migration, `20260923a_display_status_vocabulary`:
- `DROP CONSTRAINT notification_deliveries_display_status_chk` (values `shown | failed | unknown`)
- `ADD CONSTRAINT notification_deliveries_display_status_chk CHECK (display_status IS NULL OR display_status IN ('resolved','error','not_attempted'))`
- `COMMENT ON COLUMN`.

Additive in effect (every row was NULL, valid under both), reversible (DOWN
in the file), RLS-neutral (a check constraint), no index change, no storage
growth. No table, column or index was created or dropped. No event table
was added: `app_resume` rows go into the existing `student_events` and are
bounded by real returns (one per ≥ 30-minute absence), on no retention sweep
list — the guard test fails if one is added.

Not changed: `permission_at_push` and its check (also from `20260917a`) remain
unused by any code on `main`. Documented here rather than dropped, because
dropping needs a demonstrated need and this is not one.

## 7. TEST RESULTS

| Gate | Baseline (`aa36db1`) | Mission branch (`5083e81`) |
|---|---|---|
| `npx tsc --noEmit` | exit 0 | exit 0 |
| `npx vitest run` | 490 files, 6,301 passed, 1 skipped, 48.3 s | 494 files, **6,354 passed**, 1 skipped, 50.3 s |
| `npm run lint` | — | exit 0 (23 pre-existing warnings, 0 errors) |
| `npm run build` | — | exit 0 |
| CI "typecheck · lint · unit tests" on PR #214 | — | success (2:21) |
| CI Semgrep, Gitleaks | — | success |
| CI npm audit, Trivy | failing on `main` already | failing: `next@16.2.11` (CVE-2026-75604 Windows-only; GHSA-2xp9-vwfh-vxw4 AVIF, mitigated in `next.config.ts`), `sharp@0.35.3`. **No dependency changed on this branch** (`package.json`/lock diff empty). The fix is `next ≥ 16.3.3`, which the founder said needs their word. |

The Phase 11 list, honestly:

| Item | How it was tested | Status |
|---|---|---|
| A task tick, B undo, C re-tick | Not executed against production — no student session is available to this container. Covered by existing suites (`completion-semantics.guard`, `completion-write-telemetry`, `per-device…`) and by production evidence after deploy: the tick path is untouched by this change (no file in `DailyTracker/` or `api/routine/` was modified). | **NOT EXECUTED by me; path unchanged** |
| D log submission, E zero-hour log | Same: `useLogging.ts`, `LoggingModal.tsx`, `api/logging/*` untouched. Day-bridge unit tests assert a zero-hour row is not a study day. | **path unchanged** |
| F reschedule save | Guard test pins the mechanism; `next build` compiled the component; no runtime execution. | **guarded, not driven** |
| G push ask Later | 6 unit tests on the pure module; guard test pins the wiring and that the enabled-user early return precedes it. | **guarded, not driven** |
| H session boundary, I re-entry, J resume/restart | 13 + 15 unit tests on the pure modules; production evidence of `app_open{launch, session_new}` within 33 minutes of deploy (Section 9). `app_resume` not yet observed at the time of writing. | **partly observed** |

## 8. DEPLOYMENT DETAILS

- PR #214 opened 02:35 UTC, merged (squash) 02:40 UTC after the CI gate passed; head `5083e81` → `main` `138f6e7`.
- Vercel production deployment `dpl_CzdxwGnvP3GfU6APVGSBmCc9dW4D` for `138f6e7`, state READY, created 02:42 UTC.
- Migration applied 02:29 UTC via the Supabase MCP, and the identical SQL is in `supabase/migrations/` (CODEMAP §6: both, always).
- The container's outbound proxy refuses `careerrai.in` (CONNECT 403), so production was verified through the Vercel and Supabase tools rather than curl.

## 9. PRODUCTION SMOKE TEST

| Check | Evidence | Result |
|---|---|---|
| Site serving | `web_fetch_vercel_url` of `https://careerrai.in/sw.js`: 200, the two-beacon worker, `cache-control: max-age=0, must-revalidate`. | **ESTABLISHED** |
| Runtime errors since deploy | Vercel runtime errors, 2h window: one group, `[push] send failed (status 410)` in `study-companion` at 02:30 UTC, i.e. before the deploy, a routine expired-subscription 410. No error or warning level logs in the 40 min after deploy. | **ESTABLISHED** |
| Requests since deploy | 200 × 55, 307 × 6 in the first 30 min; `/api/events/track`, `/api/routine/today`, `/api/routine/engagement`, `/student/tracker` all served. | **ESTABLISHED** |
| New telemetry fires | First student after deploy (03:15 UTC, browser tab): `app_open` with `launch=external session_new=false`, then `tap learn_it_…` → `resource_opened` → `screen_exit{reason:hidden, dwell 48 s}`. 16 rows, all well-formed. | **ESTABLISHED** |
| `app_resume` | Not yet observed (that student had been away 17 minutes at the time of writing; the threshold is 30). | **pending** |
| Display outcome after the constraint fix | 02:15–02:45 UTC: 173 deliveries, 55 receipts, **43 `displayed_at` set, `display_status = 'resolved'`**, 0 errors. First display rows in the table's history. | **ESTABLISHED** |
| Task tick / undo / daily report in production | No tick has happened since deploy at the time of writing (last completion 20:38 UTC, before deploy). Path unchanged. | **not yet observed** |
| Reschedule / push-ask Later in production | No reschedule or Later tap since deploy at the time of writing. | **not yet observed** |
| Overnight quiet | 0 `student_events` between 22:17 and 03:15 UTC. The same UTC window on 19–22 Sep had 50–138 events from 2–4 students. Below the recent nights, but from a base of two to four people; the ingest route was not called in that window (Vercel logs), so nothing was lost — nobody came. | **ESTABLISHED (nothing lost); low-N** |

One unrelated observation, checked and closed: a `daily_reports` row for
2026-09-22 with `created_at` ≈ 05:13 UTC on 23 Sep, ahead of the server
clock, belongs to `65ec366e` — the App Store review account (`is_demo`),
whose evergreen-log refresh writes dated rows by design (migration
`review_account_evergreen_logs`). Not a clock fault, and one more reason
every cohort query must exclude `is_demo`.

## 10. NEW BEHAVIOURAL SIGNALS

| Signal | Answers | Caveat |
|---|---|---|
| `app_open.session_new` | Was this a cold start or the app reloading itself? | `sessionStorage` survives tab restore; a restored tab reads as not-new. |
| `app_open.launch` | Which door: notification / channel / icon / internal / whatsapp / external / direct / unknown | A fact about URL and referrer. Not intent. Notification attribution's authority remains `notifications.app_opened_at`. |
| `app_resume{hidden_ms, launch, screen}` | The resident app came back after ≥ 30 min; how long away; which screen it was left on | Threshold chosen, not measured; re-measure from `hidden_ms` after a week. |
| `push_ask_skipped.why = later_snoozed` | The ask was suppressed by a Later in this session | New reason value; readers grouping by `why` see it. |
| `tap.el ∈ plan_row_*, back_to_*, update_coverage_on_demand` | What was tapped on the Blueprint | Replaces `a`, blank, and count-bearing labels. |
| `notification_deliveries.display_*` | Whether `showNotification()` resolved on the device | Existed since 17 Sep; writes accepted only since 02:29 UTC today. Not proof a human saw it. |

## 11. WHAT WE CAN NOW LEARN

From the bootstrap report (production, 23 Sep 02:28 UTC, genuine students, Day-1 = first real study day, return = first event on a later day within 7 days). **ESTABLISHED as counts; every comparison is a correlation.**

| | R (72, repeat) | O (150, one-time) |
|---|---|---|
| Had a plan on Day-1 | 71 | 150 |
| Tasks planned / ticked, avg | 4.7 / 2.2 | 3.9 / 1.2 |
| Left the plan unfinished | 57 (79%) | 118 (79%) |
| No tick at all on Day-1 (sheet-only day) | 16 | 57 |
| Opened a resource on Day-1 | 13 | 10 |
| Day closed by a tick (credited) | 34 | 56 |
| A hidden-exit was captured (session end inferable) | 56 | 101 |
| **Returned within 7 days** | **70 (97%)** | **74 (49%)** |
| Returned the next day | 53 | 52 |
| Median hours, last Day-1 exit → first return | 13.6 | 18.6 |
| Return attributable to a notification click | 7 | 3 |
| Return on an installed surface | 62 / 70 | 60 / 74 |
| Day-2 plan carried a Day-1 unfinished topic | 22 / 70 | 24 / 74 |
| A plan existed on the return day | 68 / 70 | 62 / 74 |
| **A: resumed the unfinished topic** | **3** | 0 (by definition) |
| B: continued a Day-1 topic | 5 | 0 |
| C: started a new task | 31 | 0 |
| D: browsed a study surface, no action | 21 | **57** |
| E: log sheet only | 9 | 10 |
| F: other surface only | 1 | 7 |
| G: never came back | 2 | **76** |
| Studied on the return day | 47 / 70 | 0 (by definition) |
| Error on Day-1 / Day-2 | 2 / 2 | 2 / 1 |

What this says, and only this:

1. **Repeat students do not resume; they start the new day.** 22 were offered yesterday's unfinished topic and 3 took it. The postponed-topic bonus in the planner is not the mechanism that brings them back or that they act on first. **ESTABLISHED (correlation, n=70).**
2. **Both cohorts leave Day-1 unfinished at the same rate (79%).** Unfinished work is not what separates them. **ESTABLISHED.**
3. **The divergence is the return itself, and then the first action on it.** Half of O never open the app again; of the half who do, 77% open a study surface and do nothing, against 30% of R. **ESTABLISHED.** Why: **WE DO NOT KNOW.**
4. **12 of 74 O returners had no plan generated on their return day** (vs 2 of 70 R). A plan is generated when `/api/routine/today` runs, i.e. when the tracker loads. Those 12 came back to something other than the tracker. **INFERRED; worth a query.**
5. Notification-attributed returns are 10% of R's returns and 4% of O's. **ESTABLISHED as attribution; nothing causal.**

From today's signals, after a week, the same report can add: the door for
every return (not only notification), the hidden-time distribution, and
whether a resident-app reopen behaves like a cold start.

## 12. WHAT WE STILL CANNOT LEARN

- Whether any student studied. Hours are credited or typed; nothing measures time. **NOT ESTABLISHED, by design of the data.**
- Why 76 one-time students never returned. No error, no failed request, no distinguishing event precedes the exit.
- Anything after `resource_opened` — the link leaves the app.
- The task list a student saw when a plan was rebuilt before their first tick (the pre-rebuild version is overwritten; rare).
- Whether 30 minutes is the right re-entry threshold — it can be re-measured from `app_resume.hidden_ms` once a week of it exists.
- Whether the display outcome's `resolved` was seen by a human. Only a click proves that.
- Whether the reschedule loop was a save that "did not stick" or a reload that hid a successful save; the reload is gone either way, and reschedule taps per student per day is the number to watch.

## 13. WHAT WE SHOULD WATCH

Daily for the next week, each one query:

| Watch | Query shape | Expect | Escalate if |
|---|---|---|---|
| `app_resume` volume and `hidden_ms` distribution | `student_events where event='app_resume'` | tens per day, hidden_ms median in hours | 0 after 48 h (signal broken), or thousands (threshold wrong) |
| `app_open.session_new` share | group by `props->>'session_new'` | most opens true; false = reloads/redirects/restores | false > 60% (something reloads more than expected) |
| `launch` mix | group by `props->>'launch'` | icon-dominant for installed, external/direct for tabs | `unknown` > 10% |
| Reschedule taps per student per day | `tap.el='reschedule'` | should fall from ~6/day | unchanged after a week |
| `push_ask_later` per student per session | count / distinct (user, session_id) | ≈ 1 | > 2 (snooze not holding) |
| `push_ask_skipped.why='later_snoozed'` | count | present | absent while Later taps exist |
| Display outcome fill rate | `displayed_at` / `sw_receipt_at` on new deliveries | high on healthy devices | back to 0 (constraint drift; guard would also fail) |
| Refused-write log lines | Vercel runtime logs, query `refused` | none | any |
| `completion_write` non-200 share | props.status | ≈ 2.5% as before | rising |

## 14. WHAT WE SHOULD NOT TOUCH

Unchanged from the forensic report, now with the bridge report behind it:

- The tick → credit → log path and the credited-hours formula.
- The tracker as landing screen and the task card as the first thing on it.
- The study-day definition (`study_duration > 0`) and the cohort definitions.
- The log sheet's optional fields; zero-hour rows.
- Push strategy, cadence and the ask's copy — only its repetition changed. With display now measured, the next push decision can wait for a week of `display_status`.
- The postponed-topic carry-forward: not because it works (3 of 22 took it) but because nothing yet says what should replace it. Removing a mechanism on one week's correlation would be the redesign-before-mechanism the rules forbid.

## 15. ROLLBACK PLAN

- **Code:** `git revert 138f6e7` on `main`; Vercel redeploys. The previous production deployment `dpl_GBVigPuvo5R1r37Tx9GVFwghQwBB` (`aa36db1`) is a rollback candidate in Vercel and can be promoted directly.
- **Migration:** independent of the code revert. Leave it — it makes writes that `main` has been attempting since 17 Sep succeed. Only if the display-writing code from #204 is itself reverted should the DOWN in `20260923a` be run.
- **Data:** nothing to undo. No rows were modified or deleted; new event rows are additive.
- **Docs:** revert with the code or leave; they describe the state as of this commit.

## 16. NEXT EVIDENCE DECISION

OBSERVATION → MECHANISM HYPOTHESIS → EVIDENCE → PRODUCT INTERVENTION → EXPECTED BEHAVIOUR → TEST → RESULT → KEEP / REJECT

1. **Observation:** repeat students start the new day's task rather than resume yesterday's (3 of 22 offered). **Hypothesis:** the plan card's first task, not continuity, is what a returning student acts on. **Evidence needed:** one week of `app_resume`/`app_open{launch}` joined to first Day-2 action, and the position of the first-ticked task in plan order (available now from `daily_routines` + completions). **Intervention:** none yet. **Decision rule:** if the first tick is the first card in ≥ 70% of returns, the mechanism is "the top card"; then and only then is a test of what sits in that slot justified.
2. **Observation:** 77% of one-time returners open a study surface and do nothing. **Hypothesis:** cannot be formed honestly from the data. **Evidence:** talk to five of them. **Intervention:** none.
3. **Observation:** 12 of 74 one-time returners had no plan on their return day. **Evidence needed:** their return-day paths (NEEDS QUERY). **Decision rule:** if they returned via a notification deep link to a non-tracker route, that is a routing question, not a plan question.
4. **Observation:** display outcomes now record. **Evidence needed:** a week. **Decision rule:** the push strategy conversation reopens with `displayed_at / sw_receipt_at` per platform in hand, not before.
5. **Observation:** the 30-minute re-entry threshold is chosen. **Evidence needed:** the `hidden_ms` distribution. **Decision rule:** if the distribution is bimodal with a gap, move the constant to the gap; if not, leave it.

If, after that week, the honest answer to "why do they come back" is still "we do not know", that is the result to report.

---

Out of scope, documented, not fixed: the `next@16.2.11` / `sharp@0.35.3`
CVEs failing npm audit and Trivy on every push (needs the founder's word on
the upgrade); `permission_at_push` column unused by any code; the
`daily_reports.created_at` clock observation above; the three mandate
documents that do not exist in the repository.
