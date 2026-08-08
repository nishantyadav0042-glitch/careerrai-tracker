# The CareerRai Planner — research, philosophy, and a new model

**8 Aug 2026. Design document. No code, by instruction.**

The audit (`STUDY-PLAN-AUDIT-2026-08.md`) is taken as correct and is not
re-litigated here. This document answers a different question: *if CareerRai
launched today, how should the planner work?*

---

# PART 1 — RESEARCH FINDINGS

## 1.1 What the CAT ecosystem actually does

Reading across the coaching institutes, the content-first players, and the
self-prep community, the structures converge on a small number of shapes.

**Every serious system is phase-based, and the phases are defined by the
calendar, not by the student.** The near-universal shape is *Foundation →
Application → Test-taking*, roughly 40% / 35% / 25% of the available months.
Career Launcher's published mock cadence is the clearest artefact of this: one
mock per fortnight in months 1–3, weekly in months 4–5, twice weekly in the
final two months. The escalation is the plan. Nobody runs a flat schedule.

**Coaching plans are calendar objects, not queues.** TIME/IMS/CL hand a
student a printed schedule with dated slots — this class on this day, this
module by this week. The plan exists in full before day one. It is a
*commitment*, and its most valuable property is that a student can look at it
in July and see what happens in October.

**Mocks are the spine, not a task.** Across every institute and nearly every
topper account, the mock calendar is fixed first and content is arranged
around it. 20–25+ mocks is the common floor. Crucially, mocks are treated as
*diagnostic instruments that redirect study*, not as a box to tick — the
analysis is where the value is, and toppers consistently describe an error
log/notebook as their central artefact.

**The content-first players (2IIM, Cracku, Rodha) sequence by concept
dependency, not by weightage.** Their sequencing is pedagogical: arithmetic
before algebra before geometry, because the later material is unintelligible
without the earlier. Weightage informs *how much time*, never *what order*.

**The community's most repeated success pattern is deliberate scope
reduction.** This is the finding that most challenges our current design.
Documented 99+ percentile journeys include students who prepared in ~75 days
by concentrating on roughly 15 high-yield topics, mocks, and relentless
revision. The 99.99 percentile account that circulates most widely is
explicitly a short, narrow, high-intensity campaign — not full syllabus
coverage.

**Nobody promises full syllabus completion.** Coaching promises *coverage of
the course*; toppers describe *coverage of what matters*; no credible source
claims a student must master all ~46 CAT topic units to hit 99+.

## 1.2 What every one of them gets wrong

**The plan is identical for everyone.** A printed institute schedule cannot
know that a student already knows arithmetic or has three hours instead of
eight. Personalisation is delegated to the student, who is the person least
equipped to do it.

**The plan has no memory.** A missed week is the student's problem. Nothing
recalculates; the schedule simply becomes fiction, and the student is left
holding a document that now accuses them.

**Revision is asserted, not scheduled.** Every plan says "revise regularly."
Almost none of them place revision on a date tied to when the topic was
learned. Revision is the first thing to be crowded out and the last thing to
be measured.

**Completion is undefined.** "Finished Arithmetic" means whatever the student
decides it means. Without a definition, a student cannot know if they are
ready, so they either over-study a comfortable topic or declare victory too
early — and the app has no basis to disagree.

**Feedback loops are slow.** A mock every fortnight is a 14-day loop on the
question "is my study working?" Everything between mocks is unmeasured.

## 1.3 What students repeatedly complain about

Synthesised across community discussion, topper interviews, and our own
students' words (which we have on record):

1. *"I made a timetable and never followed it."* The single most common
   sentence in CAT prep.
2. *"I don't know what to study today."* Decision fatigue at the start of
   every session.
3. *"I studied for months and forgot everything."* Revision failure, felt as
   personal failure.
4. *"I keep doing the topics I like."* Comfort bias — and note that a greedy
   scorer reproduces exactly this pathology mechanically.
5. *"My mocks aren't improving."* No connection between what they study and
   what mocks measure.
