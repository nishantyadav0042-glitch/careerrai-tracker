# Continuation measurement — state machine specification

22 Sep 2026. **Specification only. Nothing is built.** No code change, no
migration, no instrumentation, no deploy. Read-only analysis produced the
constants; every one is cited.

## Why this exists

Three layers were worked through and closed:

| layer | conclusion |
|---|---|
| **1 — Logging** | Not the core problem. The onboarding practice hypothesis was tested and rejected. |
| **2 — First study** | A first **kept** task interaction is strongly associated with entering real study (40.4% vs 10.8%, p<0.001, forward test). It does **not** explain repeat behaviour. |
| **3 — Continuation** | The critical transition is Day 1 → Day 2, **usually inside 24 h** (60% of repeat learners), and **current instrumentation cannot observe the mechanism.** |

This document turns that opacity into a measurement specification. Per the
founder's instruction: **define exactly what counts as each state before writing
a single event.**

---

## 1. The state machine

```
  WORKING ──► SESSION_ENDED ──► [STATE_LEFT_BEHIND] ──► REENTRY ──► [RESUME | RESTART] ──► NEXT_STUDY
```

Two layers, and they are not equal:

| layer | states | purpose |
|---|---|---|
| **MUST-HAVE** | `SESSION_ENDED`, `RESUME \| RESTART` | establish **the transition itself** |
| **CONTEXT** | `STATE_LEFT_BEHIND`, `REENTRY` | explain **the environment around it** |

Build order follows that split. The must-have pair answers *did continuation
happen and what form did it take*; without it the context signals describe an
environment around a transition we cannot see.

---

## 2. State definitions

### 2.1 `WORKING` — a session

**Definition.** A maximal run of that student's events with **no internal gap
greater than 30 minutes**.

**Why 30 minutes — measured, not chosen.** Inter-event gaps over the last
30 days (46,652 gaps, real students):

| gap | share |
|---|---|
| ≤ 5 min | **95.3%** |
| 5–15 min | 0.76% |
| 15–30 min | 0.42% |
| 30–60 min | 0.40% |
| > 60 min | **3.11%** |

The distribution is sharply bimodal with a genuine trough: **only 1.2% of gaps
fall anywhere in the 5–30 minute window.** Moving the boundary anywhere between
15 and 60 minutes reclassifies **under 0.9%** of gaps. The definition is
therefore **insensitive to the exact threshold**, which is the property that
makes an arbitrary constant safe.

**Day attribution.** A session belongs to the study day (05:30–05:29 IST,
`src/lib/study-day.ts:33`) **of its first event**, so a session crossing 05:30
is not split.

**Backfillable:** yes, retroactively from `student_events`, back to 15 Jul.

### 2.2 `SESSION_ENDED` — MUST-HAVE

**Definition.** The close of a `WORKING` run, carrying **the last
student-initiated action**, not merely the last event.

**The distinction is the whole point.** For **31.4% of repeat learners** the
last event on their first study day is a system impression or nothing at all
(15 of 70 an impression, 7 of 70 absent). *"Last event"* is not *"last act"*.

**This requires a maintained partition of the event vocabulary** into:

- **ACT** — the student did something (`completion_write`, `log_open`,
  `daily_log`, `checkin_answered`, `resource_opened`, `timetable_saved`, …)
- **IMPRESSION** — the product showed something (`shield_intro_shown`,
  `top_pick_shown`, `checkin_shown`, `first_log_prompt`,
  `push_setup_guidance_shown`, `plan_snapshot_shown`, …)
- **AMBIENT** — neither (`screen_view`, `app_open`, `session_forensics`,
  `storage_persistence`, …)

**Rule: this partition lives in exactly one module and every new event must be
classified there before it ships.** An unclassified event defaults to AMBIENT
and must never be reported as a student action.

**The hard constraint — a client beacon is not sufficient.** The case we most
need is a student leaving abruptly, which is exactly the case where a beacon
does not fire. `SESSION_ENDED` must therefore be **derived server-side** from
event silence, with any client beacon as an enrichment, never as the source of
truth. **A client-only implementation would systematically lose the population
of interest.**

**Backfillable:** partly. The boundary yes; the last-act classification yes for
classified events; the pre-8-Aug era has no `screen_exit` at all.

### 2.3 `STATE_LEFT_BEHIND` — CONTEXT

**Definition.** What the product was offering when the session ended: the plan
as it then stood, which tasks were untouched, and what the next-action surface
was proposing.

**Not inferable today.** No event records what the screen was proposing.

