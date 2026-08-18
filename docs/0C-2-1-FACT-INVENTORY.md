# 0C.2.1 — Candidate Fact Inventory

**18 Aug 2026. READ-ONLY. No registry built, no code migrated, no rule written.**

Per the 0C.2 authorization: *build the smallest trustworthy fact layer required for the
Insight Engine* — not every metric in CareerRai. This is the inventory that decides which
facts are eligible.

Governed by `docs/METRIC-CONSTITUTION.md`. Volumes measured live this session.

---

## 0. The caveat you raised, answered plainly

**Is the P0-C fix a membership gate or a clamp? Both — and the clamp is a liability.**

- **Producer** (`screen-topic-coverage.tsx`): a real membership gate, `isExamSyllabusTopic`,
  applied to the whole declared triple. This is the fix.
- **Model** (`remainingPrepHours`): `Math.min(count, EXAM_UNIT_COUNT)` — defence in depth.

Your Decision 9 catches what I did not say clearly: **if the producer ever regresses and
sends 53 again, that clamp silently corrects it to 46 and the regression never surfaces.**
The guard test pins the producer at build time; the clamp is silent at runtime. That is
"hiding a membership failure behind a MIN", exactly what you forbade.

**Carried into 0C.2 as a mandatory registry rule, not another audit:**

> A membership or range violation must be *reported*, never silently corrected. A fact
> producer that receives out-of-universe input returns **UNKNOWN** and records the
> violation. Clamping is permitted only for presentation, never inside a producer.

---

## Production volumes (the evidence behind every GREEN/YELLOW/RED below)

| Source | Rows | Distinct students |
|---|---|---|
| `daily_reports` | 318 | **135** |
| `routine_task_completions` | 245 | **61** |
| `daily_routines` | 897 | — |
| `daily_routines` with swaps | 91 | 64 |
| `topic_coverage` | 22,595 | 421 |
| `mock_debriefs` | **22** | **18** |
| …of which **complete** (overall + all 3 sections) | **11** | — |
| Repeaters | 66 | — |

---

## A–G. The candidate facts

### Category B — Syllabus coverage 🟢

| | |
|---|---|
| **fact_key** | `syllabus_coverage_units` · `syllabus_coverage_pct` · `section_coverage_units` · `section_coverage_pct` · `section_topics_remaining` |
| **Semantic type** | DERIVED_FACT |
| **Meaning** | Exam-syllabus units at `isCovered` (practicing+) ÷ the exam-syllabus universe |
| **Canonical source** | `topic_coverage` |
| **Canonical authority** | universe: `EXAM_SYLLABUS_TOPICS` / `isExamSyllabusTopic` · ladder: `isCovered` |
| **Denominator** | 46 overall · QA 28 / VARC 9 / DILR 9 — **verified uniform across all 421 covered students** |
| **Membership rule** | `isExamSyllabusTopic`; habit tracks excluded (Constitution S1) |
| **Time basis** | point-in-time (current state), no window |
| **Range** | 0–100, cannot exceed by construction (numerator ⊆ denominator universe) |
| **Unknown when** | student has zero coverage rows (**42 students today**) ⇒ UNKNOWN, render counts |
| **Current producers** | 11 (see `0C-DISCOVERY.md` §A.1) — count, weightage and hours bases |
| **Current consumers** | Home ring, Blueprint, sales brief, buddy case, prep-insight-engine |
| **Contradiction** | The 11 producers span three incompatible bases. Constitution S2 already ruled: **count-based is canonical**; weightage and hours become separately-named facts. |

**🟢 GREEN.** Definition ruled, denominator verified, universe now has a membership gate,
authority single. Ready.

---

### Category A — Daily logging 🟢

