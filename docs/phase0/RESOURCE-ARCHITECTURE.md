# Resource Architecture — locked

**31 August 2026.** Founder decision record. This is the standing model; the
rollout docs describe how we get there.

---

## The rule

> **Never attach a resource merely because it exists. Attach a resource because
> its format matches what the student is being asked to do.**

| The task says | The resource must be |
|---|---|
| Learn this | concept video / article |
| Understand how this is solved | worked-example video |
| Solve 15 questions | question bank |
| Solve 3 DILR sets | DILR set bank |
| Revise this topic | revision resource |
| Get exam-ready | timed / hard practice |

A good video that solves 20 questions does not turn a practice task into a
watching task. It is eligible for concept, worked example or solution review —
never for the practice rung.

And its corollary: **a missing resource is acceptable, a wrong one is not.** A
topic with no verified link shows no row and the task runs exactly as today.

---

## Three layers, deliberately separate

This separation is the whole architecture, and conflating any two of them is
what produced every defect found today.

**A. Student's learning state — the engine's truth. Do not change.**
```
not_started → learning → practicing → revising → exam_ready
```
Stored in `topic_coverage`, declared once in `coverage-status.ts`, ranked by
`STATUS_ORDER`. No new status. That module's own header records that five copies
of this ladder once existed and that is how ranking silently broke.

**B. Task intent — what this task is asking for.**
```
concept | worked_example | practice | revision | exam_practice
```
This is the layer that was missing. `ResourceIntent` today is
`concept | practice_easy | practice_cat | exam_ready`, which mixes format with
difficulty and is why a video ended up in a practice slot. The mapping:

| today | becomes | why |
|---|---|---|
| `concept` | `concept` | unchanged |
| `practice_easy` | **`worked_example`** | these were never practice — a teacher solving examples |
| `practice_cat` | `practice` | becomes a question resource, not a video |
| `exam_ready` | `revision` / `exam_practice` | split by what the task asks |

**This gives the 48 parked videos a proper home.** The re-grade found 48 videos
that demonstrably solve questions on screen and were mislabelled as practice.
They are `worked_example`, and they are Stage 2's inventory — not waste.

**C. UI language — what the student reads.**
```
Concept Learning | Concept Mastery | Practice | Revision | Exam Ready
```
`STATUS_LABEL` is already a separate display map, so `learning` reads
**"Concept learning"** with no schema risk. The student gets the four-stage
mental model; the database keeps its five states.

---

## What "verified" currently means — and what it does not

The hard gate is right: *verified means actually verified, not "an AI said it
was good."* So here is exactly what today's verification establishes, stated
plainly, because the word is about to carry weight.

**What vidIQ proved, for all 40 primaries:**
- the video exists (a direct id lookup; absence is refutation)
- its real title, channel, runtime, upload date, view count
- **the publisher's own title names the topic** — 40/40 pass

That last check is a genuine relevance gate and it is the one that would have
caught a wrongly-shelved video. Three apparent failures — Mixtures, Tables,
Remainders — were artifacts of my own word matching (*Mixture* vs *Mixtures*,
*Tabular* vs *Tables*, *Remainder* vs *Remainders*) and are all correct.

**What nothing has proved:**
- that the video teaches well
- that its pace, language or depth suits a first-time student
- that it is not a funnel for a paid batch
- that the level assigned to it is right

**Nobody has watched the 22 promotions.** The 18 already shipping went through
earlier review; the 22 have not. That is the honest state, and it is the
difference between *existence-verified* and *quality-verified*.

Two ways to close it, and the choice is yours:

- **(a) Let the students check.** Ship 40, read the 👎 rate. Consistent with the
  bounded-downside argument, and it is real evidence rather than an opinion.
- **(b) Spend 35 minutes first.** 22 videos, ~90 seconds each — open, skim, keep
  or drop. That converts them to founder-verified before a single student sees
  them, and it is a proportionate cost for the one thing tooling cannot do.

I would do **(b) for the three already flagged** — `IgEKyxYTXDg`,
`e4Ec4KzqaME`, and the paid-push set — and **(a) for the rest**.

---

## The feedback loop

```
[ primary resource ]            ← the only anchor
Was this useful?   👍   👎
     👍 → recorded, nothing else happens
     👎 → "Try another explanation →"   ← secondary becomes the only anchor
```

`resource_verdict` already exists and is wired in `task-resource.tsx`. Primary
and secondary are never visible together, so the shipped one-anchor guard stays
untouched. Of the 40 topics with a primary, 37 already have a second
concept-grade candidate.

**Phase 1 is thumbs only.** No reason-picker — *too basic / too long / not
CAT-relevant* comes later, once we know a thumbs-down is even common. The first
question is whether the resource helps, not whether the student will fill in a
survey.

### What we must not conclude from this data

- **CTR is not the metric.** A student who ignores the link because they already
  know Percentages is not a failure.
- **Not returning ≠ a bad video.** They may have finished on YouTube, gone down a
  rabbit hole, or stopped studying. Opening is not endorsement and leaving is not
  rejection.
- **Do not build ranking yet.** Collect first. A beginner, an advanced student, a
  Hindi speaker and someone with 20 minutes will all judge the same video
  differently. Ranking eventually keys on
  `topic × learner state × intent × difficulty × resource` — and that, accumulated
  over enough students, is the moat. Ranking on thin data just launders noise.

Analytics matures in this order, and no stage may be skipped:
```
shown → opened → returned → helpful → task outcome
```

---

## Rollout

| Phase | What | When |
|---|---|---|
| **A** | Concept resources, every genuinely verified topic, primary + hidden secondary | now |
| **B** | Worked-example resources (the 48 already have a home here) | after A settles |
| **C** | Practice question banks, against the source gate | ~15–20 days |
| **D** | Revision / exam-ready: PYQs, timed, sectional, DILR sets | later |
| **E** | Our own bank where external supply is genuinely bad — DILR most likely | much later |

No arbitrary cap on Phase A. If 22 pass, ship 22. If 40 pass, ship 40. The gate
is the word *verified*, not a number.

**Layer C source gate**, unchanged and unmet so far:
`topic → difficulty → supply → login → India access → mobile → sufficiency → provenance`,
plus: **link out, never reproduce.** A publisher that permits linking may still
forbid copying its questions. And target and supply are separate — CareerRai
sets the target of 15; the external page only needs enough supply.

---

## The first release is not a resource system

It is the **Concept Learning Resource Layer**. Practice, Revision and Exam Ready
arrive on the same rails afterwards. We are not building everything at once, and
we are not holding back something useful for twenty days either.
