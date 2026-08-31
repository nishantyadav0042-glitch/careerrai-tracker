# Resource Layer — final audit

**31 August 2026.** Written as if the repository had just been handed over with
one question: *prove there is one resource system and that it cannot silently
regress.*

## Executive verdict

**PASS — SHIP.**

Every finding from `RESOURCE-LAYER-AUDIT.md` is fixed structurally rather than
corrected in place, and this pass found one further defect the first audit
missed. The layer now has one authority per decision, no bypass path, no
duplicate events, and no way for a stale resource to exist.

**Verification, actually run:**

| Check | Result |
|---|---|
| `vitest run` | **5,008 passed**, 1 skipped, 0 failed (396 files) |
| `tsc --noEmit` | clean across `src/` |
| `eslint src/` | **0 errors**, 73 warnings — all pre-existing, none in changed files |
| `next build` | compiled successfully, 211 static pages |

New tests added by this work: **+43** (5,006 → 5,008 after the topic drop, plus
guards replacing string scans).

---

## Findings fixed

### C1 — stale resource in a persisted routine · **CRITICAL**

**Original problem.** `daily_routines.tasks` is a JSON column. Tasks were
generated with a resolved resource, persisted, and returned as-is on later
loads. `planStaleReason` rebuilds only on completed work, changed hours or a
late check-in — never on a code or inventory change. A student whose routine
predated a deploy kept the old resource, including a practice video on a
practice task.

**Fix — structural, not corrective.** A resource is now **never written into a
task at all**. `generateRoutine` records only `topicPhase` (the phase its target
was worded for). Every task acquires its resource at read time through
`routine-engine.projectTaskResources`, which spreads the stored task first and
overwrites `resource`/`secondary` after — so a stale value cannot survive even
if one existed. There is nothing to go stale because nothing is stored.

**Tests.** `resource-authority.guard.test.ts` — a task carrying a stale
`practice_easy` resource is projected to `null`; a stored resource is replaced
by the current inventory's; the rest of the task (`id`, `target`, `estMinutes`)
is untouched; pre-`topicPhase` tasks fall back to live coverage; and a source
scan fails if any file outside the engine ever writes `resource: resourceForTask(`.

**Residual risk.** None for staleness. One behavioural consequence worth
naming: because the projection prefers `topicPhase`, a student who advances a
topic's coverage mid-day keeps the row that matches the instruction they were
given, rather than the row matching their new status. That is deliberate — the
alternative lets the row contradict the target above it.

### H1 — `add-block` bypassed the resolver · **HIGH**

**Original problem.** `add-block/route.ts` built a task with `targetPhrase` and
`phaseForTopic` but never consulted the resolver, so an added block silently had
no resource.

**Fix.** `add-block` records `topicPhase` like every other construction path and
resolves nothing itself. Its tasks flow through the same read-time projection.
The bypass is closed by making resolution impossible anywhere except one
function, rather than by adding a second call.

**Tests.** A guard asserts `add-block` contains `topicPhase: phaseForTopic(` and
does **not** contain `resourceForTask`; another asserts every route that
surfaces tasks calls `projectTaskResources`; a third asserts no `.tsx` file
touches `TOPIC_RESOURCES` or `resourceFor(`.

**Residual risk.** None known. A new task-surfacing route would be caught by the
route guard.

### H2 — the secondary never emitted an impression · **HIGH** *(my defect)*

**Original problem.** `useEffect(..., [])` runs once. Swapping to the secondary
set `shown.current = false`, which did nothing, so a secondary was displayed
with no `resource_shown` — making "ignored it" and "never saw it" the same
number again, for secondaries.

**Fix.** Impressions are keyed by video id inside the reducer: a re-render is
silent, a swap to an unseen video is not.

**Tests.** Primary shown once; three re-renders still one; opening adds no
impression; a full primary→secondary journey emits exactly two; a primary never
replaced emits exactly one.

### H3 — one negative verdict emitted two verdict events · **HIGH** *(my defect)*

**Original problem.** The thumb emitted `resource_verdict`; picking a reason
emitted a second with the same verdict. Every "not helpful" count doubled for
students who explained themselves.

**Fix.** A verdict emits `resource_verdict` once, carrying a `verdictId`. A
reason emits a **separate** event, `resource_verdict_reason`, carrying the same
id. A reason is not a second opinion; it enriches the one already recorded, and
the two join on `verdictId`. The event was registered in `EVENT_POLICY` — the
repo's completeness guard caught the omission.

