# Resource Layer — production audit

**31 August 2026.** Full end-to-end audit of Layer A as shipped. Nothing has
been fixed. Four of the findings are defects I introduced today.

Verification run: `4,965 tests pass`, `next build` succeeds, `tsc --noEmit`
clean across `src/`, `eslint` 0 errors (2 pre-existing warnings in
`TodaysRoutineCard.tsx`, unrelated: `memoryTag`, `handleTaskTap`).

---

## AUDIT RESULT

### PASS — verified clean

- **One resolver.** `topic-resources.ts` is imported by exactly one module
  (`routine-engine.ts:96`). `resourceForTask` / `secondaryForTask` are the only
  entry points and have four call sites, all in `generateRoutine`.
- **One phase authority.** `getPhase` (calendar) → `STAGE_MIN_PHASE` (can only
  push forward) → `phaseForTopic` (topic's own coverage beats the calendar).
  Layered, not competing. Every resource call site passes
  `phaseForTopic(choice.coverageStatus, phase)`.
- **Inventory reconciles exactly.** 40 live topics, **0** keys outside the
  knowledge graph, 40 primaries, 33 secondaries, **0** secondary-without-primary,
  **0** `longForm`/runtime mismatches, **0** topics using one video for both
  slots, 6 knowingly uncovered.
- **Parked resources are unreachable.** `docs/phase0/parked-resources.json` is
  not imported anywhere in `src/`, and none of its 23 rows collides with a live
  intent for the same topic.
- **Contract invariants 1, 2, 3, 6, 9, 10, 12 hold and are guarded.**
  `intensive`/`revision` resolve to null for every topic; one anchor only;
  no topic carries a duplicate intent; `longForm` matches runtime exactly;
  a missing resource returns null and the card renders `!done && task.resource`.
- **Invariants 4 and 5 hold structurally.** `target` comes from `targetPhrase`
  and `estMinutes` from the slot; `resource` is a sibling field written after
  both. The resource layer has no write path to either.
- **A naming collision was removed.** The retired `ResourceIntent.exam_ready`
  shared a name with `CoverageStatus.exam_ready` — two different ladders, one
  word. The new vocabulary (`exam_practice`) ends it.
- **External content is handled as untrusted.** The href is a template literal
  into `youtube.com/watch?v=` with a static id; `target="_blank"` +
  `rel="noopener noreferrer"`; no `dangerouslySetInnerHTML`, no iframe, no
  user-controlled URL. Title and channel render as text through React's escaping.
- **Notifications carry no resource.** `PlanTask` has no resource field and the
  companion cron never references one, so there is no second surface.

---

### CRITICAL

**C1 — Stored routines are a second source of resource truth, and they can
serve a practice video for up to a day.**

`daily_routines.tasks` is a JSON column. `api/routine/today` generates the
day's tasks, **persists them** (`route.ts:272`), and on every later load
returns the **stored** copy (`route.ts:412 → 471`). `planStaleReason` triggers
only on completed work, changed hours, or a late check-in — **never on a code
or data change**.

So any student whose routine for today was built before this deploy keeps the
old embedded resource, including `practice_easy` on a practice task, until
tomorrow's routine is generated. The new guards do not catch this because they
test the resolver, not stored rows.

The fix pattern already exists ten lines away: `coverageStatus` is deliberately
**recomputed at read time** rather than trusted from storage
(`route.ts:407-408`), precisely so a status tap shows immediately. `resource`
and `secondary` should be recomputed the same way. That also collapses C1 and
H1 into the resolver being the only authority at runtime, not just at generation.

*Blast radius: ≤1 day per student, only students with a routine already
generated. No data corruption.*

---

### HIGH

**H1 — `add-block` bypasses the resource layer entirely.**
`src/app/api/routine/add-block/route.ts:96-103` builds a `StoredTask` with
`target` via `phaseForTopic` but never calls the resolver. A student adding a
block on a foundation topic gets **no concept video even though one exists**.
It fails safe (absence, not a wrong resource), but it is a genuine second system
deciding whether a resource appears. *Answering the founder's question directly:
yes, one existed — this is it.*

**H2 — the secondary never records an impression.** *(my defect)*
`useEffect(..., [])` runs once per mount. `tryOther()` sets
`shown.current = false`, but nothing re-runs the effect, so
`resource_shown` never fires for a secondary. That reintroduces exactly the
ambiguity the original code was written to prevent — "ignored it" and "never saw
it" become the same number — for secondaries only. The reset line is also dead code.

**H3 — one negative verdict fires `resource_verdict` twice.** *(my defect)*
`ask('did_not')` emits one event; choosing a reason emits a second with the same
verdict plus `reason`. Every "not helpful" count doubles. `journey.track` does no
deduplication. This violates the stated rule that one user action must not fire
the same event twice.

**H4 — picking a reason destroys the secondary offer.** *(my defect)*
`reason()` sets `verdict = 'helped'` to collapse the panel, and `canOffer`
requires `verdict === 'did_not'`. So a student who says "not helpful" **and then
tells us why** loses the "Try another explanation" button. The more engaged
student gets the worse outcome, and local state falsely reads `helped` after a
negative verdict.

---

### MEDIUM

**M1 — two task shapes with different fidelity.** `RoutineTask` carries
`resource`/`secondary`; `PlanTask` does not. Correct today because notifications
never mention resources, but if that copy ever wants one it will silently have none.

**M2 — the stored/live type boundary is untyped.** Old stored tasks carry
retired intent strings. `TaskResource.intent` is `string`, so they degrade to the
'Watch' label rather than failing. Graceful, but nothing asserts the boundary.

---

### LOW

- **L1** `videoId` shape is enforced only in tests, never at runtime. Static
  data, so a malformed id cannot arrive from a user — it would simply produce a
  broken link rather than being rejected.
- **L2** `docs/RESOURCE-LINKING-PLAN-2026-08.md` is cited in the component's
  header comment and predates this architecture. Mark historical or update.
- **L3** `PHASE-1-CONCEPT-LINKS.md` is superseded but does not say so at the top.

---

## DUPLICATION MATRIX

| Responsibility | Implementations | Authority | Status |
|---|---|---|---|
| Topic phase | `getPhase`, `STAGE_MIN_PHASE`, `phaseForTopic` | `phaseForTopic` | layered, not duplicated — **OK** |
| Resource selection | `resourceForTask`; **stored JSON (C1)**; **add-block omission (H1)** | `resourceForTask` | **3 paths — must collapse to 1** |
| Resource metadata | `TOPIC_RESOURCES` | same | single — **OK** |
| Primary/secondary choice | `secondaryForTask` + component state | `secondaryForTask` | single — **OK** |
| Long-form classification | `longForm` column, guard-asserted against runtime | data + guard | single — **OK** |
| Feedback semantics | `task-resource.tsx` only | same | single, but **emits two events for one action (H3)** |
| Resource URL | one template literal | component | single — **OK** |

## SOURCE-OF-TRUTH MAP

| Decision | Owner |
|---|---|
| Which phase a topic is in | `routine-engine.phaseForTopic` |
| Whether a resource may appear | `routine-engine.RESOURCE_PREFERENCE` |
| Which resource | `topic-resources.resourceFor` |
| The alternative | `topic-resources.resourceSecondary` |
| Is it long-form | `TOPIC_RESOURCES[].longForm` |
| When the secondary shows | `task-resource.tsx` (`canOffer`) |
| What feedback means | `task-resource.tsx` (`Verdict`) |

## DEAD / LEGACY INVENTORY — nothing deleted

| Item | Class | Note |
|---|---|---|
| `practice` / `revision` / `exam_practice` intents | **PARKED** | declared, unreachable by guard — intentional |
| 23 rows in `parked-resources.json` | **PARKED** | not imported; retained deliberately |
| `shown.current = false` in `tryOther` | **DEAD** | no effect (H2) |
| Retired intent strings in stored routines | **LEGACY** | expires with the day (C1) |
| 6 uncovered topics | **LIVE, empty** | correct — a missing resource is acceptable |

## HISTORY SAFETY

Events store `videoId`, which is stable and never rewritten, so a past
`resource_opened` always names the video actually shown. **One caveat:** events
also store `intent`, and if a row later moves between `concept` and
`worked_example`, old events will read as having been about the other slot.
Analysis should key on `videoId`, not `intent`.

## RECOMMENDED FIX PLAN — by risk

1. **C1** — recompute `resource`/`secondary` at read time in
   `api/routine/today`, mirroring the existing `coverageStatus` treatment. Kills
   the stale path and makes the resolver the sole runtime authority.
2. **H3 + H4** — one verdict event per action; the reason picker must not clear
   the secondary offer.
3. **H2** — fire `resource_shown` when the secondary is revealed.
4. **H1** — `add-block` calls the resolver. Closes the last bypass; after this,
   invariant "no legacy path can bypass" is provable.
5. **M1, M2, L1–L3** — documentation and boundary hygiene.

The 6-topic discovery round stays queued behind these.
