# CareerRai Learning OS — Constitution

> **Status:** binding architecture document. Changes rarely (think Linux kernel
> principles). Every study-plan feature — the Blueprint, the daily plan, the
> Coverage grid, pace, revision, forecasts, insights — must obey this. Any AI
> agent (Claude, Fable, Codex, Cursor) reads this **before** writing a line of
> learning, planning, or coverage code. If a change violates this document, the
> change is wrong, not the document — escalate to the founder instead of
> shipping the violation.
>
> This is the **Constitution** (what the Learning OS is). It sits alongside the
> Notification OS (`docs/NOTIFICATION-OS.md`): that OS decides *when to reach* a
> student, this one decides *what they should study and why.*

---

## 0. The one KPI

A student's **coverage of the high-weightage syllabus, converging toward
exam-ready by their own finish date.**

Not topics touched. Not hours logged. Not streak length. The truest north-star is
whether the topics where CAT marks actually live — Reading Comprehension,
Arithmetic, Algebra, Arrangements, DI — are moving from `not_started` toward
`exam_ready` *fast enough to land before this student's chosen date.* CAT is a
weightage game: a student who "finished 40 topics" but left Percentages and RC
untouched has not moved their score. Every engine below optimizes this and
nothing else. When two goals conflict, marks-per-remaining-day wins over novelty,
over topic count, over a tidy-looking grid.

---

## 1. Founder philosophy — why the plan exists

- The plan is a **preparation operating system**, not a to-do list. Its job is to
  make the next decision — "what do I study now, and why" — so obvious that a
  student never again wastes prep time deciding. *"Very few students know what to
  study NEXT. These 90 seconds solve that."* (`blueprint-builder.ts`).
- Success is **better decisions + sustainable confidence**, not maximal activity.
  A red flag is always paired with one shrunken next step, never guilt
  (`daily-insight.ts`). "Do 20 focused minutes" beats "do more."
- Three forces shape every recommendation, always all three at once:
  **reality** (the student's own Coverage grid and logged history), **destination**
  (their finish date, the exam date, and topic weightage), and **weakness**
  (weak section, unmet prerequisites, revision going overdue, sections being
  avoided). No engine reads only one force.
- Memory is **prescriptive, not decorative.** "You struggled with Remainders 9
  days ago and haven't returned" exists to *change tomorrow's plan*, never to
  score the student.
- **Every number reads off the same engine.** There is no per-page math. Hours,
  dates, "% complete," week plans, and finish projections all derive from ONE
  per-topic model (`study-pace.ts` + `TOPIC_METADATA`). A page that computes its
  own version of a number the engine already owns is a bug.

---

## 2. Non-negotiables (the hard lines)

1. **53 canonical grid rows.** 46 exam topics (VARC 9 · DILR 9 · QA 28) + 7 habit
   units (Mock Preparation 4 · Reading Habit 3). This is `KNOWLEDGE_GRAPH` in
   `src/lib/topics-constants.ts` and nowhere else. No engine invents a topic, and
   no page hardcodes a topic name or ordering — read from the graph. Adding nodes
   makes every engine noisier; the cap is deliberate.
2. **Weightage drives priority.** In every selector, weightage is the *primary*
   driver (`weightagePoints = weightage × 8`, range 8–40 in `topic-selector.ts`).
   A high-scoring area must beat a low-yield one unless revision-due or an unmet
   prerequisite says otherwise. The 16 Jul recalibration exists precisely because
   novelty once outranked marks and a student got PNC when Algebra was due.
3. **Revision season, from 1 September of the exam year.** Overdue revision of
   HIGH-weightage topics outranks starting new material
   (`revisionSeason` in `topic-selector.ts`, gated in `api/routine/today`). This
   mirrors how toppers actually prep: syllabus + mocks through August, then
   September onward the marks come from revising what you know, weightage first.
4. **Labels never contradict the data.** "Finished" means a genuine study pass
   (`practicing`/`revising`/`exam_ready`) — `learning` is "started, not finished"
   and is counted as still-to-do (`api/blueprint/route.ts`). A student who tapped
   through onboarding must never land on "46/46 · Syllabus done."
5. **`exam_ready` is earned, never self-declared.** A student may declare up to
   `revising`; `exam_ready` (🟢) is granted only by `applyConfidenceSignal` from a
   green confidence tap on an already-`revising` topic. No self-report option
   reaches it.
6. **No invented statistics.** Every number in every sentence comes from the
   student's own rows (`daily-insight.ts`, the prescriptive line, Instant
   Insight). Rules detect; a model may one day *phrase* — it may never fabricate a
   fact, a percentile, or a "planned mocks" target that was never set.
