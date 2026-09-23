# Day-1 → Day-2 Event Contract

Written 22 Sep 2026 during the autonomous Day-1 → Day-2 mission
(`docs/CAREERRAI_DAY1_DAY2_AUTONOMOUS_MISSION.md`). Evidence baseline:
`docs/CAREERRAI_SUCCESSFUL_STUDENT_FORENSIC_REPORT.md`.

The product question this contract exists to answer:

> A student records a real study day. What state did CareerRai leave them in,
> how did they come back, did they resume or restart, and did they study again?

Every claim below is tagged ESTABLISHED (read from source or measured),
INFERRED, or NOT ESTABLISHED.

---

## 1. The lifecycle as the code actually implements it

```
SESSION START      first event carrying a NEW session_id (sessionStorage `cr_sid`,
                   minted lazily by lib/journey.ts getSessionId; dies when the tab
                   or app process is closed)                          ESTABLISHED
  → app_open       fires on EVERY root-layout mount (components/journey-tracker.tsx),
                   i.e. every full document load — including the app's own
                   reloads. Before 22 Sep it could not tell a cold start from a
                   reload.                                            ESTABLISHED
STUDENT ACTIONS    tap (autocapture, lib/autocapture.ts) · screen_view/screen_exit
                   · explicit events (log_open, daily_log, completion_write,
                   resource_opened, push_ask_*, …)                    ESTABLISHED
STUDY WORK         NOT OBSERVABLE. Study happens outside the app (median active
                   time on a study day is ~100 s; resource links leave the app).
                   The only evidence of study is the ledger entry:
                   daily_reports.study_duration > 0, itself a credit (task tick)
                   or a typed number.                                 ESTABLISHED
                   (the limit) / NOT ESTABLISHED (any study time)
SESSION END        No explicit end exists in the product. There is no "I'm done"
                   action; close_day rides on every tick and is not a session
                   signal.                                            ESTABLISHED
                   INFERRED end = screen_exit{reason:'hidden', dwell_ms} written
                   on visibilitychange→hidden and beacon-flushed, when no further
                   event follows in the same session_id within REENTRY_GAP_MS.
                   A tab closed with no hidden transition leaves only the last
                   event (kind 'inferred_last_event').
STATE LEFT BEHIND  Reconstructible from immutable-by-then state, not stored twice:
                   daily_routines(student, date) — UNIQUE, rebuilt only while
                   nothing is ticked (CODEMAP invariant 4; `version` increments;
                   the pre-tick version is NOT retained — limitation);
                   routine_task_completions (timestamped, deleted on undo);
                   daily_reports (created_at = the moment the day was first
                   credited); resource_opened{taskId, topic}; log_open.
                   lib/os/day-bridge.ts stateLeftBehind() is the one derivation.
                                                                       ESTABLISHED
RE-ENTRY           Before 22 Sep: only a cold start produced an app_open, and it
                   carried no door. A resident PWA reopened by visibilitychange
                   produced NOTHING.                                  ESTABLISHED
                   After: app_open{session_new, launch} and app_resume{hidden_ms,
                   launch} (below).
RESUME OR RESTART  Derived, never asserted: lib/os/day-bridge.ts classifyReturn()
                   compares the Day-1 state (unfinished topics, next task offered)
                   with the first meaningful Day-2 action.            ESTABLISHED
                   (the derivation) / the label is INFERRED per student
NEXT STUDY SESSION daily_reports.study_duration > 0 on a later date. ESTABLISHED
```

---

## 2. The contract

### 2.1 `app_open` (existing name, two new props)

| | |
|---|---|
| WHAT | `app_open` with `session_new: boolean`, `launch: LaunchRoute` |
| WHEN | JourneyTracker mount, i.e. each full document load (unchanged) |
| WHO | the signed-in student (server resolves `user_id`; pre-auth rows keep `anon_id`) |
| WHERE | any route; `path` column as before |
| WHY | `session_new` separates "the student opened the app" from "the app reloaded itself"; `launch` says which door |
| INPUT | previous state: none (a load) |
| OUTPUT | a session is open; if `session_new`, SESSION START |
| PROVENANCE | client event |
| IDEMPOTENCY | one per document load; a reload writes another row with `session_new: false` |
| VERSION | props are additive; readers treat a missing `session_new` as "pre-22 Sep, unknown" |
| PRIVACY | `referrer` was already sent verbatim; `launch` is a 1-word classification of it. Nothing new about the person. |

`LaunchRoute` (lib/session-boundary.ts, pure, tested):
`notification` (?src_notif or SW message) · `channel` (?src=) · `icon` (installed
surface, no referrer) · `internal` (same-origin referrer: redirect/reload) ·
`whatsapp` · `external` · `direct` (browser tab, no referrer) · `unknown`.