6. *"I fell behind and gave up."* A plan that cannot absorb a bad week
   destroys the student rather than bending.
7. *"I don't know if I'm on track."* No trustworthy completion signal.

Our own audit shows CareerRai currently reproduces #4 mechanically and #7
structurally, while solving #1, #2 and #6 well. That is the honest scorecard.

---

# PART 2 — LEARNING SCIENCE

## 2.1 How humans actually learn

**Retrieval beats review.** The testing effect is among the most replicated
findings in cognitive psychology: attempting to recall material produces
substantially better long-term retention than re-reading it, even when
re-reading feels more productive. *Implication: a plan built from "study X"
blocks is weaker than one built from "attempt X, then check" blocks — and the
feeling of fluency while reading is actively misleading.*

**Spacing beats massing.** The same total time distributed across days
produces markedly better retention than the same time in one block. The
forgetting curve is steep and early; each successful retrieval flattens it and
extends the next safe interval. *Implication: a topic must return on a
schedule derived from when it was last successfully retrieved — not when it
happens to win a scoring contest.*

**Interleaving beats blocking.** Mixing problem types within a session
produces worse practice performance and better transfer — precisely the
discrimination skill CAT tests, where the hard part is often recognising which
technique applies. *Implication: mixed sets should increase as the exam
approaches, and the plan must be willing to feel harder in order to be
better.*

**Desirable difficulty is the mechanism behind all three.** Conditions that
slow acquisition and feel worse often improve retention and transfer. A
planner that optimises for the student's comfort optimises against their
outcome. *Implication: an engine tuned purely on "did they complete it" will
drift toward easy work.*

**Mastery learning works, and its cost is time.** Bloom's structure — don't
advance until a criterion is met — produces large gains, and its known failure
mode is that mastery time varies enormously between students. A system that
demands mastery without a time budget will strand slow learners mid-syllabus.
*Implication: mastery gates must coexist with a deadline, and something must
give when they conflict. Deciding what gives, in advance, is the planner's
central job.*

**The Zone of Proximal Development sets the difficulty target.** Work should
sit just beyond independent capability. Too easy is wasted; too hard is
abandoned. *Implication: difficulty is a planning variable, and today we have
none.*

## 2.2 How humans forget

Forgetting is exponential and fast without reinforcement, and it is *content
dependent*: an abstract technique decays faster than a well-practised
procedure. Retrieval failure is mostly a retrieval-access problem, not
erasure — which is why a single well-timed review restores far more than its
cost.

The practical consequence for a 100+ day syllabus is stark: **a topic learned
in month one and never revisited is functionally not learned by exam day.**
Any planner that measures "topics touched" without modelling decay is
measuring an illusion. Our own completion ring currently measures exactly
this.

## 2.3 How humans finish long syllabi

From the systems that demonstrably get people through long curricula —
Anki/SuperMemo, Khan Academy mastery, Duolingo:

- **Scheduling is automatic and non-negotiable.** The learner never decides
  what is due; the system does. Removing the daily decision is most of the
  value.
- **Work-in-progress is capped.** Anki limits new cards per day. Khan gates
  progression. Duolingo locks units. Unlimited simultaneous fronts is the
  reliable way to finish nothing.
- **New material is rationed, not maximised.** Every one of these systems
  deliberately *slows* the introduction of new content to protect the review
  load. Their scarce resource is not content — it is the student's future
  attention, which every new item mortgages.
- **The finish line is defined by the system, not the learner.**
- **Progress is visible and monotonic.** The learner can always see the whole
  and where they are in it.

---

# PART 3 — PRODUCT RESEARCH (how great systems choose "next")

The common architecture across Spotify, Netflix, Chess.com, Duolingo, GitHub
and Linear is that **none of them use a single score to pick one item.**

**They allocate slots to sources, then fill each slot.** Spotify's home is
rows with different jobs — familiar, new, contextual. Netflix composes a page
from distinct candidate generators. The user experiences one screen; the
system ran several policies and blended them. *A single argmax cannot produce
a balanced experience, and this is the structural reason our planner
degenerates.*