7. **`TOPIC_METADATA` numbers are content, not measurement.** Weightage,
   estimatedHours, revisionFrequencyDays are a defensible first-pass ranking a
   subject-matter reviewer refines — treat them as editable content, never as
   cited fact or study output.

---

## 3. The coverage & topic model

Every unit carries a student-owned status, stored one row per topic in
**`topic_coverage`** (`topic`, `status`, `updated_at`, `is_priority`):

| Status | Glyph | Meaning | Who sets it |
|---|---|---|---|
| `not_started` | ⚪ | Haven't started | student (Blueprint) |
| `learning` | 🟡 | Learning concepts — begun, not finished | student |
| `practicing` | 🔵 | Practicing questions | student |
| `revising` | 🟠 | Revision started | student |
| `exam_ready` | 🟢 | Earned exam-readiness | **system only** |

"Revision **DUE**" is **derived, never stored** — a `practicing`/`revising`/
`exam_ready` topic past its `revisionFrequencyDays × archetypeMultiplier`
(`prep-memory.ts :: revisionOverdue`, `revisionDueStats`). `null` (no row) is
distinct from `not_started` (an explicit self-report); engines default an
unmapped topic to `not_started` so nothing is silently treated as done.

**Per-topic content** lives in `TOPIC_METADATA`: `weightage` (1–5, within its
section), `estimatedHours` (RC 30h, Odd-One-Out 8h — never one flat number),
`revisionFrequencyDays`, `sequenceRank`, and a real `prerequisites` edge list.
`qaCluster()` maps QA topics to Arithmetic/Algebra/Geometry/Modern Math/Number
System with their published mark-shares.

---

## 4. The Topic Selector — one topic per section, per student, per day

`chooseTopicForSection` (`src/lib/topic-selector.ts`) answers "which topic in
this section, for THIS student, today." Same additive-score architecture as every
other engine in the codebase: **every input adds points, the highest score wins,
and the winning score's contributors ARE the explanation** — never a rule tree,
never a black box.

| Signal | Weight | Force |
|---|---|---|
| Weightage (primary) | `× 8` → 8–40 | destination |
| Coverage status | `learning` 30 → `exam_ready` 2 | reality |
| Revision overdue | `overdue × 3` (`× 6` in season, +15 if heavy) | weakness |
| Sequence nudge | mild, earlier-first | destination |
| Unmet prerequisite | **−18** (deprioritize, never exclude) | weakness |
| Self-reported weak topic | +12 | weakness |
| Student priority (starred, max 5) | +25 | reality |
| "Start with" cluster | +22 | reality |
| Postponed from a swap | +40 (never lost, always returns) | reality |

Philosophy encoded in the points: **finish what you started** (`learning` leads),
then untouched topics surface *by weightage*; strong topics mostly return via
revision-due, not raw coverage. Student choices steer but never break sequencing —
a starred topic still yields to an unmet prerequisite. DB wiring lives in
`api/routine/today :: buildTopicChoices` (one topic each for VARC/DILR/QA).

---

## 5. The pace & hours engine — one model, every conversion

`src/lib/study-pace.ts` is the single source of truth for "hours of syllabus
left." `remainingSyllabusHours` iterates **all** topics, scaling each topic's
`estimatedHours` by `REMAINING_FRACTION[status]` (`not_started` 1.0 →
`exam_ready` 0.05). Catch-up and roll-over both fall out of ONE recomputation, no
ledger:

```
requiredPerDay = (remainingHours + mockHours) / daysLeft
```