A door is a fact about the URL and referrer. It is NOT intent and NOT a cause.

### 2.2 `app_resume` (new name)

| | |
|---|---|
| WHAT | `app_resume` with `hidden_ms: number`, `launch: LaunchRoute`, `screen: string` |
| WHEN | `visibilitychange` → visible, when the document was hidden for ≥ `REENTRY_GAP_MS` (30 min) |
| WHO | the signed-in student |
| WHERE | whatever screen was on top when the app was backgrounded |
| WHY | a resident PWA is reopened without a remount; this is the only signal that a return happened |
| INPUT | previous state: hidden (a `screen_exit{reason:'hidden'}` was written) |
| OUTPUT | the session continues; the screen's dwell clock restarts |
| PROVENANCE | client event |
| IDEMPOTENCY | one per visible transition; a shorter absence writes nothing |
| VERSION | new event, registered in `EventName`; retention default KEEP (not on any sweep list; guard test) |
| PRIVACY | nothing about the person |

Why 30 minutes: it is the inactivity cap the forensic dwell analysis already
used, so "session" means one thing in the data and in the product. It is
chosen, not measured — there was no visible-transition data to measure it
from. Re-measure once `app_resume.hidden_ms` exists. (NOT ESTABLISHED as the
right number; ESTABLISHED as a consistent one.)

### 2.3 Session end — no new event

Defined analytically, not emitted, because the honest signal already exists:

- `inferred_hidden`: the last `screen_exit{reason:'hidden'}` in a session_id with no later event in that session within `REENTRY_GAP_MS`.
- `inferred_last_event`: the session's last row when no hidden exit was captured.
- `explicit`: does not exist in the product. Not invented.

### 2.4 State left behind — no new event, one derivation

`lib/os/day-bridge.ts stateLeftBehind()` reads, for (student, date): the
plan's tasks, completions (with `portionOf(confidence)` for half ticks),
the report row, resource opens, log opens, and the session end. It returns
the minimum normalised state: planned/done/half/remaining, last completed
task, the next task the card was offering (first unticked in plan order —
the same rule TodaysRoutineCard renders), whether unfinished work exists,
whether a resource was opened, how the day was recorded (tick / sheet /
both / none), and the continuation path.

Not stored a second time: the inputs are already the durable record.
Limitation (ESTABLISHED): a plan rebuilt before the first tick overwrites
`daily_routines.tasks`; the version the student saw before a rebuild is
lost. Rebuilds are rare (10 of 2,768 routines have version > 1).

### 2.5 Re-entry route — existing attribution reused

- Notification: `notifications.app_opened_at` (set only by `/api/push/app-open` with the exact notification id) — ESTABLISHED, unchanged. `launch:'notification'` on `app_open`/`app_resume` is the client-side echo of the same signal; for a warm resume the SW message can arrive after the visible event, so the join to `app_opened_at` (±60 s) is the authority, not the prop.
- Channel link: `channel_referred` — unchanged.
- Icon / direct / whatsapp / external / internal: new, from `launch`.

### 2.6 Resume vs restart — derived

`classifyReturn()` in lib/os/day-bridge.ts. Categories, in priority order:

| Kind | Rule |
|---|---|
| `G_abandoned` | no event on any later day inside the window |
| `A_resumed_unfinished` | first Day-2 tick is on a topic that was planned and NOT finished on Day-1 (the planner carries it forward as a postponed topic) |
| `B_continued_plan` | first Day-2 tick is on a topic that was on Day-1's plan |
| `C_started_new_task` | first Day-2 tick is on a topic not on Day-1's plan |
| `E_log_only` | the only study surface touched was the log sheet |
| `D_browsed_no_action` | opened the tracker/plan surfaces, no tick, no log |
| `F_other_surface` | never reached a study surface (buddy, community, profile, analysis…) |

"Resume" therefore requires a defensible relationship between Day-1 state and
Day-2 action — the topic — never merely "the same screen opened".

---

## 3. What this deliberately does not add

- No heartbeat, no per-second telemetry, no UI snapshots.
- No `session_end` event: the inferred signal exists; an explicit one would be invented.
- No `state_left_behind` event: the state is derivable from durable rows; storing it again duplicates data (Phase 13).
- No causal claim anywhere. A `launch:'notification'` followed by a tick is a sequence, not an effect.

## 4. Retention and growth

`app_resume` is at most a few rows per student per day (one per ≥30-minute
absence). At 1,200 students today that is tens of rows a day; at 100,000 it
is bounded by real returns, not by activity. It is on no sweep list; the
guard test fails if it is ever added to one without a reader review.
