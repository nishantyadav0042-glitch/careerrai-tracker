# CareerRai Study Plan — Design, Calculations & Duplicate Audit (10 Aug 2026)

> Written for external review. It states exactly how the plan is built today, the
> real numbers behind it, the **duplicate systems that cause the inconsistencies**,
> and the plan to collapse them to **one engine, one output**.

---

## 1. What a study plan must do

CAT has three sections — **VARC, DILR, QA** — tested in one sitting. A good plan:

1. Covers the whole syllabus **before the exam**, with time left for mocks + revision.
2. Is a **daily mix of sections** (toppers touch multiple sections every day; a
   section left for days decays, and single-subject days are boring/impractical).
3. Weights time toward the student's **weakest** section and the **bigger** sections.
4. Is **identical** on the homepage ("today") and in "see my whole plan" — the
   whole plan is just today, projected forward.
5. Is built around the student's **own daily self-study hours** — the date is the
   consequence, never a lever that rewrites the plan.

---

## 2. Inputs (all real, all stored)

| Input | Source | Meaning |
|---|---|---|
| Coverage per topic | `topic_coverage` | not_started / learning / practicing / revising / exam_ready |
| Daily self-study hours | `profiles.study_target_hours` | the student's own number; the plan is sized to it |
| Weakest section | self-report → else derived from coverage | the mix leans here |
| Effort multiplier | repeater + last-year percentile | a repeater relearns faster |
| Exam date | fixed CAT Sunday | phase + mock calendar anchor |
| Coaching timetable | `student_timetables` (optional) | class topics anchor to their date |

---

## 3. The calculations (the math to review)

### 3.1 Hours per topic (the canonical model)
Each of 46 topics has a **planning estimate** in `TOPIC_METADATA.estimatedHours`
(total ≈ 397h). This is the ONLY hours model (a second 523h model was removed;
see `prep-model.ts`). Hours are stated as estimates, never as measured truth.

### 3.2 Remaining hours for a topic
```
remaining(topic) = estimatedHours × REMAINING_FRACTION[status] × effort
REMAINING_FRACTION = { not_started 1.0, learning 0.65, practicing 0.35, revising 0.15, exam_ready 0.05 }
```
`effort` (repeater relearns faster): first-timer = 1.0; repeater by last-year
percentile — ≥90 → 0.55, ≥80 → 0.65, ≥70 → 0.80, else 0.90; repeater with no
percentile → 0.80. Never above 1.0.

### 3.3 Which topic next, per section (the priority score)
Additive score; highest wins; the contributors ARE the explanation. **This is
where the duplication lives — see §5.**

### 3.4 The mixed day (`plan-mix.ts`, the new shared engine)
```
sectionsForDay(hours, weakest, dayIndex):
  hours ≥ 3  → all three sections, weakest first
  hours < 3  → weakest + ONE rotating other (both non-weakest hit within 2 days)

splitDayHours(sections, hours, weakest):
  weight(s) = BASE[s] × (s === weakest ? 1.6 : 1)       BASE = { QA 1.0, DILR 1.0, VARC 0.8 }
  share(s)  = hours × weight(s) / Σ weight,  rounded to 0.5, floored at 0.5, summed back to `hours`
```
Each section's topics are drawn from its own priority queue and **progress across
days** (RC is 30h — it spans days, but always *alongside* the other sections).

### 3.5 Exam calendar (phases + mocks)
- **Phases:** build (now→Aug) · intensive (Sep–Oct) · revision (Nov, no new topics).
- **Mocks:** 1/week now (Sunday); 2/week in Oct–Nov (Sunday + Wednesday). A mock =
  2h exam + 2h analysis the next day (own block).
- A day "owes" the calendar first (mock 2h, analysis 2h); topics fill what's left.