| | |
|---|---|
| **fact_key** | `logged_days_last_7` · `logged_days_total` · `study_days_last_7` · `logged_today` |
| **Semantic type** | DERIVED_FACT |
| **Meaning** | `logged_*`: distinct CareerRai dates with a `daily_reports` row (a rest-day log counts). `study_*`: of those, days with actual study evidence. |
| **Canonical source** | `daily_reports` (per Constitution Article 3 / `facts/canonical.ts`) |
| **Time basis** | trailing **7** CareerRai days inclusive of today, `[today−6 … today]`, via `getLogDateString()` |
| **Range** | 0–7 for the windowed facts, **always** |
| **Unknown when** | never — zero is a real answer |
| **Current producers** | 15 (`0C-DISCOVERY.md` §A.3) |
| **Contradiction** | Producers differ on **all four** axes: rows vs distinct dates · 7 vs 8 days · `daily_reports` vs `routine_task_completions` · whether a 0-hour rest log counts. Constitution B1/B2/B3 already ruled every axis. |

**🟢 GREEN.** Every axis is ruled; this is a migration problem, not a definition problem.

---

### Category C — Topic/section progress 🟢

`topic_status` (the ladder value per topic) · `topics_at_depth` (revising+).
Source `topic_coverage`, authority `coverage-status.ts` (`isOpened` / `isCovered` /
`isAtRevisionDepth`), guarded by `covered-authority.guard.test.ts`.

**🟢 GREEN.** Single authority, already test-enforced. Note `isOpened` is re-spelled
inline in ~9 places (`0C-DISCOVERY.md` §K11 area) — a migration task, not a definition
dispute.

---

### Category G — Repeater baseline 🟢

| | |
|---|---|
| **fact_key** | `self_reported_last_year_percentile` · `self_reported_weakest_section` · `self_reported_had_buddy` · `is_repeater` |
| **Semantic type** | **FACT** (directly observed — what the student *said*) |
| **Canonical source** | `profiles` (written once at onboarding) |
| **Time basis** | point-in-time at declaration; **immutable** |
| **Critical rule** | These are the student's own words and are **never overwritten by observation**. `observed_*` facts live under different keys. The Insight Engine may reconcile them later; it may not rewrite history. |
| **Coverage** | 66 repeaters, 31 with a percentile |

**🟢 GREEN.** Self-report is trivially trustworthy *as self-report* — the trap is only
ever conflating it with evidence, and separate keys prevent that.

---

### Category D — Planned vs completed 🟡

| | |
|---|---|
| **fact_key (proposed)** | `tasks_planned_today` · `tasks_completed_today` · `day_plan_completion` |
| **Semantic type** | DERIVED_FACT |
| **Source** | `daily_routines.tasks` × `routine_task_completions` |
| **Contradiction** | 3 producers of `completionRatio` with **different windows**: 14 *rows* (`routine/today`), 21 *days* (`student-360`), 21 days (`lis-health`). Also `fullyDone` counts a half-tick as done while `creditedHours` counts it as 0.5 — **two definitions of "completed" inside one request**. |
| **Data** | 245 completions across **61 students** |

**🟡 YELLOW.** Definition is clear for a *single day*; the windowed ratio is not ruled, and
the half-tick question is genuinely open. **Recommend: register the single-day counts only
(GREEN sub-facts), defer the windowed ratio.**

---

### Category E — Postponement 🔴

| | |
|---|---|
| **Source** | `daily_routines.swapped_out` |
| **New finding** | The column **conflates two different events**. `busy-day/route.ts:73` writes *the whole day's topics* on one tap; `plan-mutate.ts` writes a deliberate single swap. Measured distribution: 43 routines with 1 topic, but **48 of 91 (53%) carry 2–6 topics** — the busy-day shape. |
| **Self-declared gap** | `capability-health/route.ts:30` already flags it: *"Writes daily_routines.swapped_out; **no invariant**"*. |

Under the naming law these are two facts: `topic_postponed_deliberately` and
`day_deferred_busy`. The current column cannot distinguish them retroactively.

**🔴 RED.** Not a threshold dispute — the source itself mixes meanings, and 53% of the
data is the wrong event. Registering this now would canonize the pollution.

---

### Category F — Consistency ⛔ EXCLUDED