**They enforce exploration explicitly.** Discover Weekly exists because pure
relevance-maximisation collapses into a comfortable loop. Exploration is a
budgeted slot, not an emergent property.

**They cap difficulty volatility.** Chess.com matches near your rating: hard
enough to matter, not hard enough to break you.

**They model the long game.** Duolingo's unit path is a committed curriculum;
the daily lesson is a *view onto it*, never an independent decision. This is
the single most transferable idea in this section: **the day is a rendering of
the plan, not the plan itself.**

**They make state visible.** GitHub's contribution graph and Linear's cycle
burndown work because the user sees the whole and their position in it — which
is what makes falling behind actionable rather than shameful.

---

# PART 4 — THE TRUE OBJECTIVE

The current planner optimises *"the best topic for today."* That objective is
wrong — not badly tuned, wrong in kind. It is a greedy local objective
standing in for a global one, and greedy local objectives on a fixed horizon
are exactly how you arrive at 13 topics in 365 days.

**What CareerRai should optimise:**

> **Maximise the student's expected CAT performance, subject to hard
> constraints on time, honesty, and the student's own commitments — and make
> the plan's promise mathematically keepable.**

Decomposed, in strict priority order:

1. **Feasibility (hard constraint).** Never present a plan that cannot be
   completed in the time available. If scope exceeds capacity, cut scope
   openly. A plan that is arithmetically impossible is a lie regardless of how
   good each day looks.
2. **Retention over exposure.** Optimise for what is *retrievable on exam
   day*, not what was once touched.
3. **Marginal percentile per hour.** Among feasible options, prefer work with
   the highest expected score impact — high-weightage topics, mock analysis,
   weak-area repair.
4. **Consistency (enabling constraint).** A plan that is abandoned scores
   zero. Load must stay inside what the student can actually sustain.
5. **Trust (enabling constraint).** Every number shown must be true and every
   task explainable. Trust is the substrate; without it the other four never
   get the chance to compound.

**These coexist through a lexicographic hierarchy, not a weighted sum.**
Feasibility is never traded against relevance. Retention is never traded for a
completion-percentage number that looks nicer. Weighted-sum thinking is what
produced a scorer where "revising Percentages" beats "never opened Linear
Equations" by half a point.

**The honest resolution of the coverage question.** Research shows full
syllabus coverage is *not* required for 99+; deliberate narrowing is a proven
strategy. So the answer is not "teach all 46 topics no matter what." It is:

> **The planner commits, in advance and in writing, to a named scope it can
> actually finish — and teaches all of it.**

For a student with 8 hours and 300 days, that scope is everything. For a
student with 1.5 hours and 60 days, it is perhaps 15 units, chosen
deliberately by expected marks, and the student is *told* what was left out
and why. Today's engine performs this triage accidentally, silently, badly (it
drops Logarithms and Progressions by scoring accident, not by decision), while
displaying a completion ring implying full coverage. **The defect is not the
narrowing. It is the dishonesty and the arbitrariness of the narrowing.**

---

# PART 5 — CHALLENGING EVERY ASSUMPTION

| Assumption | Verdict | Reasoning |
|---|---|---|
| Weightage should drive topic choice | **Rejected as a selector** | Weightage should size the *time budget* for a topic, never repeatedly re-select it. Its misuse as a selector is the audit's root cause |
| Weak section first | **Kept, reframed** | Weakness should get more *depth and repetition*, not the right to consume the calendar. Weak areas must never delay first contact with unseen topics |
| Highest score wins | **Rejected** | Argmax over a static score is a fixed point. The winner keeps winning; that is the mathematical form of the bug |
| Greedy daily selection | **Rejected outright** | The day must be a rendering of a plan, not an independent decision |
| One topic per section per day | **Rejected** | Sections have different shapes. VARC needs daily reading; QA needs deep single-topic blocks; DILR needs set variety. A uniform 1/1/1 is a UI convenience masquerading as pedagogy |
| Hours are proportional to task size only | **Rejected** | Hours must buy *progression* — more hours means moving through scope faster, not just longer questions in the same topic |
| Fixed revision cadence per topic | **Rejected** | Cadence must expand with each successful retrieval, per the forgetting curve. A fixed cadence over-revises the solid and under-revises the fragile |
| Section balance every day | **Rejected as a daily rule** | Balance belongs over a *week*, not a day. Daily balance forces thin slicing and prevents deep work |
| Completion = self-reported status | **Rejected** | Completion must require evidence. Self-assessment correlates weakly with ability, and worst for the weakest students |
| The plan is generated fresh each day | **Rejected** | A plan a student cannot see in advance is not a plan; it is a slot machine |
| Falling behind should move the date | **Kept, extended** | Correct and humane, but it is only one of three levers. Alone, it eventually walks into the exam wall |
| Mocks are a task inside a day | **Rejected** | Mocks are calendar events with a fixed escalating cadence, and they own their days |