Miss days → `remainingHours` unchanged while `daysLeft` shrinks → the number
rises (the honest "+1.5h catch-up"). Study ahead → it falls below committed pace
(the roll-over buffer). `computeRequiredPace` returns `ahead`/`on_pace`/`behind`/
`unrealistic`/`done` and never hides a bad number — it pairs it with a lever.

**The consistency rule (the "3.8h promised / 6.6h demanded" fix):** the
Blueprint's finish-date chooser and the Home pace ring derive per-unit hours from
the *same* curated model (`blueprint-builder.ts :: remainingPrepHours` calls into
`study-pace`). The old flat 5h/3h/1.5h buckets summed to 230h while the ring
computed 397h; the two can never drift again because there is now one model.

---

## 6. Key components map (concern → real file / table)

| Concern | File / table |
|---|---|
| Canonical taxonomy (53 rows) + metadata | `src/lib/topics-constants.ts` (`KNOWLEDGE_GRAPH`, `TOPIC_METADATA`) |
| Coverage state | table `topic_coverage` |
| Topic selection (score = explanation) | `src/lib/topic-selector.ts`; wiring `api/routine/today`, `src/lib/routine-plan.ts` |
| Earning `exam_ready` from confidence | `topic-selector.ts :: applyConfidenceSignal` |
| Hours / pace / catch-up / mock budget | `src/lib/study-pace.ts` |
| 7-day forward plan (bin-packed) | `src/lib/study-forecast.ts :: buildWeekPlan` |
| Onboarding Blueprint (3 sections) | `src/lib/blueprint-builder.ts`; UI `src/app/start/**` |
| Finish-date projection + 5-phase roadmap | `src/lib/study-plan.ts` |
| Preparation Memory (windows, health, topic memory) | `src/lib/prep-memory.ts`, `src/lib/prep-memory-data.ts` |
| My CAT Plan page (read-only aggregate) | `src/app/api/blueprint/route.ts`, `src/app/student/blueprint/page.tsx` |
| Daily log → streak (atomic RPC) | `src/app/api/logging/log-daily/route.ts`; tables `daily_reports`, `streak_data` |
| Task completion history | tables `daily_routines`, `routine_task_completions` |
| Mock evidence | `api/logging/mock-debrief`; table `mock_debriefs` |
| Daily one-liner insight | `src/lib/daily-insight.ts` (Home + `api/cron/daily-insight`) |
| Instant Insight (pre-account WOW) | `src/app/start/screens/screen-instant-insight.tsx` |

---

## 7. Preparation Memory — "did I / when did I," and what it means

`prep-memory-data.ts` is the single entry point shared by `api/blueprint` and the
Home tracker so both read the *identical* join and window logic:

- **`computePrepMemory`** — rolling windows (last 7 / 30, prior week, week 1) over
  `routine_task_completions` joined back to their `daily_routines` task shapes;
  emits `prepMemory`, `weeklyEvolution`, `healthScore`, `studentState`, `signals`,
  and `revisionDueCount`. Window length adapts to signup age.
- **`computeTopicMemory`** — the "first studied 54 days ago" answer, over the
  student's **full** history (a deliberately separate query — it must look further
  back than the 30-day health window ever does). Emits `firstTouchedDaysAgo`,
  `lastTouchedDaysAgo`, `revisionOverdue` per topic.