**A warning carried from the bridge audit:** do **not** derive this from
`daily_routines`. Those rows are created **lazily** by `/api/routine/today`
when the tracker is served, so their existence measures *a visit*, not *a state
the product held*. "A plan existed the next day" reads 99% vs 91% between repeat
and one-time learners and is **circular** — it is a return proxy, and returning
is close to the definition of the cohort. It was withdrawn from the audit for
this reason and must not re-enter here.

### 2.4 `REENTRY` — CONTEXT

**Definition.** The opening of the next session, attributed to a route: direct
open · notification · link · install.

**Not inferable today.** `notifications.received_at` proves a device
acknowledged a push. It does not prove display, attention, or causation of a
return. The observed 54% vs 34% device-confirmed delivery between repeat and
one-time learners is **confounded by installation and permission** and is
recorded as correlation only.

**Attribution needs a rule, not a guess.** A defensible one: a notification
whose click beacon precedes the session open by less than a defined window;
otherwise `direct`. **The window is a decision (see §4), not a constant to pick
in code.**

### 2.5 `RESUME | RESTART` — MUST-HAVE, and the hardest

**Definition.** Whether the next session continued the prior session's work or
began fresh.

**This cannot be defined on `task_id`, and that is a finding.** Routine task ids
are **recurring slot names** — `qa-priority`, `varc-set`, `revision-block`,
`exam-mock` (`src/lib/routine-engine.ts:721-863`) — regenerated every day. Day
2's `qa-priority` is structurally a *new instance of the same slot*, not the
continuation of Day 1's work. Matching on `task_id` would report resume for
essentially everyone and mean nothing.

**And the completion record cannot supply the alternative.**
`routine_task_completions` stores `(student_id, routine_date, task_id,
completed_at, is_emergency, confidence, actual_minutes)` — **no topic, no
section.** The topic lives only inside the `daily_routines.tasks` JSON for that
date.

> **Therefore `RESUME | RESTART` requires a continuity unit that survives into
> the completion record — the topic, not the slot.** This is the single most
> consequential requirement in this document, and it is a **schema** question,
> not an event question.

**Backfillable:** only by joining completions back to the plan JSON by
`(task_id, routine_date)`. Feasible to test the definition retroactively;
**not** a substitute for carrying it forward.

### 2.6 `NEXT_STUDY`

**Definition.** Unchanged and already sound: a `daily_reports` row with
`study_duration > 0` on a later study day. **It remains self-report** (Truth Map
§4) and no part of this specification changes that.

---

## 3. What each state makes answerable

| state | question it closes | today |
|---|---|---|
| `SESSION_ENDED` | What did the student last actually *do*? | unknown for 31.4% of repeat learners |
| `RESUME \| RESTART` | Is the second day a continuation or a second first day? | undefinable — no continuity unit |
| `STATE_LEFT_BEHIND` | Did they leave with an obvious next step? | no record of what was offered |
| `REENTRY` | Did we bring them back, or did they come back? | delivery ≠ causation |

Together they close the loop the operating model needs:
`session started → meaningful work → session ended → next-action state →
re-entry → next study session`.

---

## 4. Decisions required before any event is written

These are **founder decisions**, not implementation details. Each changes what
the data means.

1. **Session gap: 30 minutes?** Measured as safe anywhere in 15–60 (§2.1).
   Confirm or set it, once, in one place.
2. **The ACT / IMPRESSION / AMBIENT partition.** Who owns it, and the rule that
   a new event cannot ship unclassified.
3. **The continuity unit for RESUME.** Topic is the proposal. Section is
   coarser and cheaper; a per-instance task id is finer and a bigger change.
4. **The notification attribution window** for `REENTRY`.
5. **Whether "unfinished work" counts untouched tasks, unspent planned minutes,
   or both.**
6. **Build order.** The must-have pair first is the recommendation; building all
   four at once was explicitly warned against.

---

## 5. What this specification excludes

- **No product change.** Nothing here says the bridge is broken — only that it
  is unobserved.
- **No general instrumentation.** The three Truth Map §9 gaps serve *entry*;
  these four serve *continuation*. They are separate decisions and should not be
  bundled.
- **No claim that notifications drive the second day.**
- **No new definition of study.** `study_duration > 0` stays as it is, with its
  self-report limit intact.

---

## 6. The standing constraint

Every state above must satisfy the provenance standard
(`docs/BEHAVIORAL-TRUTH-MAP.md` §12):

> UI → event → server action → DB state → **and what that state does not prove.**

Three failures in one day produced this rule: a query on an event name that is
never emitted; a current-state table read as history; and a self-report read as
reality. **A state that cannot traverse the chain does not ship as a state — it
ships as NOT ESTABLISHED.**