---

# PART 6 — THE CAREERRAI PLANNING PHILOSOPHY

Twenty non-negotiable principles.

**On the shape of the plan**

1. **The plan exists before the day does.** A student can always see their
   whole journey — every week from today to the exam. The daily card is a
   rendering of that plan, never an independent decision.
2. **The planner plans backwards from the exam, not forwards from today.**
   Mock dates, the revision lock, and the scope commitment are placed first;
   learning fills the space that remains.
3. **Scope is a commitment, made once, in writing.** At plan creation the
   system names exactly which topics it will teach, sized to fit real
   capacity, and shows what it excluded and why.
4. **Completion must be mathematically guaranteed.** If the student follows
   the plan, the committed scope finishes before the deadline. If that cannot
   be true, the scope is wrong and must be cut before the plan is shown.
5. **The plan must be legible a month out.** "What will I be doing in the
   first week of October?" must have an answer today.

**On progression**

6. **Every committed topic has a scheduled first-contact date.** No topic can
   be crowded out by a scoring accident. First contact is a calendar
   guarantee.
7. **A student never goes more than three days without new material.**
   Progress must be *felt*. Three days of only revision reads as a stall.
8. **All first contact completes in the first 60% of the calendar.** The final
   40% is consolidation, revision and mocks. Meeting a topic for the first
   time in the last month is a planning failure.
9. **Work-in-progress is capped at two topics per section.** Nothing new opens
   until something closes. Unlimited simultaneous fronts is the reliable way
   to finish nothing.
10. **Hours buy progression, not just volume.** More hours per day must
    advance the student through scope faster. Two students with identical
    profiles and different hours must have visibly different journeys.

**On memory**

11. **Revision is scheduled, never selected.** A taught topic returns on a
    date derived from when it was last successfully retrieved, expanding with
    each success and contracting after each failure.
12. **Revision is capped at 40% of any day before the lock, and is never
    zero after week two.** It may not crowd out new learning, and new learning
    may not starve it.
13. **A topic is never "done" — it moves to maintenance.** Completion means
    "in the retention system," not "removed from the plan."
14. **Retrieval, not review.** Revision blocks are always attempt-then-check,
    never re-read.

**On measurement**

15. **Mastery requires evidence, not a feeling.** Status may advance on
    self-report through the working stages, but the final rung is earned only
    through demonstrated accuracy at difficulty. Self-assessment is weakest
    exactly where it matters most.
16. **The progress number must be able to reach 100%, and must mean one
    thing.** A ring that cannot close is a promise the product cannot keep.
17. **Mocks are the exam clock and own their days.** The cadence escalates —
    fortnightly, then weekly, then twice weekly — is placed before any
    learning is scheduled, and every mock is followed by a scheduled analysis
    block. A mock without analysis is not counted.

**On resilience and trust**

18. **The plan degrades in a fixed, published order: absorb, then extend,
    then cut scope.** Buffer days are spent first; then the finish date moves;
    only when the exam wall is reached does scope get cut — announced, never
    silent.
19. **Missing days changes the plan, never the student's hours.** The student
    owns their hours. We own the consequence.
