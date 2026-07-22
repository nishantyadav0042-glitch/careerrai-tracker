# CareerRai Learning Intelligence Graph — the next leap (strategy, not a build order to rush)

> This document sits ABOVE the LIS architecture spine
> (`LEARNING-INTELLIGENCE-SYSTEM.md`). The spine describes the 10 planning
> engines that are built. This describes the **strategic evolution** from a very
> good adaptive planner into a self-improving learning-intelligence graph — and,
> just as importantly, **what NOT to build yet and why.**
>
> Written after the founder's Engine 1–10 memo. It adopts the parts that are
> right, re-sequences the parts that are premature, and — per the founder's own
> discipline — refuses to invent a single number. Every engine here ships with a
> **validation test**: the evidence that would justify it, generated from our own
> users, never borrowed from a benchmark.

---

## North star

CareerRai should not become the company with the smartest study planner. It
should become **the company with the largest continuously-improving learning-
intelligence graph for CAT aspirants.** The planner is one *application* of the
graph. The graph — and the feedback loops that refine it — is the durable asset.

The engine today answers *"what should this student do today?"* The next version
answers *"why exactly this? how confident are we? what evidence? did it work? if
not, what changed?"* That is the difference between an **adaptive** system and a
**self-improving** one.

---

## The one change that reorders everything — the objective function

Today the system implicitly optimises something completion-shaped. We redefine
the objective, formally, for every engine to serve:

```
maximise   Expected Percentile Gain
subject to Sustainable Capacity   (Capacity Engine — already a hard constraint)
           Behaviour over input   (believe logs, not onboarding — already true)
           Confidence             (a student who believes they're weak quits)
           Retention              (learning that decays is not gain)
           Consistency            (the #1 student constraint; protect it above all)
```

This is a **definition, not a feature** — free to adopt, and it silently
re-ranks every downstream decision. Every engine below must state how it moves
this objective. If it doesn't, it's mis-scoped.

---

## Three principles that govern the whole roadmap

### 1. The moat is calibrated parameters + captured loops — NOT engine code
A competitor can copy a six-dimension knowledge model in a few months once they
see it. What they cannot copy is our students' accumulated longitudinal outcomes
and the parameters learned from them — real per-topic decay rates, real
ROI-per-topic, real confidence→retention coefficients. **Therefore the urgent
priority is not "build the smart engine" — it is "capture the outcome data now,"**
so calibration can begin the moment we have volume. Instrumentation of outcomes
is worth more today than any single reasoning engine.

### 2. Derive, don't survey (the friction constraint the memo missed)
Six dimensions per topic implies richer capture — which collides with our hardest
discipline: the 15-second log, and the fact that **consistency is the #1 student
constraint** (a zero-log incident already proved friction kills logging). So the
knowledge graph must be assembled almost entirely from **passive / derived**
signals — mock question-level accuracy and timing, timed-drill outcomes, the
confidence taps we already collect — and ask an explicit question ONLY when the
marginal signal clearly outweighs the friction. This constraint changes how
Engine 1 is built: it is a measurement problem, not a survey problem.

### 3. No invented numbers — every engine ships with a validation test
We never claim "confidence increases retention by 42%." We define the metric,
instrument the product, and let CareerRai generate the number from its own data.
Each engine below names the falsifiable test that would prove it earns its place.

---

## Milestone Zero — the cheap experiment that validates or kills the thesis

Before betting the roadmap on Knowledge State, run the test:

> **Does a Knowledge-State score predict mock performance better than syllabus
> completion does?**

Compute both for students with mock history; correlate each against actual mock
section scores. If Knowledge State wins, the thesis is proven — build with
conviction. If it doesn't, we learned it for the cost of one analysis instead of
a year of engineering. **This is the first thing to run, ahead of any build.**

---

## The tiers — honestly gated on data, not on ambition