**Tests.** Each of the four verdicts emits exactly one; not-helpful-plus-reason
emits one verdict and one reason; the ids match; repeated taps of either emit
nothing further; a reason without a negative verdict emits nothing.

### H4 — the reason picker removed the secondary offer · **HIGH** *(my defect)*

**Original problem.** `reason()` set `verdict = 'helped'` to collapse the panel,
and the offer is gated on `'did_not'` — so the student who bothered to explain
lost the "try another explanation" button.

**Fix.** `verdict` and `reasonGiven` are separate fields. A reason never touches
the verdict.

**Tests.** After a reason, `verdict` is still `did_not`, `reasonGiven` is true,
and `canOfferSecondary` is true; no secondary is offered on a positive verdict,
when none exists, or once already on the secondary.

### NEW — one video was the primary for two topics · **found in this audit**

`gqYVcVjqW0k` ("Tabular Set", Rodha) was the concept primary for **both Tables
and Hybrid DILR Sets**. It is genuinely a Tables video. The first audit missed
it because my own relevance check listed *tabular* and *set* as synonyms for
Hybrid DILR Sets — the check was looser than the thing it was checking.

None of the four verified Hybrid DILR Sets candidates is a concept video for
hybrid sets; they are specific solved sets. **The topic was dropped rather than
kept wrong.** 40 topics → 39. Two guards now assert no video is the primary for
two topics, and no video appears under two topics at all.

---

## Authority map

```
topic_coverage (DB)                        ← student's own state
        ↓
coverage-status.ts                         ← ONE ladder declaration
        ↓
routine-engine.getPhase / STAGE_MIN_PHASE  ← calendar floor
        ↓
routine-engine.phaseForTopic               ← ONE phase authority
        ↓
routine-engine.RESOURCE_PREFERENCE         ← ONE policy: only foundation resolves
        ↓
topic-resources.resourceFor / resourceSecondary   ← ONE inventory
        ↓
routine-engine.projectTaskResources        ← ONE read-time attachment point
        ↓
api/routine/today                          ← the only route that surfaces tasks
        ↓
task-resource.tsx                          ← renders; decides nothing
        ↓
lib/resource-feedback.ts                   ← ONE feedback semantic
        ↓
journey.track                              ← ONE emission point in the surface
```

| Decision | Sole owner |
|---|---|
| Student coverage state | `topic_coverage` + `coverage-status.ts` |
| Phase for a topic | `routine-engine.phaseForTopic` |
| Whether a resource may appear | `routine-engine.RESOURCE_PREFERENCE` |
| Which resource | `topic-resources.resourceFor` |
| The alternative | `topic-resources.resourceSecondary` |
| When a task gets one | `routine-engine.projectTaskResources` |
| Long-form classification | `TOPIC_RESOURCES[].longForm`, guard-tied to runtime |
| What a tap means | `lib/resource-feedback.reduceFeedback` |
| When the secondary is offered | `lib/resource-feedback.canOfferSecondary` |

## Duplicate-system audit — what was searched

Searched across all `.ts`/`.tsx` in `src/` (comments stripped) for
`resourceFor`, `resourceForTask`, `secondaryForTask`, `resourceByPreference`,
`resourceSecondary`, `TOPIC_RESOURCES`, `RESOURCE_PREFERENCE`,
`projectTaskResources`, `resource_shown`, `resource_verdict`, `TaskResource`,
`topicPhase`, `tasksWithStatus`, and every `track(` call site.

**Result:** resolvers are called from exactly two files — `topic-resources.ts`
(the inventory delegating to its own lookup) and `routine-engine.ts` (the
resolver and the projection). Zero `.tsx` files touch the inventory. Exactly one
route surfaces tasks. Exactly one `track(` call site exists in the surface. All
four facts are now guard tests, so a second system fails CI rather than shipping.

## Resource journey

```
generateRoutine  → task { topic, target, topicPhase }   ← NO resource
        ↓ persisted as JSON (daily_routines.tasks)
api/routine/today → projectTaskResources(task, liveStatus, phase)
        ↓ spreads task first, overwrites resource + secondary
TodaysRoutineCard → <TaskResource resource secondary /> on !done tasks
        ↓
task-resource.tsx → useReducer(reduceFeedback) → one <a> → track()
```