20. **Every task must answer "why this, today?" in one sentence a student
    would accept from a human mentor.** If the honest answer is "it scored
    highest," that is not an answer.

---

# PART 7 — THE NEW PLANNING MODEL

*Presented as I would to you across a table.*

## The one-sentence idea

**Stop picking today's topic. Start building the student's calendar to the
exam, and let today be a page of it.**

## Three clocks, not one score

The failure of the current engine is that a single scorer must serve three
irreconcilable jobs: teaching new material, protecting old material, and
preparing for the exam format. Those jobs run on different clocks and must
never compete in the same contest.

**Clock 1 — The Syllabus Clock.** Marches through committed scope. Its
guarantee: every committed topic gets first contact by its scheduled date. It
never re-selects a topic it has already opened; that is the memory clock's
job. This clock alone makes 33-untaught-topics structurally impossible.

**Clock 2 — The Memory Clock.** Owns everything already taught. Each topic
carries a next-due date, expanding on success, contracting on failure. It
never decides *what to learn* — only *what must come back today*.

**Clock 3 — The Exam Clock.** Owns mocks, sectionals and analysis on a fixed
escalating cadence anchored to the exam date. It is placed first and does not
negotiate.

**A day is an allocation across three clocks, not a winner among topics.**
Early in the journey a day might be 70% syllabus, 20% memory, 10% exam. By
October it inverts. The allocation curve is a product decision we can draw on
a whiteboard and defend — and a student can see it.

## Capacity and scope: the honest arithmetic

Before showing any plan:

- **Capacity** = hours per day × days to deadline, minus a buffer for real
  life (~15%), minus the exam clock's fixed cost.
- **Demand** = the hours of the topics we intend to teach, plus the revision
  load they will generate, plus analysis time.

If demand exceeds capacity, the planner **cuts scope by expected marks per
hour until it fits**, and shows the student the excluded list. "With 1.5 hours
a day and 60 days, here are the 15 topics that will earn you the most. These
18 are out. If you can find 30 more minutes a day, four of them come back."

That conversation is the product. It is also the most honest thing we could
say to a student, and no coaching institute says it.

## What a day looks like

Same three-to-four tasks the student sees today, but each is drawn from a
named clock with a real calendar reason:

- *"New — Linear Equations. First of three sessions. On your plan for today
  since 12 August."*
- *"Due — Percentages. Learned 9 days ago; this is its second retrieval."*
- *"Mock analysis — Sunday's sectional. Three error types to log."*

Identical surface to today's card. Completely different underlying promise.

## Recovery, in a fixed order

Miss three days and the planner spends buffer — the student may not even
notice, which is correct. Miss a week and the finish date moves, with the
arithmetic, once, on Sunday (this already works and should be preserved
exactly). Miss three weeks and the exam wall is close: the planner cuts scope
and says so — *"To still be ready by 29 November, I've removed Logarithms,
Base Systems and Binary Logic. They were worth about 4 marks. Here's what
remains."*

Three levers, published order, always announced. A student can survive a bad
month without losing the plan.

## Personalisation, honestly scoped

- **Hours** set capacity → set scope → set march rate. Hours become the most
  consequential input rather than a cosmetic one.
- **Deadline** sets the whole calendar.
- **Existing coverage** removes topics from scope and seeds the memory clock.
- **Weak section** buys depth: more sessions per topic, tighter revision, more
  mock analysis time — never a longer calendar.
- **Archetype** shapes the shape of days (lean weekdays, heavy weekends).
- **Coaching timetable** overrides the march order — we teach what class
  taught today and reorder the rest around it. This already works and is our
  strongest differentiator.

## What we keep

Not a rewrite of everything. Explicitly preserved: the daily card's tone and
legibility, the "one number, one owner" hours rule, the weekly date-extension
engine (correct at every hours setting), the coaching-timetable override, the
never-delete-always-postpone promise, the honest check-in with rest days, and
the deterministic no-LLM daily generation.

**The change is architectural, not cosmetic: from a scorer that answers "what
is best now?" to a calendar that answers "what must happen between now and 29
November, and what is today's page of it?"**

