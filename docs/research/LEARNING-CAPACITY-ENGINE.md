# CareerRai — Learning Capacity Engine (Research & Design)

> Research document, not a spec to implement blindly. It reframes the planner
> from a **Curriculum Engine** (optimises syllabus completion) into a
> **Performance Optimiser / Learning Capacity Engine** (optimises sustainable,
> percentile-moving progress). Written after the Pranav incident, which exposed
> a fundamental optimisation error, not a bug.
>
> **Integrity note:** every capacity/pace number here is a *reasoned starting
> prior to calibrate against our own logged data* — never a claimed fact. The
> whole thesis is that the engine should *learn* the real numbers per student.
> No invented statistics.

---

## 0. The core thesis — we are optimising the wrong objective

Today the engine computes:

```
remaining syllabus → remaining days → hours required → sections → minutes → questions
```

It looks logical. It is backwards. Nowhere does it ask **"can this human actually
execute this every day for 120 days?"** It optimises **schedule completion**; the
student is optimising **CAT percentile**. Those are not the same objective.

Two students:
- **A** completes 100% for 5 days, then quits.
- **B** completes 80% for 120 days.

**B wins CAT every time.** The engine must optimise for B — for **sustainable
consistency and completion *probability***, not mathematical completeness.

**The metric must change** from *"did we allocate all available hours?"* to
*"did the student finish today feeling real progress — and want to come back
tomorrow?"* A 90%-optimal plan completed daily beats a perfect plan abandoned in
a week. This is the whole game.

---

## 1. The ten design problems (kept separate — do not merge them)

Each is an independent problem with its own research and its own fix. Solving
them as one "formula tweak" is how we got here.

| # | Problem | Today | The shift |
|---|---|---|---|
| 1 | **Capacity planning** | Date → hours → questions; date can silently invent hours | Capacity is the **hard constraint**; the date **moves** |
| 2 | **Learning speed** | flat 3 min/question | learning ≠ exam speed; model *time to learn* |
| 3 | **Phase pace** | one pace for all phases | learn / practice / revise / mock are different engines |
| 4 | **Topic unit** | everything is "questions" | QA=questions, RC=passages, LRDI=sets, mock=papers |
| 5 | **Difficulty** | all topics equal within a section | per-topic learning/practice/revision cost |
| 6 | **Fresher vs repeater** | only revision-frequency differs | different *products*, not different coefficients |
| 7 | **Working vs college vs full-time** | one engine, small coefficients | genuinely different planning strategies |
| 8 | **Cognitive fatigue** | 540 min = 540 productive min | efficiency decays; late hours ≠ learning hours |
| 9 | **Motivation psychology** | size = math output (180 q) | size for a **completable** day, then optional extra |
| 10 | **Adaptive personalisation** | fixed assumptions forever | learn each student's real pace — the moat |

---

## 2. Research findings (the priors to calibrate)

### 2a. Sustainable capacity — "focused" hours, not "sitting" hours

The critical distinction the current chip-picker ignores: **8 hours available ≠ 8
focused study hours.** Focused, deliberate practice is cognitively expensive and
self-limiting. Reasoned priors to validate against our logged study-duration data:

| Persona | Sustainable *focused* hrs (weekday) | Weekend | Note |
|---|---|---|---|
| Working professional | 1.5–2.5 | 3–5 | energy-scarce; ROI-first |
| College student | 3–4 | 4–6 | classes compete |
| Full-time aspirant / dropper | 4–6 | 5–7 | *not* 10–12 — that's sitting hours |

