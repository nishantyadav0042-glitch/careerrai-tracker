# Phase 1 — concept links only, and nothing else

**31 August 2026.** Founder: *"why you want to do everything at once? Let's make
things perfect slowly and steady."* Correct. Question links are deferred.

This ships links on the **learning stages only** — `not_started` and `learning`,
which the engine already calls `foundation`. Everything else shows nothing until
we have real question sources.

---

## Why this is small

The feature is already built. `resourceForTask(topic, topicPhase)` exists, has
one call site, and already returns a concept video for a foundation task. The
render surface exists with four guard tests. Nothing new is designed here.

Two things change, and one data file grows.

### Change 1 — foundation stops falling back to a practice video

```
foundation: ['concept', 'practice_easy']   ->   foundation: ['concept']
```

Today, a foundation student on a topic with no concept video is handed a
**practice video** instead. That is the category error from
`LADDER-REGRADE.md`, live in production, on exactly the students meeting a topic
for the first time. Deleting one array element fixes it. A student then either
gets a real concept video or gets no row — which is honest.

### Change 2 — turn the other two phases off

```
intensive:  ['practice_cat', 'practice_easy', 'concept']   ->   []
revision:   ['exam_ready', 'practice_cat', 'practice_easy'] ->   []
```

A student told to solve 15 questions currently gets a video of someone else
solving questions. Until question links exist, **no row is the right answer.**
This is the deferral, made explicit in code rather than left as an intention.

Add one guard test asserting both return null, so nobody re-enables them by
accident before the question layer lands.

### Change 3 — promote 22 already-verified concept videos

No new research. These were verified against the platform today and are sitting
in `round2-verified.json`, `round2-rerun-verified.json` and
`round3-three-topics-verified.json` as L1 candidates.

**Concept coverage goes from 18/46 topics (39%) to 40/46 (86%).**

| | |
|---|---|
| Ships today | 18 topics |
| Ready to promote | **22 topics** |
| After Phase 1 | **40 of 46 topics** |
| Still uncovered | 6 |

The 22: Pipes & Cisterns, Linear Equations, Functions, Lines & Angles,
Triangles, Quadrilaterals, Circles, Mensuration, Coordinate Geometry,
Permutation & Combination, Probability, Set Theory, Divisibility, HCF & LCM,
Remainders, Base System, Sentence Completion, Reading Speed Practice,
Selection & Distribution, Binary Logic, Venn / Sets, Hybrid DILR Sets.

Sixteen of the 22 are Rodha or MBA Wallah — the two channels already carrying
most of the shipped corpus.

---

## Check these three before promoting

Not blockers, but do not bulk-promote without a look:

- **`IgEKyxYTXDg` (Set Theory)** — the single genuine title mismatch found today.
  Claimed *"SET THEORY 1 BASIC CONCEPTS"*, really *"CAT 2025 I INTRODUCTION TO
  VENN Diagrams I LRDI I SWAPANIL SIR"*. It is a real introduction video and
  probably fine for the concept slot, but it is not the video the research
  described.
- **`e4Ec4KzqaME` (Sentence Completion)** — 7.7 min, and its own description
  calls it a *"demo session"* for a paid course. Also the topic-naming problem:
  CAT has no question type called Sentence Completion; it has Para Completion
  and Insert the Sentence.
- **Paid-push flags** — seven of today's picks carry heavy batch promotion in the
  description. Presence is not purpose; a watch settles it.

---

## The one thing that will feel rough, and the decision it needs

`taskVolume()` reserves **33% of a foundation slot for the concept**:
`practiceMin = minutes * 0.67`.

Against the 40 concept videos we would have (median 26 min):

| Task slot | Concept budget | Videos that fit |
|---|---|---|
| 30 min | ~10 min | **4 of 40** |
| 45 min | ~15 min | 5 of 40 |
| 60 min | ~20 min | 7 of 40 |
| 90 min | ~30 min | 25 of 40 |

So on a typical 30-minute slot the card says *spend about ten minutes learning
this* and links a 26-minute video. The student either abandons it or spends the
whole slot watching and solves nothing.

Five of the 40 are over an hour: Pipes & Cisterns (78m), Remainders (70m),
Coordinate Geometry (68m), Set Theory (64m), Binary Logic (61m).

**This is not a bug in the 33% rule.** That rule was written for a world where
the student found their own concept material — a textbook chapter genuinely is
ten minutes. A real lecture is not.

Three ways to go, and it is your call:

- **(a) Say nothing about time.** Show the row with the video's real runtime and
  let the student decide. Cheapest, honest, no engine change. *Recommended.*
- **(b) Let a long concept video span the first few encounters.** The engine
  already spaces topics out, so a 70-minute lecture naturally gets watched
  across the first two or three times that topic appears. Costs a small "picking
  up where you left off" affordance.
- **(c) Prefer shorter concept videos.** Only helps where we have a choice, and
  mostly we do not.

Doing nothing is also survivable — the row is optional and always has been.

---

## What ships at the end of Phase 1

A student meeting a topic for the first time, on 40 of 46 topics, sees one
optional row under the task: the concept video, its channel, its real runtime.
A student past that topic sees no row. Nobody is handed a practice video and
told it is practice.

The four existing guard tests apply unchanged — never hosted, never mandatory,
one link never a list, source always named.

---

## The 6 still uncovered

Ratio & Proportion, Progressions, Para Jumbles, Odd One Out, Vocabulary,
Caselets.

Six topics, one small research round using the platform-discovery method that
worked today — discovery through vidIQ so an id cannot be invented, then a
direct-lookup confirm. Roughly an hour, and it takes coverage to 46/46.

---

## Deferred, deliberately

- **Question links** — a month out, or whenever the source question is settled.
  `QUESTION-LINKS-PLAN.md` holds the design; nothing in Phase 1 blocks it, and
  the two turned-off phases are where it plugs in.
- **The `solutions` surface** — the 48 parked practice videos that demonstrably
  solve questions, shown after an attempt. Later still.
- **The exam-ready video slot** — `revision` stays off for now even though
  `exam_ready` is a legitimate video intent. One thing at a time.

## Order

1. Look at the three flagged videos above.
2. Answer the concept-budget question (a / b / c).
3. Promote the 22; restrict foundation; null out intensive and revision; add the guard.
4. Ship. Watch `resource_shown` / `resource_opened` / `resource_verdict` on
   foundation tasks only — a clean read, because nothing else emits them.
5. Then the 6 missing topics.