---

# PART 8 — WHY THIS SOLVES THE PROVEN FAILURES

| Audit finding | Why the new model removes it |
|---|---|
| **13 of 46 topics in a year** | The syllabus clock never re-selects an opened topic and every committed topic has a first-contact date. Repetition of a taught topic is structurally impossible — it belongs to a different clock |
| **33 topics never taught** | Scope is committed in advance. A topic is either in scope with a date, or explicitly excluded and shown to the student. There is no third state |
| **1.5h and 12h identical** | Hours determine capacity, which determines scope size and march rate. Different hours produce visibly different calendars, by construction |
| **Target date ignored** | The deadline is the first input to the whole plan. Every other decision derives from it |
| **Ring can never reach 100%** | Completion is measured against *committed scope*, which is finite and reachable. "Maintenance" is a state within completion, not an unfinished remainder |
| **Mocks priced but never scheduled** | The exam clock places mocks on the calendar before learning is scheduled, and each carries its analysis block |
| **Revision-stage students get nothing** | A student with everything taught has an empty syllabus clock and a full memory clock — their days become revision plus mocks, which is exactly correct for them |
| **15% daily overshoot** | The day is an allocation of a fixed budget across three clocks. Allocations sum to the budget; nothing is appended after the fact |
| **"Ahead" while unable to finish** | Feasibility is checked at plan creation. "On track" means "the committed scope finishes by the deadline," which is a statement the system can actually prove |
| **Comfort-bias topic repetition** | Exploration is not emergent; the march is scheduled. The engine cannot develop a favourite |

## The mathematical claim

The current planner is a greedy argmax over a static scoring function.
Because coverage points (2–30) cannot overcome weightage points (8–40), the
argmax has a **fixed point**: once the highest-weightage topics are opened,
they remain the maximum forever. Thirteen topics is not a tuning failure; it
is the fixed point of that function. No coefficient change removes it —
only a different structure does.

The proposed model replaces argmax with **a scheduled march plus a due-date
queue plus a fixed calendar**. Completion is then a scheduling problem with a
feasibility check, not an emergent property of a scorer. If capacity ≥ demand,
completion is guaranteed by construction. If capacity < demand, the system
reduces demand *before* showing the plan, and says so.

**That is the difference between hoping a student finishes and knowing they
will.**

---

## What I need from you before any of this is built

Three product decisions only you can make:

1. **Is deliberate scope reduction acceptable as a product behaviour?** The
   research says it is how people actually crack CAT in limited time. It
   means the app will sometimes say "you cannot do all of it — here is what to
   drop." I believe this is our most trustworthy possible moment. It is also
   the biggest departure from what coaching sells.
2. **Where is the revision lock?** The date after which no new topic is ever
   introduced. I'd argue ~60% of the calendar, or 1 October for a November
   exam, whichever is earlier.
3. **How visible should the full calendar be?** Showing the whole journey is
   the strongest trust artefact we could build — and the strongest commitment
   device. It also means a student can see us fail.

---

*Sources consulted for Part 1 include published institute preparation
frameworks and mock cadences ([Career Launcher](https://www.careerlauncher.com/cat-mba/cat-preparation/),
[IMS](https://www.imsindia.com/blog/cat/cat-preparation/)) and documented
topper journeys and strategies ([Careers360 topper interviews](https://bschool.careers360.com/articles/cat-2024-topper-interview-sahil-gupta-99-77-percentiler-tips-strategy-preparation-journey),
[TestFunda last-75-days strategy](https://testfunda.com/blog/cat-2025-last-75-days-preparation-strategy/),
[a 99.83 percentile account](https://dipakagrawal.substack.com/p/how-i-scored-9983-in-cat-2023-and)).
Learning-science claims are drawn from the established literature on the
testing effect, spacing and the forgetting curve, interleaving, desirable
difficulties, Bloom's mastery learning, and the scheduling designs of
Anki/SuperMemo, Khan Academy and Duolingo.*