The "10h / 12h" chips are almost always **sitting hours or aspiration**, not
sustainable focus. Toppers overwhelmingly win on *consistency of 4–6 focused
hours for months*, not heroic 10-hour days that collapse. **We should gently
reframe high entries** ("9h is intense — most who finish do 4–6 *focused* hours;
is 9 realistic for you daily?").

### 2b. Learning pace matrix — the heart of it

Pace must vary on **phase × unit**. A flat 3 min/q is roughly a *practice/near-exam*
speed; using it during *learning* over-counts volume 3–5×. Starting priors (minutes
per unit, to calibrate):

| Unit | Learning | Practice | Revision |
|---|---|---|---|
| QA question | 8–15 | 3–5 | 1.5–2 |
| Verbal (non-RC) question | 5–8 | 3–4 | 1.5 |
| **RC passage** (set of 3–5 Q) | 25–40 | 12–18 | 8–12 |
| **DILR set** (4–6 Q) | 25–45 | 12–20 | 10–12 |
| Mock (full) | — | — | 180 min + **60–120 min analysis** |

Why learning is slow: *concept → attempt → wrong → read solution → retry →
reflect.* Only ~20–30% of learning time is "solving." That's not inefficiency —
that's where the learning happens. The engine must budget for it.

### 2c. Topic complexity index (learning cost, not exam weight)

Weightage ≠ learning cost. Two different axes. Reasoned buckets to calibrate:

- **High learning cost:** Geometry, Modern Math (P&C, Probability), Number System (advanced), most DILR set types, RC inference.
- **Medium:** Algebra, Arithmetic (core), Para-based verbal, standard LRDI.
- **Low:** Percentages, ratios, basic arithmetic, Vocabulary, Grammar drills.

Each topic needs **three** numbers — learn-cost, practice-speed, revise-speed —
not one `estimatedHours`.

### 2d. Cognitive fatigue curve

Productivity is not linear in time. Rough decay to validate: hour 1 ~100%, hour 2
~90%, hour 3 ~80%, hour 5 ~55%, hour 8 ~30%. **Implication:** past ~4–5 focused
hours, *new-concept learning* is wasteful; the marginal hour is better spent on
**practice → revision → flashcards**. And an 8 PM session after a work day starts
at ~25% energy, not 100% — the engine treats both equally today. **Match task
type to energy**, not just to the clock: high energy → new concepts, low energy →
revision/recall.

### 2e. Language of units = motivation

"Solve 54 LRDI questions" is psychologically crushing and *wrong* — nobody counts
LRDI in loose questions. "Solve **3 sets**" is the same work, framed as
achievable. Unit language materially changes adherence. Plan in the unit the
student thinks in.

---

## 3. Fresher vs Repeater — different products, not coefficients (Issue 6)

Today the only real difference is a revision multiplier (0.7). That's ~20% of the
truth. They are optimising different things:

| | Fresher | Repeater |
|---|---|---|
| Core need | concepts, exposure, syllabus completion, confidence | execution, consistency, mocks, analysis, revision |
| The question they ask | "What *is* Logarithms?" | "Why did I miss 97?" |
| Right first move | build coverage | fix leaks (error log, mock analysis) |
| Plan centre of gravity | learning new topics | mistakes > new topics, timed practice |
| Revision season | Sept-ish | **earlier** + heavier daily share |
| Notifications / dashboard / AI | teach & encourage | diagnose & sharpen |

The engine should *feel like a different coach* for each — different daily task
mix, different revision timing, different copy. This is a product fork at the
experience level, one engine with genuinely different strategies underneath.

---

## 4. Working vs college vs full-time (Issue 7)

Three planning strategies, not one with a small coefficient:
- **Working:** energy-scarce → highest-ROI topics only, micro-sessions (1 focused
  block), weekend-loaded, revision-optimised. Never "complete everything."
- **College:** medium blocks, fit around classes, steady.
- **Full-time:** can split the day into 2–3 focused blocks with breaks — but
  still capped at sustainable *focused* hours, not sitting hours.

Note: Pranav told sales he's working, but `is_working_professional = false` —
so onboarding capture of this is itself a gap to fix.

---

## 5. The single date decision — capacity-first (P0, partly shipped)

**Principle: available hours are FACT; the target date is DESIRE.** The engine
must never invent hours to satisfy a date. When the desired date needs more hours
than the student has, show the **truth** and let the *student* decide — one
decision, one source, no silent second reconciliation:

```
Reality check
You can give: 3 h/day
To finish by 30 Aug you'd need: 7 h/day   ← red

  A · Stay at 3h/day → finish ~15 Oct
  B · Go to 5h/day  → finish ~20 Sept
  C · Keep 30 Aug   → needs 7h/day (very demanding)   ← you choose, eyes open
```

The algorithm proposes; **the student decides.** Huge trust builder, and it kills
the Pranav failure at the source. **Shipped:** the bold red reality-check now
fires in onboarding when hours contradict the date, offering "move to a date your
hours fit" vs "keep it anyway." **Remaining P0:** collapse to a *single* date
source — remove the second post-signup re-derivation so the date the student
consciously sets is the date they keep (today it can be set in the funnel *and*
re-derived after signup, which is how a "Fast = 6 weeks" tap silently became
"23 Aug" for Pranav).

---

## 6. Motivation-first daily sizing (Issue 9)

Never render 180 questions — the plan fails before the student starts ("I'm
already behind"). Instead:

```
Core plan (must-do)  → sized for ~90–95% completion probability
   e.g. 12 QA questions · 2 DILR sets · 1 RC passage
        → complete → green tick → momentum → tomorrow
Optional "extra practice" → for the high-energy days, never guilt on the low ones
```

Cap daily **cognitive load** even for high declared hours. A completable core +
optional extra beats one impossible list. Completion probability, not completion
speed, is the objective.

---

## 7. Adaptive personalisation — the moat (Issue 10)

Fixed assumptions are a commodity; learning the student is not. After ~15–20
logs, the engine can know: *this* student takes ~11 min/Geometry question, ~5
min/Arithmetic, struggles with RC inference, is strongest 8–10 PM, fades on
weekday nights. Then the plan is built on **their** real pace and energy, not a
prior. No coaching institute personalises at that resolution. Sequence: ship
sensible priors (§2) → log actual per-topic time → converge each student to their
own numbers → eventually predict completion probability per task and size to it.

---

## 8. The engine, restated

**Inputs:** sustainable focused hours (hard constraint) · exam date (fixed) ·
desired completion date (soft) · persona (fresher/repeater/working/full-time) ·
phase (learn/practice/revise/mock) · topic complexity (learn/practice/revise
cost) · **learned** historical pace · historical completion rate · fatigue
patterns (time-of-day, weekday/weekend).

**Objective (replaces "fit questions into hours"):**
> Given this student's real capacity and energy today, what is the highest-value
> work they can realistically *finish* — preserving motivation and maximising
> long-term percentile?

**Output:** a completable core plan in natural units, phase- and energy-aware,
capped for motivation, with optional extra — and a *date that told the truth*.

---

## 9. Priorities

- **P0 — Trust.** Capacity is the hard constraint; the date negotiates. Explicit
  reality-check + red warning (shipped). Collapse to one date source (remaining).
  Capture working-professional status reliably.
- **P1 — Planning intelligence.** Replace flat 3-min with the phase × unit ×
  topic pace matrix (§2b–c). Plan RC/DILR in passages/sets. Cap daily cognitive
  load (§6). Match task type to energy/fatigue (§2d).
- **P2 — Personas.** Distinct strategies for fresher / repeater / working /
  full-time (§3–4) — different task mix, revision timing, copy.
- **P3 — Adaptive moat.** Learn per-student pace, completion, fatigue; no two
  students get the same plan after a few weeks (§7).

---

## 10. What to validate before touching each number

Everything above is a *prior*. Before shipping any constant, check it against our
own data: logged study-duration vs tasks completed (real focused-hours per
persona), time-between-log and completion rate (fatigue/adherence), per-topic
completion rates (learning-cost reality), and mock-score deltas vs task mix
(what actually moves percentile). The engine earns the right to its numbers by
measuring them — that is the difference between a scheduler and a coach.
