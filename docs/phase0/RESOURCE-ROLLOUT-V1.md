# Resource Rollout v1

**31 August 2026 — decisions locked.** Supersedes `PHASE-1-CONCEPT-LINKS.md`.

Founder, after review: go wide rather than three topics — *"we are in learning
stage, get it ready for all of them"* — plus a feedback vote on every link, and a
secondary resource when the primary does not land.

**Layer A ships on all 40 topics that have a platform-verified concept video,
with a thumbs vote on every link and a secondary link revealed on a
thumbs-down.**

## The two principles, locked

> **Resource type must follow task intent. Task intent must never change merely
> because a resource exists.**

A good video that solves 20 questions does not make a practice task into a
watching task. That video is eligible for concept, worked-example or solution
review. A practice task needs a practice resource.

> **A missing resource is acceptable. A wrong resource is not.**

A topic with no verified link shows no row and the task runs exactly as it does
today. Showing a wrong resource to hit "100% coverage" makes the product worse,
not better.

## The layers

| Layer | Task intent | Resource | Status |
|---|---|---|---|
| **A** | Concept learning | concept video / article | **build now, 3 topics** |
| **B** | Concept mastery | walkthrough / advanced concept | later |
| **C** | Practice | question bank | after sources are verified |
| **D** | Exam ready | timed / hard / sectional / PYQ | later still |

---

## Decision 1 — go wide: 40 topics, not 3

| | |
|---|---|
| Ship a concept video today | 18 topics |
| Platform-verified L1 ready to promote | +22 topics |
| **Layer A at launch** | **40 of 46** |
| No concept video anywhere | 6 |

Going wide is cheap here because the downside is bounded: the row is optional,
a student who ignores it loses nothing, and the feedback vote below turns a bad
link into a signal within days rather than a defect that sits for months. The
six uncovered topics show no row, per the standing principle.

Three of the 22 carry a flag from today's verification and go on a watchlist
rather than a hold — `IgEKyxYTXDg` (Set Theory: the one genuine title
mismatch), `e4Ec4KzqaME` (Sentence Completion: calls itself a demo session, and
CAT has no question type by that name), and the paid-push set. **Read their
first verdicts early.** That is what the feedback layer is for.

## Decision 2 — a vote on every link, and a secondary behind it

The event already exists: `resource_verdict`, wired in `task-resource.tsx`.

```
[ concept video ]            ← one anchor
Did this help?  👍  👎
        └─ 👎 → "Try a different explanation →"   ← the secondary, now the one anchor
```

**This resolves the collision from the previous draft.** The shipped guard
counts anchors and asserts exactly one; primary and secondary are never visible
together, so the guard survives untouched. No guard edit, no exception.

Stock is already there: of the 40 topics with a primary, **37 also have a
second concept-grade candidate** verified today. Three would ship with a primary
only, and a thumbs-down there simply records the miss.

Two rules for the vote:
- **A thumbs-down is data, not a failure.** It is the fastest way to find a
  wrong link at 40-topic scale, which is precisely what makes going wide safe.
- **CTR is still not the metric.** The question stays: did this help the student
  execute *this* task.

## Decision 3 — rename the label, do not add a state

You asked whether the stages should become *concept learning → concept mastery
→ practicing → exam ready*. My recommendation, and the reasoning:

**Change one label. Add no status.**

`STATUS_LABEL` is a separate display map from the stored `CoverageStatus`, so
`learning` can read **"Concept learning"** to students with zero schema risk —
no migration, no DB trigger, no ranking change.

Adding a real `concept_mastery` status is a different order of change:
`coverage-status.ts` is a deliberate leaf module whose header records that five
copies of this ladder once existed and that is how ranking silently broke. A
sixth state means the enum, the trigger, a migration, and every consumer that
switches on status.

And it would buy little, because **"concept mastery" is not a state a student
sits in — it is a depth of resource they want while still learning.** The moment
they start attempting questions they are `practicing`. Your own
primary/secondary idea already delivers mastery: primary is first exposure,
secondary is the deeper explanation, same state, revealed by the vote. Mastery
without a migration.

One more reason to keep the ladder as-is: your four-stage sketch drops
`revising`, but `topics-constants.ts` records that as deliberate — *"revision
isn't a topic, it's a per-topic STATE"* — and the `revising` status replaced the
old QA/VARC/DILR/Formula-Revision pseudo-units. Removing it would undo that.

So the ladder stays `not_started → learning → practicing → revising →
exam_ready`, and only the word on screen changes.

## What Layer A actually is now

All three chosen topics **already carry a verified concept video today**:

| Topic | Concept video | Also carries | Action |
|---|---|---|---|
| Reading Comprehension | `Qt_FK9fWlMg` · 2IIM · 26m | `exam_ready` | **nothing — already clean** |
| Percentages | `x-k8iSNr85g` · Rodha · 26m | `practice_easy`, `exam_ready` | remove the practice row |
| Arrangements | `4tI-h-GKWVk` · Rodha · 20m | `practice_easy`, `practice_cat` | remove both practice rows |

