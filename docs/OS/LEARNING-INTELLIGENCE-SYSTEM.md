# CareerRai Learning Intelligence System (LIS) — Architecture

> The operating system the whole product plugs into. We are **not** building a
> study-plan engine; the study plan is *one output* of a layered intelligence
> system. This document is the spine: every future learning/planning/notification
> feature must declare which engine it belongs to and obey that engine's
> contract. If a feature doesn't fit an engine, **expand the engine, not the
> feature** (Engineering Playbook rule).
>
> **Product philosophy (top of the document, governs everything):**
> CareerRai is not an AI study planner. It is an **AI Learning Operating
> System**. Every recommendation must answer one question:
> *"If the student's mentor had complete knowledge of their goals, constraints,
> behaviour, progress and history, what would they ask the student to do next —
> and why?"* The test for any feature is never "can we build it?" but **"does it
> help the system make the next best coaching decision?"**

---

## The stack (data flows top → bottom, learning flows bottom → top)

```
STUDENT
  │
  1  Identity Engine     — Who are you? (permanent DNA)
  2  Constraint Engine   — What is stopping you? (ranked bottlenecks)
  3  Capacity Engine     — What can you realistically sustain? (behaviour > input)   ◀ the moat
  4  Learning Engine     — What deserves attention? (topics as intelligent objects)
  5  Decision Engine     — The single highest-leverage move today (mentor's call)
  6  Planning Engine     — Today, as a CONSEQUENCE of 1–5, not a calculation
  7  Execution Engine    — Sessions, not hours; matched to energy
  8  Review Engine        — What actually happened? (rich capture, not yes/no)
  9  Adaptation Engine    — What changes tomorrow? (learn the student)
 10  Performance Engine   — Are you moving toward your percentile? (the heartbeat)
```

The current product is ~Layer 6 only (Planning) — roughly 20% of the value.

---

## The engines

### 1. Identity Engine — permanent Student DNA
Asked once, never again. First-attempt / repeater · working / college / gap-year /
full-time · medium · diagnostic score · target percentile · exam date · ambition.
**Store:** `profiles` (is_repeater, is_working_professional, target_percentile,
attempt_year, baselines). **Status:** exists, but capture is incomplete (Pranav
works yet `is_working_professional=false`). **Contract:** DNA is stable; changing
it re-derives downstream, never silently.

### 2. Constraint Engine — the ranked bottleneck list
The layer every EdTech skips. Don't ask "hours available?" — ask **"what is
preventing 99?"** Each student gets a *ranked* profile across: time · knowledge ·
consistency · revision · speed · accuracy · confidence · energy · mock-anxiety ·
discipline. **Planning becomes constraint optimisation, not topic allocation.**
**Store (planned):** `student_constraints` (student_id, constraint, severity,
source, updated_at). **Status:** Planned. **Seed:** onboarding pain_points +
behaviour already hint at these.

### 3. Capacity Engine — behaviour beats input  ◀ **the moat, building now**
Not "available vs required hours." Computes four capacities:
- **Physical** — hours the day physically allows (claimed).
- **Cognitive** — focus quality (energy pattern; time-of-day).
- **Sustainable** — what holds for 90 days.
- **Historical** — what this student has *actually completed*.

**Rule: behaviour > user input.** A student who entered 6h but logs 2.8h for 21
days *has* a 2.8h capacity — the engine must stop believing onboarding and
believe behaviour. This is where the Pranav failure is truly solved: the plan is
sized to what he can sustain, not what he claimed. **Store:** `daily_reports`
(study_duration) + routine completion. **Output:** a per-student capacity object
consumed by Planning. **Status:** v1 in this change (`src/lib/capacity-engine.ts`).

### 4. Learning Engine — topics as intelligent objects
Not chapter names. Every topic carries: learning cost · practice cost · revision
cost · importance/weightage · dependency · forgetting speed · mock frequency ·
(per-student) confidence & accuracy · average student time · average topper time.
Answers **"what deserves today's attention?"** — and fixes the flat 3-min/question
and QA-vs-RC-vs-LRDI-unit errors (learning ≠ exam speed; plan in the natural
unit). **Store:** extend `TOPIC_METADATA` (today: difficulty, estimatedHours,
weightage) + a per-student topic-state table. **Status:** partial → the
phase × unit × topic pace matrix (research doc §2) lands here.

### 5. Decision Engine — the mentor's one call for today
Above the plan. Each day: *what is the single highest-leverage decision?* —
"don't study new concepts, you're forgetting → revise" · "skip the plan, take a
mock" · "you're exhausted → revision only" · "you're ahead → pull revision
forward." **The plan is the implementation of this decision**, not the decision
itself. **Status:** Planned (the notification decision-engine is a primitive
seed).

