# The Metric Constitution

**Locked 18 Aug 2026 by founder arbitration (0C.0). Binding.**

> No new metric may be introduced without defining its semantics here.

This is the document `docs/0C-DISCOVERY.md` proved was missing. The Fact Registry (0C.2)
is the *enforcement* mechanism; this is the *constitution* it enforces. Eleven competing
implementations of "syllabus coverage" existed because the codebase had a measurement
culture and no measurement law.

**The naming law, which generated most of what follows:**

> **If the meaning is different, the fact key must be different.**

Hours, weightage and topic-count are three legitimate ways to measure progress. Calling
all three "coverage" is how we got eleven of them.

**The same-moment invariant (founder, 18 Aug):**

> If Home, Weekly, Insight, Notification and Buddy ask for the same fact at the same
> moment, they receive the same value. The surface may phrase it differently. The fact
> may not differ.

Not yet enforceable — it becomes true only when consumers are migrated (0C.3). Recorded
here as that phase's acceptance criterion.

---

## Article 1 — Time

| Concept | Canonical meaning | Authority | Excluded / notes |
|---|---|---|---|
| **CareerRai day** | The IST preparation day, rolling over at **05:30 IST** | `studyDayString()` / `getLogDateString()` — `src/lib/study-day.ts:38` | The only producer of a CareerRai date. **No component may define its own boundary.** |
| **`last_7_days`** | The trailing **7** CareerRai days, inclusive of today: `[today−6 … today]` | derived from the above | Not 8. Not "7 most recent rows". Not rolling 168 hours. |
| **Week** | CareerRai-local **Monday–Sunday**, both ends bounded | one canonical helper (to be extracted in 0C.2 from `weekly-plan-reconcile:34-45`, the only correct implementation today) | Sunday-start and server-local weeks are defects. |

**Rulings:**
- **T1.** 05:30 IST is the application boundary. The database must hold **no competing
  definition** (see Article 6, defect B).
- **T2.** `05:30 IST ≡ 00:00 UTC` is a *coincidence we currently enjoy, not an invariant
  we declared*. ~30 modules are accidentally correct because of it. They are not
  compliant; they are lucky. Migration is 0C.3 work, and none may be treated as canonical
  in the meantime.
- **T3.** A rolling-168h window over a `timestamptz` column is legitimate for
  timestamp-valued facts, but must **never** be named `last_7_days`.

---

## Article 2 — The syllabus

| Concept | Canonical meaning | Authority | Excluded entities |
|---|---|---|---|
| **Exam syllabus** | Exactly **46** examined units: **QA 28 + VARC 9 + DILR 9** | `EXAM_SYLLABUS_TOPICS` / `isExamSyllabusTopic()` — `src/lib/topics-constants.ts` | **MOCKS (4 units) and READING (3 units) are excluded.** |
| **`{qa,varc,dilr}_syllabus_coverage`** | `covered exam units in section / section total` | `topic_coverage` | habit tracks |
| **`overall_syllabus_coverage`** | `covered exam units / 46` | `topic_coverage` | habit tracks |
| **`section_topics_remaining`** | `section total − covered units` | `topic_coverage` | habit tracks |

**Rulings:**
- **S1 (D1).** Habit and support activities are **preparation activity, not syllabus
  units**. A mock can never make "syllabus covered" go up. Admitting them produces claims
  like *"you are 72% through the CAT syllabus"* where part of the 72% is mocks — not
  confusing UX, **false measurement**.
- **S2 (D3).** Canonical syllabus coverage is **count-based**: `covered units / 46`.
  Hours and weightage may **not** be used for this fact.
- **S3.** Hours and weightage remain legitimate — as *different, explicitly named* facts:
  `planned_hours_completed`, `actual_logged_hours`, and, only if genuinely needed later,
  `weighted_syllabus_exposure`. **`weighted_syllabus_exposure ≠ syllabus_coverage`**,
  enforced by naming and by test.
- **S4.** "Covered" means `isCovered()` (practicing+). "Opened" means `isOpened()`
  (learning+). They are different bars and may never share a fact key.
- **S5.** The 46 is **derived from `KNOWLEDGE_GRAPH`, never re-listed.** A unit added to
  an exam section becomes syllabus automatically; one added to MOCKS/READING never does.
  `EXAM_UNIT_COUNT = 46` in `blueprint-builder.ts` is a hardcoded mirror, pinned only by
  `effort-consistency.test.ts:151`; it is not the authority.

---

## Article 3 — Behaviour

| Concept | Canonical meaning | Source authority | Max |
|---|---|---|---|
| **`logged_days_last_7`** | Distinct CareerRai dates with a daily report, in the trailing 7 | `daily_reports` | **7, always** |
| **`study_days_last_7`** | Of those, days with actual study/completion evidence | `daily_reports` / `routine_task_completions` | **7, always** |
| **`logged_days_total`** | Distinct dates with a daily report, lifetime | `daily_reports` | — |
| **`daily_plan_completion`** | Completed tasks / planned tasks, for one CareerRai day | `routine_task_completions` ÷ `daily_routines` | 1.0 |
| **`weekly_plan_adherence`** | The same, over one canonical week | same | 1.0 |