Constitution **B4**: no generic `consistency_percentage` in 0C. Six competing formulas
exist; the retention metric is expressed directly as `logged_days_last_7`, North Star
≥4/7. Nothing to register.

---

### Category H — Mock performance 🔴

| | |
|---|---|
| **Data** | **22 debriefs, 18 students, only 11 complete** (overall + all three sections) |
| **Source conflict** | Two substrates disagree *by design*: `mock_debriefs` (a mock *with* a debrief) vs `daily_reports.mock_taken` (the student *says* they sat one). "Mock pending analysis" is a real state. |
| **Producer conflict** | 5 producers of "mocks taken"; 4 thresholds for "percentile dropped" (2/5/5/0); 2 rankers for "weakest section from mocks" with different age windows (45d vs ∞) and completeness rules (3 sections vs 2) |
| **Structural bug** | Two call sites `.order('taken_on', ascending).limit(N)` — fetching the **oldest** N — then treat the last element as "latest" |

**🔴 RED — MOCK INSIGHT DATA IS NOT READY.** Eleven complete mocks across the entire
product cannot support a pattern claim. Registering mock facts now would be fake
precision on a sample that cannot carry it.

---

## H. Recommended smallest v1 fact set

**Seven facts. Nothing else.**

| # | fact_key | Type | Source | Why it earns its place |
|---|---|---|---|---|
| 1 | `syllabus_coverage_units` | DERIVED_FACT | `topic_coverage` | the "QA 24%" claim's numerator |
| 2 | `syllabus_coverage_pct` | DERIVED_FACT | ← 1 ÷ 46 | the claim itself |
| 3 | `section_coverage_units` | DERIVED_FACT | `topic_coverage` | per-section, the tap-scoped insight |
| 4 | `section_topics_remaining` | DERIVED_FACT | ← 3 | "just 3 topics left" — the most motivating true line |
| 5 | `logged_days_last_7` | DERIVED_FACT | `daily_reports` | the North Star's own input |
| 6 | `logged_today` | FACT | `daily_reports` | the tap/log event gate |
| 7 | `self_reported_baseline` | FACT | `profiles` | repeater reconciliation's immutable left-hand side |

These seven are exactly what Phase 1's tap-and-log payoff needs, and no more. Every one
is GREEN: ruled definition, verified denominator, single authority, known unknown-state.

---

## I. Deliberately excluded, and why

| Excluded | Reason |
|---|---|
| `consistency_pct` | Constitution B4 — six formulas, no ruling, and the direct expression is better |
| `avoidance` / "student avoids DILR" | Constitution B5 — an INTERPRETATION, not a fact |
| `postponement_count` | 🔴 source conflates two events (53% wrong-event data) |
| all mock facts | 🔴 11 complete mocks — insufficient evidence |
| windowed `plan_completion_ratio` | 🟡 three windows, unruled; single-day counts suffice for Phase 1 |
| hours-based coverage % | Constitution S3 — a different fact needing a different key; no Phase-1 consumer |
| weightage-based coverage % | same |
| `study_days_last_7` | ruled and clean, but **no Phase-1 consumer** — register when something needs it |

**The discipline: a fact with no consumer is speculative inventory.** Five of these eight
are excluded for evidence reasons; three purely because nothing needs them yet.

---

## J. New ambiguities discovered

1. **The clamp in `remainingPrepHours` can hide a producer regression** (§0). Mine,
   conceded, becoming a registry rule.
2. **`swapped_out` conflates busy-day deferral with deliberate swap** — one column, two
   events, no invariant (self-declared in `capability-health`). New this session.
3. **`fullyDone` and `creditedHours` disagree about a half-tick inside one request** —
   `complete-task/route.ts` counts it as done at line 173 and as 0.5 at line 209.
   Not fixed opportunistically; reported per the stop rule.

---

## STOP

**0C.2.2 requires founder approval.** No registry contract written, no guards created, no
facts implemented, no consumers migrated, no user-facing behaviour touched.

The decision in front of you: **approve the seven-fact v1 set**, amend it, or rule on any
of the three new ambiguities first.