Revision cadence uses one `archetypeRevisionMultiplier` (a repeater's cycle
tightens, a working professional's loosens) applied everywhere — the Selector,
Topic Memory, and revision-due stats all read the same coefficient, never a
per-engine rule.

---

## 8. Daily insight & prescriptive memory (rules detect; no model in the loop)

Two rules engines turn the same rows into one earned sentence:

- **Daily insight** (`daily-insight.ts`) — one specific, data-earned line per
  student per day, priority order: recovery praise → avoidance pattern →
  high-weightage untouched → revision overdue → consistency praise → progress
  fallback. Momentum first; red flags always paired with a shrunken step.
- **The prescriptive line** (`log-daily :: computePrescriptiveLine`) — a 6-rule
  Evidence Engine that fires at most one line per log: first-ever → emotional flag
  → consistency gap → section avoidance → no-mock-in-7-days → single-section
  tunnel vision.
- **Instant Insight** (`screen-instant-insight.tsx`) — the pre-account WOW moment
  seconds after a student declares coverage. The killer math: total mark-weight of
  *untouched high-weightage* topics in their weakest section vs the weight of what
  they've *finished* there. When the untouched pile outweighs the finished pile,
  say exactly that — verifiable, personal, usually a shock. Then the hook: "one
  insight like this every evening — in the app."

Every sentence, every engine: numbers come from the student's own rows only.

---

## 9. Adaptive scheduling & recommendations — Live vs Planned

| Capability | Status | Notes |
|---|---|---|
| Per-student topic selection (weightage + coverage + prereq + revision) | **Live** | `topic-selector.ts`, daily |
| Confidence signals upgrading/regressing coverage; `exam_ready` earned | **Live** | `applyConfidenceSignal` |
| Per-topic pace, catch-up/roll-over, mock budget | **Live** | `study-pace.ts` |
| 7-day bin-packed forward plan | **Live** | `study-forecast.ts` |
| Finish-date projection (trailing 3-week pace) + phase dates | **Live** | `study-plan.ts` |
| Preparation Health + Topic Memory + revision-due | **Live** | `prep-memory*.ts` |
| Daily insight, prescriptive line, Instant Insight | **Live** | rules only, no model |
| **Revision season (1 Sept high-weightage priority)** | **Live, seasonal** | code shipped; activates by calendar |
| 5-phase roadmap **changing generated tasks** | **Partial** | roadmap computes *where* a student sits; task generation stays the 3-bucket engine until deliberately merged (`study-plan.ts`) |
| AI tutoring / model-authored explanations | **Planned** | no model in any learning path today; the old Gemini narration was removed from the critical path and nothing renders it |
| Model *phrasing* of rule-detected facts | **Planned** | allowed only under §2.6 — detect with rules, never fabricate |

Anything not in this table as **Live** does not exist. Do not describe it to a
student as if it does.

---

## 10. The Blueprint — where reality is declared

`blueprint-builder.ts` defines three sections, in this order for a reason:
**position** (exam, attempt, life) → **coverage** (the per-topic declaration) →
**time** (finish date, chosen *after* coverage so "4h/day → 12 Sept" is honest).
Every field collected is a real input to a downstream engine — this is not a
progress bar. The live projection badge and the finish-date chooser both call the
one shared `remainingPrepHours`, so the promise made on the last onboarding screen
is the exact pace the app demands the next morning.

---

## 11. Success & failure

- **Success is not activity.** Success is a student whose high-weightage syllabus
  is genuinely converging on `exam_ready` before their date — and who trusts the
  plan enough to stop deciding and just study.
- **Failure is a plan that lies.** A "finished" label on unfinished work, a
  promised pace the app contradicts, an invented stat, a recommendation that
  ignores weightage — each is a breach of trust worse than a missing feature. If
  the engine can't state *why this topic / why now* from real rows, it stays
  silent rather than guess.

---

## 12. Scalability & engineering standards

- The architecture is identical at 100 and 1,000,000 students: one canonical
  graph, additive scores whose contributors are the explanation, one pace model,
  one memory entry point, deterministic rules over the student's own rows. Volume
  changes thresholds and dashboards, never the shape.
- **One taxonomy.** `KNOWLEDGE_GRAPH` / `TOPIC_METADATA` are the only source of
  topics, weightage, and ordering. No parallel list, no per-page hardcode.
- **One math model.** Every hours↔date conversion routes through `study-pace.ts`;
  every window/health/topic-memory read routes through `prep-memory*.ts`. A second
  definition of a number the engine owns is the bug.
- **Additive, explainable scoring only.** No black-box rule trees in any selector;
  the winning score's reasons are shown to the student.
- **Deterministic core, no AI on the critical path.** Learning decisions are pure
  functions of the student's rows. A model may phrase, never decide, never invent.
- **Prefetch once, share.** Coverage rows and completion history are fetched once
  per request and passed into both memory engines — never re-queried per consumer.