**Rulings:**
- **B1.** A **rest-day log counts as a logged day, and does not count as a study day.**
  This is not a technicality — it is the guilt-free recovery philosophy expressed as
  measurement. Showing up and studying are different facts.
- **B2.** Count **distinct dates, never rows.** Two rows for one date are one logged day.
- **B3.** **No fact may be named `logged_days` without its window.** The bare name
  currently denotes three different quantities across the codebase (count of logs; days
  since first log, `prep-gain.ts:97`; logs within 30 days of joining, `request-refund`).
- **B4 (ruling 4).** **No generic `consistency_percentage` in 0C.** Six competing formulas
  exist; picking one because the registry wants a slot would be arbitration by
  convenience. The retention metric is expressed directly — *"you logged 5 of the last 7
  days"* — with the North Star at **≥4/7**. Bounded, auditable, actionable, hard to game.
  If a score is genuinely needed later it gets its own key and its own stated purpose.
- **B5 (ruling 5).** **"Avoidance" is not a primitive fact.** `DILR postponed 4 times in
  14 days` is a fact. *"The student avoids DILR"* is an interpretation, and belongs in
  FACT → PATTERN → HYPOTHESIS → CONFIDENCE → ACTION, not in the registry. Five
  implementations with four thresholds is the symptom of a pattern masquerading as a
  measurement.

---

## Article 4 — Mocks

| Concept | Canonical meaning | Source | Status |
|---|---|---|---|
| **`mock_records_count`** | Rows in `mock_debriefs` | `mock_debriefs` | pending reconciliation |
| **`distinct_mocks_taken`** | Distinct mock events | to be decided | pending reconciliation |
| **`complete_mock_count`** | Debriefs with all three section percentiles | `mock_debriefs` | pending reconciliation |

**Rulings:**
- **M1 (ruling on D7).** Do **not** arbitrarily choose between the two existing substrates.
  `mock_debriefs` (a mock *with a debrief*) and `daily_reports.mock_taken` (the student
  *says* they sat one) disagree **by design** — "mock pending analysis" is a real state.
  Five producers must be reconciled before any is registered.
- **M2.** **Count entities, not rows**, unless rows are explicitly the entity identity.
- **M3.** Facts truncated by `.limit(N)` may not be surfaced as lifetime counts. Two
  places do this today; two more `.order(ascending).limit(N)` and then treat the last
  element as "latest", silently freezing after N mocks.

---

## Article 5 — Ratios (the integrity rules)

- **R1 (ruling 9).** A ratio above 100% under a fixed-denominator fact is an **INVALID
  FACT**, not a value to clamp. `Math.min(100, x)` is **presentation logic and must never
  be used as data-integrity logic** — it hides the contamination and leaves a wrong-basis
  numerator flowing onward. **The producer fails closed.**
- **R2.** Numerator and denominator **must range over the same set**. This one rule would
  have prevented the 111% defect.
- **R3.** Every ratio fact declares numerator, denominator, definition, source, rounding
  and version. Untrusted denominator ⇒ `safeRatio` returns **null**, and the caller
  renders counts (*"8 topics completed"*), never an invented percentage.
- **R4.** A delta may only be computed between two observations sharing the same
  `definition_version`. A definition correction may never masquerade as student progress.

---

## Article 6 — Verified defects and their disposition

| # | Defect | Verified | Disposition |
|---|---|---|---|
| **A** | `studentState.knowledge` counted a 53-row numerator against a 46 denominator | 4 students >100% (max 111); **197 of 421 overstated**, mean +2.7 pts | **FIXED 0C.1** — numerator filtered by `isExamSyllabusTopic`. Not clamped. |
| **B** | `topic_evidence.logged_for` DB default on the 03:00 IST rule vs app at 05:30 IST | `information_schema` query | **FIXED 0C.1** — default **dropped**, not re-aligned. Column is NOT NULL, so a direct insert omitting the date now fails loudly instead of inventing one. |
| **C** | `coverage_total = 53` fed into an hours model calibrated on 46 | code path traced | **OPEN — needs founder approval.** See below. |

**Defect C is the one this constitution rules on but 0C.1 did not fix**, and the reason
matters: ruling S1 determines the correct value (46), but applying it **changes the
finish-date options quoted to every new student** — a user-facing behaviour change, which
the Phase-0 rule ("zero user-facing change") forbids without an explicit decision.
Today every new student is priced at `53 × 8.6h ≈ 456h` against a 397h syllabus, ~15%
high, and Home prices the same syllabus correctly the next morning. It is a real defect
affecting **every new signup**, larger in reach than defect A — and it cannot be fixed
quietly.

---

## Article 7 — Amendment

A ruling changes only by explicit founder decision recorded here, with its rationale and
date. Changing a definition creates a **new `definition_version`**; historical facts
remain interpretable under the version that produced them. Nothing is retconned.