## Event semantics — final

| Event | Fires when | Means | Must NOT mean | Repeatable? | Dedup |
|---|---|---|---|---|---|
| `resource_shown` | a resource is presented | this video was put in front of the student | the task exists; the component re-rendered | once **per video** | `shown[]` in reducer |
| `resource_opened` | the anchor is tapped | the student actually left for YouTube | they watched or finished it | once per resource | `opened` flag |
| `resource_verdict` | a verdict button | one explicit evaluation | that a reason was given | once per resource | `verdict !== null` short-circuit |
| `resource_verdict_reason` | a reason chip | why the verdict was negative | a second verdict | once per verdict | `reasonGiven` flag |

Counting verdicts = counting `resource_verdict`. It cannot double.

## Inventory reconciliation — exact counts

| | |
|---|---|
| Plannable topics | 46 |
| Topics with a live resource | **39** |
| Keys outside the knowledge graph | **0** |
| Primaries (`concept`) | **39** |
| Secondaries (`worked_example`) | **32** |
| Secondary without a primary | **0** |
| Total rows / distinct video ids | **71 / 71** |
| One video under two topics | **0** |
| `longForm` rows | 11 |
| `longForm` ↔ runtime mismatches | **0** |
| Intents outside {concept, worked_example} | **0** |
| Parked rows (unreachable from `src/`) | 25 |
| Parked colliding with a live intent | **0** |
| Uncovered topics | 7 — Ratio & Proportion, Progressions, Para Jumbles, Odd One Out, Vocabulary, Caselets, Hybrid DILR Sets |

## User flows verified

- **A — first learning task.** foundation → concept primary → open → verdict. Covered by the projection tests and the reducer journey.
- **B — negative feedback.** primary → not helpful → reason → offer survives → secondary replaces → its own impression → open → verdict. Asserted event-by-event as an exact sequence.
- **C — practice task.** `intensive`/`revision` project to `null` for every one of the 39 topics. No video can reach a practice instruction.
- **D — stale persisted routine.** A task carrying an old `practice_easy` resource projects to `null`; a stored resource is replaced by the current one.
- **E — add-block.** Records `topicPhase`, resolves nothing, and is picked up by the same projection.
- **F — long-form.** 11 rows flagged, flag guard-tied to runtime, surface carries "you don't have to finish it today", and the task's `target` is untouched by the resource layer.

## Regression guards now in place

1. Only `concept` and `worked_example` may ship.
2. No practice/revision task can resolve a resource — checked for every topic.
3. A secondary requires a primary — checked for every topic.
4. One video is never the primary for two topics.
5. One video never appears under two topics.
6. `longForm` must equal `realMinutes > 45`.
7. No file outside the engine may write `resource: resourceForTask(`.
8. Only the inventory and the engine may call the resolvers.
9. Every task-surfacing route must call `projectTaskResources`.
10. No `.tsx` may touch `TOPIC_RESOURCES` or `resourceFor(`.
11. `add-block` must record `topicPhase` and must not resolve.
12. Exactly one anchor in the surface; exactly one `track(` call site.
13. The surface must delegate to `shouldAskVerdict` / `shouldOfferNotOpened`, not re-implement them.
14. 27 reducer tests pinning every event sequence.

## Remaining risks — real ones only

1. **Quality is still unverified.** Existence, title, channel and runtime are
   platform-read; whether a video teaches well is not. Nobody has watched most
   of the 39. That is what the thumbs are for, and it is the reason to read the
   first week's verdicts rather than assume.
2. **Historical `intent` is mutable.** Events store `videoId` (stable) and
   `intent` (not). If a row ever moves between `concept` and `worked_example`,
   old events read as the other slot. **Analysis must key on `videoId`.** Not
   worth a migration; worth writing down, which this is.
3. **`videoId` shape is enforced at build time only.** Static data, no user
   input, so a malformed id yields a dead link rather than an exploit.
4. **Seven uncovered topics show no row.** Intended.

## Ship recommendation

**SHIP.**

One authority per decision, every one guard-tested. No bypass path survives.
The events cannot double-count. A stale resource is not possible because none
is stored. The one wrong resource this audit found was removed rather than
rationalised.

The 6-topic discovery round — now 7 with Hybrid DILR Sets — is unblocked.