### 3.6 Feasibility (does the date hold?)
```
topicCapacity = Σ over usable days (committedHours − calendarReserved)   // mock/analysis/Nov excluded
shortfall     = max(0, remainingSyllabusHours − topicCapacity)
fits          = shortfall === 0
```
When it does not fit we **say so** with the two honest fixes (more hours, or a
later date) — we never silently drop topics to make the arithmetic work.

---

## 4. The output
A list of days, each with items `{ topic, section, hours }` + mock/analysis/
revision blocks. Homepage renders day 0; "see my whole plan" renders all days.

---

## 5. Duplicate systems — the audit (the real problem)

The plan is currently built by **more than one system doing the same job**, which
is exactly why the homepage and the whole plan disagreed.

### 5.1 TWO topic-priority rankers that DISAGREE  ← the core bug
| | Daily (`topic-selector.chooseTopicForSection`) | Whole plan (`study-forecast.buildWeekPlan`) |
|---|---|---|
| not_started | **22** | **30** |
| learning | **30** (finish what you started) | **22** |
| weightage | + weightage | + weightage × 3 |
| revision-due, prerequisites, priority/focus/postpone, class-anchor | yes | partial |

They rank in **opposite order** for started vs new topics → the two views pick
different topics for the same section on the same day. This is the blunder.

### 5.2 TWO day-assemblers
- `routine-engine.generateRoutine` — builds the DAILY plan (one topic per section,
  always 3, not hours-scaled, not weighted).
- `full-plan.buildFullPlan` — builds the WHOLE plan (now via `plan-mix`, hours-scaled + weighted).

So "today" is assembled twice, by different rules.

### 5.3 Overlapping hours/forecast helpers
- `study-pace.remainingSyllabusHours` vs `blueprint-builder.remainingPrepHours` —
  both compute "hours of syllabus left"; must be one.
- `study-forecast.buildWeekPlan` (7-day forecast) overlaps the whole-plan builder.

---

## 6. The target: ONE engine, one output

```
                    ┌─────────────────────────────────────────┐
   coverage,        │  topicPriority(section)   ← ONE ranker   │
   hours, weakest,  │        │                                 │
   effort, exam,    │        ▼                                 │
   coaching   ───▶  │  per-section topic queues                │
                    │        │                                 │
                    │        ▼                                 │
                    │  plan-mix (sections/day, split, draw)     │  ← ONE day-assembler
                    │        │                                 │
                    │        ▼                                 │
                    │  day 0 ─────────────▶ homepage "today"    │
                    │  days 0..N ─────────▶ "see my whole plan" │  (day 0 identical by construction)
                    └─────────────────────────────────────────┘
```

**Consolidation steps (each removes a duplicate):**
1. **One topic-priority.** Extract `chooseTopicForSection`'s scoring into a single
   `topicPriority` used by BOTH the daily plan and `buildWeekPlan`. Kill the
   opposite-ordering (§5.1). *(Result: both views rank topics identically.)*
2. **One day-assembler.** `generateRoutine` builds today by calling `plan-mix`
   (the same engine the whole plan uses), so the daily plan is also hours-scaled
   and weighted, and day 0 === whole-plan day 0. *(Removes §5.2.)*
3. **One hours model.** Collapse `remainingPrepHours` into
   `remainingSyllabusHours`; retire the parts of `study-forecast` the one engine
   replaces. *(Removes §5.3.)*

**Done so far (10 Aug):** the whole plan uses the shared `plan-mix` engine and the
same weakest-section as the homepage, so both now show mixed-section days. **Not
yet done:** steps 1–3 above — held for this review, because the fix must be one
engine, not a third.

---

## 7. The rules, stated for review
- The plan is built around the student's **self-study hours**; the date moves, the
  plan never silently shrinks.
- **Every study day is a mix of sections** (never one subject); weakest leads.
- **Zero inconsistency**: the whole plan is today projected forward — day 0 must be
  byte-identical to the homepage.
- **No fake precision, no silent drops**: estimates are labelled; an impossible
  date is stated with its two real fixes.
- **One system per job**: one ranker, one day-assembler, one hours model.
