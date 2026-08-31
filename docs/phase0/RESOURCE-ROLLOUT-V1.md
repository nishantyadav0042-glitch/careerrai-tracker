# Resource Rollout v1

**31 August 2026.** Supersedes `PHASE-1-CONCEPT-LINKS.md`, which proposed
promoting 22 topics at once. Founder direction is narrower and better: **three
topics, concept only, layer by layer.**

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

## Phase 0 needs no new content. It needs deletions.

All three chosen topics **already carry a verified concept video today**:

| Topic | Concept video | Also carries | Action |
|---|---|---|---|
| Reading Comprehension | `Qt_FK9fWlMg` · 2IIM · 26m | `exam_ready` | **nothing — already clean** |
| Percentages | `x-k8iSNr85g` · Rodha · 26m | `practice_easy`, `exam_ready` | remove the practice row |
| Arrangements | `4tI-h-GKWVk` · Rodha · 20m | `practice_easy`, `practice_cat` | remove both practice rows |

Reading Comprehension is already correct under the new model — concept plus an
exam-ready video, no practice video at all.

So Layer A ships by **turning things off**, not by adding anything:

1. `foundation: ['concept', 'practice_easy']` → `foundation: ['concept']`
   — kills the fallback that hands a first-time student a practice video.
2. `intensive: [...]` → `[]` and `revision: [...]` → `[]`
   — practice and exam-ready tasks show no row until Layers C and D exist.
3. Delete the three practice rows above from `topic-resources.ts`.
4. Add a guard test asserting `intensive` and `revision` return null, so nobody
   re-enables them before their layer lands.

Everything else in the file can stay where it is; with `intensive` and
`revision` returning null, nothing else is reachable.

### A guard for the principle itself

The first principle deserves a test, not a comment: **assert that no
`practice_*` intent is ever reachable from `foundation`.** That is the rule that
was quietly broken in production, and a comment would not have caught it.

---

## Two collisions with the existing build

Neither is a blocker, both need a decision.

### 1. "Primary + optional backup" fails a shipped guard

`task-resource-surface.guard.test.ts:77` counts anchors in the surface and
asserts **exactly one**:

```
expect(anchors.length, 'a list hands the decision back to the student').toBe(1)
```

So "primary concept resource + optional backup" cannot ship as two visible
links without deliberately changing that guard. Three ways:

- **(a) One link only.** Keep the guard. Simplest, and consistent with "a
  student who came here to be told what to do next." *Recommended for Phase 0.*
- **(b) Show the backup only after a thumbs-down** on `resource_verdict` — the
  event already exists. Still one anchor at a time; the guard survives.
- **(c) Change the guard to allow two.** Do this only on purpose, with the
  reason written into the test.

### 2. "Concept Mastery" has no state to attach to

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

1. Decide collision 1 (one link vs backup-on-thumbs-down).
2. Ship Layer A: three topics, concept only, practice rows deleted, two phases
   nulled, two guards added.
3. Observe. No new topics until the verdict data says the shape works.
4. Then widen Layer A — 22 more topics already have platform-verified concept
   videos waiting in `round2-verified.json` and friends, so widening is cheap
   *once the shape is proven*.
5. Layer C research round against the gate above.
6. Layers B and D, each decided on its own.

## What is now explicitly dead

- Re-grading 137 resources as video slots. The re-grade stands as a record of
  what is wrong; it is not a work queue.
- Filling 46 topics × 4 rungs. That was never the shape.
- Any practice rung filled by a video.