Ambition is not the gate; **data volume and capture-readiness** are. Building a
pattern-mining engine at n≈169 doesn't create IP, it manufactures false
certainty. The sequence protects against that.

### Tier 0 — Adopt the objective function
Reframe. Free. Do it first. (Section above.)

### Tier 1 — The data foundation (build + instrument NOW; everything compounds here)

**Engine 1 — Knowledge State (highest priority).**
Replace `completed` with a per-topic, per-student state carrying up to six
independent 0–100 dimensions: **Understanding · Application · Speed · Accuracy ·
Retention · Confidence.** Start by computing ONLY the dimensions we can honestly
measure today (Confidence from existing taps; Accuracy/Speed from mock and
timed-drill data where it exists); leave the rest explicitly *null* until
evidence arrives — a null is honest, a guessed 50 is not. Build it by derivation
(Principle 2), not new surveys.
*Validation:* Milestone Zero — predicts mock performance better than completion.

**Engine 1b — Mastery / Topic Progression (the "topic is a journey, not a checkbox" insight).**
Source: a real student — *"SI doesn't finish today; tomorrow CI, then practice, then
medium, then hard. A DILR/Quant chapter takes 3–4 days each. So plan accordingly."*
The unit of learning is **not the topic** — it's the student's **position inside the
topic's journey**. The planner today asks "what topic next?" and frames each task as
"Learn X" (a false one-day finish). It must instead ask **"what is the next mastery
milestone inside the current topic?"** and never move on until the state actually
advances.
- **FIVE simple rungs** — `Concept → Easy → Medium → Hard → Exam Ready` — mapping 1:1
  onto the 5 coverage states already stored, so v1 needs no schema. The difficulty
  ladder is a QUANT idea: **QA** uses it fully, **DILR** loosely (set-worded: Concept →
  Easy sets → Moderate sets → Hard sets → Exam Ready), and **VARC has NO ladder** —
  reading/inference/timing isn't easy-medium-hard, so it keeps its own phrasing. NOT 10
  hand-authored states × hundreds of topics (a content mountain that would never ship).
- **This is one engine, not three.** Mastery/Progression is the *data model* (where in
  the journey); the **Mission** is its *presentation* (today's single winnable objective
  with a success criterion — "recognise when SI applies + 5 easy Qs; ignore the hard ones").
  Knowledge State (Engine 1) is the complement: Mastery = *where*, Knowledge State = *how
  well*. Do not build "Topic Progression" + "Mission" + "Learning Journey" as separate
  engines — that ships none.
- **We are ~40% there already:** `topic_coverage.status`
  (`not_started→learning→practicing→revising→exam_ready`) is a real 5-state lifecycle in
  the DB, and the daily log already captures partial progress (half/full). The gap is
  that the planner reasons about topics not states, and the copy hides the journey.