Reading Comprehension is already correct under the new model — concept plus an
exam-ready video, no practice video at all.

1. `foundation: ['concept', 'practice_easy']` → `foundation: ['concept']`
   — kills the fallback that hands a first-time student a practice video.
2. `intensive: [...]` → `[]` and `revision: [...]` → `[]`
   — practice and exam-ready tasks show no row until Layers C and D exist.
3. Delete every `practice_*` row from `topic-resources.ts`. With the two phases
   nulled they are unreachable anyway; deleting them stops the data lying about
   what the product does.
4. Promote the 22 verified L1 videos as `concept`.
5. Add a `secondary` concept entry for the 37 topics that have one.
6. Two guard tests: `intensive`/`revision` return null, and **no `practice_*`
   intent is ever reachable from `foundation`.**

The three Phase-0 topics below are simply the first rows of the same change.

### A guard for the principle itself

The first principle deserves a test, not a comment: **assert that no
`practice_*` intent is ever reachable from `foundation`.** That is the rule that
was quietly broken in production, and a comment would not have caught it.

---

## Two collisions with the existing build

Neither is a blocker, both need a decision.

### 1. ~~"Primary + optional backup" fails a shipped guard~~ — RESOLVED

Settled by Decision 2: the secondary appears only after a thumbs-down, so one
anchor is visible at a time and the guard is untouched.

### 2. "Concept Mastery" has no state to attach to — SETTLED BY DECISION 3

Your Stage 2 has no home in the engine. There are five coverage statuses and
three phases:

```
not_started, learning  -> foundation
practicing             -> intensive
revising, exam_ready   -> revision
```

There is no "mastery" state between learning and practicing. And
`coverage-status.ts` is a deliberate leaf module whose header forbids declaring
a sixth status anywhere else — it records that five copies of this ladder once
existed and that is how ranking silently broke.

So Layer B is not a small change. Either it lives *inside* foundation as the
second resource (which is collision 1 again), or it needs a real sixth status
with migration and coverage-write changes. **Recommendation: defer Layer B and
decide it on its own merits later — do not smuggle it into Phase 0.**

---

## Layer C — what I have NOT verified

The 2IIM and Cracku free-question claims came from the cofounder review with
citations; **I have not opened those pages myself**, so I am not carrying them
as facts. Before any question link ships, each candidate source must pass the
gate you named:

`topic → difficulty → supply → login wall → India access → mobile → sufficiency → provenance`

Two things to hold onto when that round runs:

- **Link out, never reproduce.** Our four guards already enforce this for video —
  `target=_blank`, no iframe, no `/embed`, no proxy — and the same rule must
  carry to question pages. A publisher that permits linking may still forbid
  reproducing its questions. Copying question content into our own bank is a
  different act from linking to theirs.
- **Target and supply are separate.** We do not need a "15-question link". We
  need a topic page with enough supply; CareerRai supplies the target. Where
  supply cannot be counted, a time-based target — *"Practise Percentages here,
  ~25–40 min"* — is more honest than a question count we cannot verify.

I agree the legal posture wants India-specific counsel before commercial launch.
I am recording the operating rule, not an opinion on the law.

---

## What we measure, and what we must not

Three events already exist: `resource_shown`, `resource_opened`,
`resource_verdict`.

**CTR is not the success metric.** A student who opens nothing because they
already know Percentages is not a failure. The question is narrower:

> Did this help the student execute *this* task?

`resource_verdict` — one tap on return — is the only event that answers it, and
on YouTube it is the only outcome signal we can ever get. With `intensive` and
`revision` returning null, Phase 0 gives an unusually clean read: every event
fired comes from a foundation task on one of three topics.

Watch for: broken links, opens with no return, and any verdict pattern
concentrated on one topic.

---

## Order

1. **Build Layer A**: 40 topics, concept only, primary + secondary, vote on every
   link, all `practice_*` rows deleted, `intensive`/`revision` nulled, two guards
   added, `learning` relabelled "Concept learning".
2. **Watch the three flagged links' first verdicts.**
3. Read verdicts weekly. A topic whose primary and secondary both draw
   thumbs-down goes back to research — that is the improvement loop, and it now
   runs on student evidence instead of my rubric.
4. The 6 uncovered topics: one platform-discovery round, ~1 hour, takes it to 46/46.
5. Layer C research round against the source gate above.
6. Layers B and D, each decided on its own.

## What is now explicitly dead

- Re-grading 137 resources as video slots. The re-grade stands as a record of
  what is wrong; it is not a work queue.
- Filling 46 topics × 4 rungs. That was never the shape.
- Any practice rung filled by a video.