### 6. Planning Engine — today as a consequence
Inputs are no longer hours → questions. They are Identity + Constraints +
Capacity + Learning-state + Performance-trend + upcoming revision + exam timeline
+ yesterday. Output: a **completable** day in natural units, sized to Capacity,
shaped by the Decision. **Store:** `daily_routines`. **Status:** exists
(`routine-engine.ts`), to be refed by engines 1–5.

### 7. Execution Engine — sessions, not hours
Students live in sessions (morning/lunch/night), not hour-totals. Break the day
into energy-matched sessions: high energy → new concepts, low → revision/
flashcards. Different shape per persona (working prof: lunch revision + commute
flashcards + night focus). **Status:** Planned.

### 8. Review Engine — rich capture
Not "completed? y/n." Capture time spent · attempted · accuracy · difficulty
felt · confidence · mood · energy · skipped-and-why. This is the fuel for
Adaptation. **Store:** extend `daily_reports` / `routine_task_completions`.
**Status:** partial (hours + topics logged; the richer signals planned).

### 9. Adaptation Engine — learn the student
Tomorrow ≠ today. Geometry expected 90 min, took 170 → learn. Night sessions
always skipped → learn. Every day the planner gets more human. Owns the
**catch-up doom-loop fix** (redistribute the week, never pile on) and per-student
pace learning. **Status:** v1 in `src/lib/adaptation-engine.ts`. `computeAdaptation`
learns a per-student `volumeFactor` from two behavioural signals — the explicit
`plan_fit` tap (Review Engine) and the plan-completion ratio — and scales task
VOLUME by it in the routine engine (Capacity still owns the hours; the motivation
cap still owns the ceiling). Rule is asymmetric/motivation-first: **behaviour can
only lighten the day; only an explicit "too little" earns a heavier one.** The
doom-loop's other half — pace pile-on as `remaining ÷ daysLeft` climbs — is
already broken upstream by Capacity capping the hours + "postpone, never delete."
Surfaced on admin Student 360 and returned to the client as `adaptation` when it's
actually learned something. **Deferred (v2):** per-topic time learning (needs
`routine_task_completions.actual_minutes` to accrue), session-level skip learning,
explicit weekly redistribution.

### 10. Performance Engine — the heartbeat
Not hours or questions. **Learning Velocity** (how much closer to target
percentile today), consistency, retention, revision health, mock readiness,
weak-area trend, projected-percentile confidence. The founder/CEO dashboard of
learning. **Status:** Planned.

---

## Every open issue, assigned to exactly one engine (no overlap)

| Issue | Engine |
|---|---|
| Hours vs target-date mismatch | Capacity |
| Believe behaviour, not input | Capacity |
| 3-min/question flaw | Learning |
| Learning vs practice vs revision speed | Learning |
| QA vs RC vs LRDI units | Learning |
| Repeater vs fresher | Identity + Planning |
| Working vs college vs full-time | Identity + Execution |
| Catch-up doom-loop | Adaptation |
| Motivation collapse (180 questions) | Execution + Adaptation |
| Weekly redistribution | Adaptation |
| Revision timing | Learning + Planning |
| Mock anxiety | Constraint |
| Energy fluctuations | Capacity + Execution |
| Personal-pace learning | Adaptation |

Clean separation = good architecture. A feature that would touch three engines is
a sign it's mis-scoped.

---

## Build order (each ships independently, validated against real logs)

1. **Capacity Engine v1** — behaviour-informed sustainable hours; cap the plan so
   it's completable. *This change.* Directly ends the Pranav failure.
2. **Learning Engine — pace matrix & units** — phase × unit × topic (research doc
   §2); plan RC/DILR in sets/passages; motivation cap on daily volume.
3. **Identity completeness** — capture working-professional reliably; persona
   forks in Planning/Execution.
4. **Review Engine enrichment** — capture the signals Adaptation needs.
5. **Adaptation Engine** — per-student pace + weekly redistribution (kills the
   doom-loop). *Shipped v1: `volumeFactor` learned from plan_fit + completion
   ratio, applied to task volume; motivation-first (behaviour only lightens).*
6. **Decision Engine** — the daily highest-leverage call.
7. **Constraint & Performance Engines** — bottleneck profile + Learning Velocity.

Nothing here is built before its number without the data the prior layer produces.
That ordering *is* the moat: the engine earns each number by measuring it.