- **Objective it serves:** *end every session with a felt sense of progress* — completion
  psychology → momentum psychology. Task copy shifts from "12 questions (fail if you miss
  4)" to a mission with an achievable success criterion; a per-topic progress bar makes
  mastery visible; logging is ONE tap that maps to a stage (never a checklist — friction
  is the enemy of consistency, our #1 constraint) and the plan **resumes, never restarts**.
- **Discipline (where the essay over-reaches):** ship the FELT version first (mission +
  progress bar + resume + multi-day continuity — all mostly copy + light logic on the
  engine we have, and student-visible immediately because it's the task text), PROVE it
  lifts consistency, THEN add mastery-% math, completion-probability, per-struggle
  forgetting. The ₹-value is captured by shipping the feeling fast, not by perfect
  modelling before a single student sees it.
*Validation:* students on mission-framing finish more sessions "successfully" and log
more consistently than on the old topic framing.

**Evidence + Trust layer (Engines 5 + 8, merged).**
One first-class `evidence` object on every recommendation: why, the numbers
behind it, confidence, trade-offs. Mostly already latent in the Constraint/
Decision engines — formalise and surface it. Cheap, compounds trust immediately.
*Validation:* recommendations with visible evidence are accepted/acted-on at a
higher rate than bare ones (measure acceptance).

**Outcome instrumentation (the seed for Tier 3 — do this now regardless).**
Log every recommendation the system makes together with what happened next
(completed? accuracy after? confidence change? still here in 14 days?). This is
the training data for the forgetting, ROI, confidence, self-learning and
experimentation engines. **Not building it now forfeits moat that can't be
back-filled.**

### Tier 2 — The reasoning upgrades (build once Tier 1 produces data)

**Engine 3 — ROI (the "smarter than coaching" one).**
`Expected percentile gain ÷ hours required`, horizon-aware — so a topic gets a
different answer at 140 days vs 25 days. Ship v1 on **defensible priors**
(CAT weightage × knowledge-state gap × improvability ÷ estimated hours) and let
real percentile-impact numbers replace the priors as mock data accrues. This is
what most directly operationalises the new objective function.
*Validation:* an ROI-ranked plan produces larger percentile gains than the
current weakest-section-first baseline (compare cohorts once powered).

**Engine 4 — Confidence.**
Topic / mock / overall confidence + momentum + frustration as first-class state
that reshapes *today's plan because psychology changed, not syllabus.* The raw
signals mostly exist (confidence taps, energy, plan_fit, emotional chips) — the
work is aggregation + letting it modulate the Decision. Pull forward because it's
cheap and behaviourally powerful, but earn every retention claim from data.
*Validation:* confidence state predicts near-term drop-off (does "frustration
high" precede a silent week?).

**Engine 2 — Forgetting.**
Per-knowledge-type decay (formula recall fades faster than reasoning patterns;
recently-corrected mistakes are gold to revisit), predicting *which topics are
most at risk* instead of revising on a fixed cadence. Upgrades existing revision
logic; start on principled priors, calibrate per-student as retention re-tests
accrue.
*Validation:* the model's "at-risk" topics show measurably lower accuracy on
re-test than topics it deprioritised.

### Tier 3 — Self-improvement (gated on VOLUME; scaffold now, run at scale)

**Engine 9 — Founder Intelligence (build incrementally now — low risk).**
Extend the LIS Health readout toward diagnostic/causal questions: which topic
creates highest dropout, which recommendation improves completion, which persona
needs most intervention, which assumptions failed this week. This is how we *know*
Tier 2 works, so it earns early incremental investment.

**Engine 10 — AI Memory.**
Per-student longitudinal patterns ("burns out after mock week → pre-empt it").
The lightweight version is just persistence of Knowledge/Confidence state (Tier 1
already gives this); the pattern-detection version is medium-term.

**Engine 7 — Experimentation.**
Scaffold the assignment + outcome logging NOW (it rides on Tier 1's outcome
instrumentation), but **do not run live variant tests until n and effect sizes
can power them.** Running underpowered experiments is worse than none.

**Engine 6 — Self-Learning (LAST, and only at scale).**
Emergent-pattern discovery across the graph. Genuinely differentiating — and
genuinely harmful early: at small n it overfits noise into confident false rules.
Its prerequisite is not code, it's the years of captured outcome loops from
Tier 1. Build it when the data can carry it, not before.

---

## What NOT to build yet — and say so out loud (no silent caps)

- **Self-Learning / live Experimentation at current scale** — would overfit ~169
  students. Instrument the loops; defer the inference.
- **Six fully-populated knowledge dimensions on day one** — populate what we can
  measure; leave the rest null. Precision we can't justify is a liability.
- **Any published coefficient** ("X improves Y by Z%") until it's derived from our
  own users.

---

## The sequence in one line

**Adopt the objective → prove Milestone Zero → build Knowledge State + Evidence +
outcome capture → then ROI + Confidence + Forgetting → then, at scale, the
self-improving layer.** The planner was the application. The graph, and the loops
that refine it, is the company.
