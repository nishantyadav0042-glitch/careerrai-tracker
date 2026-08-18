# P0-2.2 — PARTIAL Completion Product Contract

**18 Aug 2026. AUDIT ONLY. No code, no schema, no migration, no facts, no
insight work, no UI implementation, no historical repair.**

> The purpose is to create the contract implementation will follow — **not to
> make implementation convenient.** Where the evidence cannot determine a
> product meaning, the entry reads **PRODUCT DECISION REQUIRED** and I do not
> choose.

---

# HEADLINE FINDING

**PARTIAL → FULL is not merely unimplemented. It is currently impossible, and
attempting it destroys evidence.**

`complete-task` is a **pure toggle keyed on row existence**, and it never looks
at the portion:

```ts
const { data: existingCompletion } = await admin… .maybeSingle();
if (existingCompletion) {  /* DELETE the row */ }
else                    {  /* INSERT with the new portion */ }
```

So a student who marked a task "Got halfway", later finished it, and taps
"Done" does not upgrade anything — **the completion is deleted and the task
becomes untouched.** The same is true from the log sheet, which sends a bare
`{id}` for any task it believes is already done.

That is the answer to questions 1, 3 and 5 at once, and it is not a UI gap.

---

# A. CURRENT SEMANTICS, BY CONSUMER

Traced by reading each consumer, not by field name. `⚠️` marks a place a PARTIAL
is currently read as a whole.

| # | Consumer | Reads | PARTIAL counts as | Correct? |
|---|---|---|---|---|
| 1 | `creditedHours` (`study-credit.ts`) | `halfDone` | **0.5 of a task** | ✅ correct, documented |
| 2 | `fullyDone` (`complete-task`) | `countsAsFullyDone` | **not done** | ✅ **fixed in P0-2** |
| 3 | `emergencyMinimumDone` | `isFullyDone(tasks[0])` | **not done** | ✅ fixed in P0-2 |
| 4 | Coverage ladder (`applyConfidenceSignal`) | `'blue'` | **+1 rung, ceiling `practicing`** (green's ceiling is `revising`) | ✅ already portion-aware |
| 5 | Streak | fires only when `dayClosed`, which needs `fullyDone` | **does not close the day** | ✅ follows from #2 |
| 6 | `/api/routine/today` wire | `toClientCompletions` | **`portion: 'half'`** | ✅ **fixed in P0-2.1** |
| 7 | **`TodaysRoutineCard` render** | `completedIds` set | **⚠️ fully done** | ❌ knows the portion, ignores it |
| 8 | **`LoggingModal` `wasDone`** | `initialDoneIds` | **⚠️ already done — cannot be re-marked** | ❌ blocks the upgrade |
| 9 | **`computeAdaptation` completion ratio** | `completedTaskIds.size` | **⚠️ 1 whole task** | ❌ over-counts plan completion |
| 10 | `weekly-diagnosis` planned-vs-done | `task_id` set | **⚠️ 1 whole task** | ❌ same |
| 11 | `daily-insight` recovery kind | `'red'` then `'green'` | **neither red nor green — ignored** | ✅ a half is not "solid" |
| 12 | `lis-health`, `student-360`, `plan/full`, `daily-hours`, `timetable-apply`, `activation-funnel` | `task_id` only | **a tick** | ✅ they ask "was it touched", which is true |
| 13 | `prep-memory-data` | carries `confidence` through | **preserved verbatim** | ✅ |

**Five consumers are portion-blind. Two of them (#9, #10) produce numbers; two
(#7, #8) are what the student sees and does; #12 is a family that legitimately
only asks "was this touched".**

---

# B. PROPOSED PARTIAL SEMANTICS

> **PARTIAL means: the student engaged with this task and did not finish it.
> It is real evidence of work, and it is not a completion.**

Two corollaries that resolve most of the matrix:

- **B-i.** Anything asking *"did work happen?"* counts a PARTIAL **in full**.
  (Coverage advanced, the topic was touched, the day was not idle.)
- **B-ii.** Anything asking *"was this finished?"* counts a PARTIAL **not at
  all**. (Day closure, streak, emergency minimum, plan-completion ratio.)

`creditedHours` is the one place a fractional value is right, because it prices
*effort*, which genuinely is partial. Everywhere else the question is binary and
the answer is one of the two above — **PARTIAL is not "0.5 everywhere"**, and
spreading 0.5 into ratios that count tasks would invent a third unit.

| Concept | Proposed | Basis |
|---|---|---|
| task completion | **not complete** | B-ii |
| daily completion (`fullyDone`) | **does not count** | B-ii — already shipped |
| streak | **does not extend** (follows day closure) | B-ii |
| coverage ladder | **advances, ceiling `practicing`** | B-i — already correct |
| hours credited | **0.5** | effort is genuinely fractional |
| plan completion ratio (#9, #10) | **PRODUCT DECISION** — see C | — |
| emergency minimum | **does not satisfy** | B-ii — already shipped |
| "was this topic touched" family | **counts** | B-i |
| `daily-insight` recovery | **neither struggle nor solid** | already correct |

---

# C. ALTERNATIVE INTERPRETATIONS AND TRADE-OFFS

### C1. The plan-completion ratio (`computeAdaptation`) — genuinely contested

`completionRatio = completedTasks / plannedTasks` feeds the Adaptation reading
(*"your days are running heavy"*), which **resizes nothing** — it is a reading
shown to the student. Three defensible answers:

| Option | Ratio for 4 half-ticks of 4 | Argument | Cost |
|---|---|---|---|
| **count as 1** (today) | 1.00 "balanced" | a touched task is engagement | **overstates**: a student who half-finishes everything is told their load is fine |
| **count as 0.5** | 0.50 "heavy" | matches `creditedHours` exactly | introduces fractional task counts into a whole-number concept |
| **count as 0** | 0.00 "heavy" | consistent with `fullyDone` | **understates**: real work reads as none, and "heavy" advice may be wrong |

**RECOMMENDATION: 0.5, because this specific ratio is a proxy for load**, and
load is the one question where half-finishing is genuinely half. It also makes
`computeAdaptation` agree with `creditedHours`, which is the other load-shaped
number in the product. **But it is a PRODUCT DECISION** — the ratio drives what
the student is told about their own capacity.

### C2. Should PARTIAL be upgradeable to FULL?

**Founder's stance is yes, and the audit supports it strongly.**

| For | Against |
|---|---|
| It is the honest sequence of a real day: half at 4pm, finished at 9pm | more state transitions to test |
| Today the only path is untick-then-retick, which **destroys the PARTIAL evidence and flickers the day-closure state in between** | — |
| Without it, a student who marks half is *penalised* for honesty — their day can never close | — |
| The coverage ladder is already monotonic and handles a second advancing signal correctly | — |

**No credible argument against was found.**

### C3. Should FULL → PARTIAL be allowed?

| For | Against |
|---|---|
| symmetry; a mis-tap should be correctable | it is a **regression of a claim**, and the codebase already bans this shape elsewhere — `isForwardMove`, `highestStatus`, and the "green/blue never move a topic down" rule |
| | the untick path already exists for a mis-tap: remove it, then re-mark |

**RECOMMENDATION: prohibit FULL → PARTIAL.** Correction goes through untick.
This matches the coverage ladder's existing law rather than inventing a second
one.

### C4. What should unticking a PARTIAL do?

Today: deletes the row. **Coverage is NOT regressed** — the advance happens only
on insert, never on delete. So a PARTIAL that moved a topic `not_started →
learning` leaves it at `learning` forever after the untick.

That asymmetry is deliberate (the ladder is monotonic by design) and it means
**the untick is not a true undo**. Not a defect to fix here; a fact the contract
must state, because "I untapped it" and "it never happened" are different.

---

# D. STATE-TRANSITION MATRIX

`∅` = no completion row.

| From | To | Today | Proposed | Note |
|---|---|---|---|---|
| `∅` | `FULL` | ✅ insert, coverage +1 (cap `revising`) | ✅ unchanged | |
| `∅` | `PARTIAL` | ✅ insert, coverage +1 (cap `practicing`) | ✅ unchanged | |
| `PARTIAL` | `FULL` | ❌ **deletes the row** | ✅ **UPDATE in place** | one row, one task, one day |
| `FULL` | `PARTIAL` | ❌ deletes the row | 🚫 **prohibit** | correction goes via untick (C3) |
| `FULL` | `∅` | ✅ delete | ✅ unchanged | coverage does not regress |
| `PARTIAL` | `∅` | ✅ delete | ✅ unchanged | coverage does not regress (C4) |
| `PARTIAL` | `PARTIAL` | ❌ deletes (toggle) | **PRODUCT DECISION** — idempotent no-op, or untick? | today it unticks; a student re-tapping "halfway" probably means "still halfway" |
| `FULL` | `FULL` | ✅ deletes (deliberate untick) | ✅ unchanged | this IS the untick gesture |
| concurrent same transition | converges (23505 → convergence) | ✅ must hold for the UPDATE path too | the P0-A invariant | |

**The `PARTIAL → PARTIAL` cell is the one genuinely ambiguous transition** and
it exists only because the toggle is keyed on existence rather than on intent.

---

# E. EXISTING PRODUCTION IMPACT

| | |
|---|---|
| total `routine_task_completions` | **248** |
| `confidence = 'blue'` (PARTIAL) | **0 — none, ever** |
| `green` | 217 |
| `null` (legacy, 12–15 Jul, 12 students) | 29 |
| `yellow` / `red` | 2 |
| student-days carrying ticks | **115** |
| student-days containing a PARTIAL | **0** |

**Every ruling in this document changes the behaviour of zero existing rows and
zero existing student-days.** The first real half-tick is what makes any of it
observable — which is precisely why the contract is being written now.

**Historical rule, preserved unchanged:** `confidence = null` rows are FULL,
because the portion control did not exist when they were written. Not
reinterpreted, not backfilled.

---

# F. FILES AND CONSUMERS AFFECTED BY THE PROPOSAL

Listed so the eventual implementation has a fixed target. **Nothing here is
changed by this document.**

| File | Change implied | Ruling it depends on |
|---|---|---|
| `src/app/api/routine/complete-task/route.ts` | toggle → intent-aware: UPDATE for `PARTIAL→FULL`, reject `FULL→PARTIAL`, decide `PARTIAL→PARTIAL` | C2, C3, D |
| `src/components/DailyTracker/LoggingModal.tsx` | `wasDone` must become "was FULLY done" so an upgrade can be sent | C2 |
| `src/components/DailyTracker/TodaysRoutineCard.tsx` | render `portion`; offer the upgrade affordance on a PARTIAL | **UX decision, still open** |
| `src/lib/adaptation-engine.ts` **or** its caller in `routine/today` | weight PARTIAL in `completedTasks` | **C1** |
| `src/lib/weekly-diagnosis.ts` | same question, mentor-facing | C1 |
| `src/lib/completion-portion.ts` | may gain the transition rule, keeping one authority | C3 |

**Not affected, verified:** every Fact Registry fact, `log-insight.ts`,
`daily-insight` kinds 1–6, the streak RPC, `topic_coverage`, and the
`task_id`-only consumer family (#12).

---

# G. DECISIONS REQUIRED FROM FOUNDER

| # | Decision | Recommendation | Status |
|---|---|---|---|
| **G1** | PARTIAL → FULL upgradeable? | **YES** — no credible argument against; today's only path destroys evidence | recommendation |
| **G2** | FULL → PARTIAL allowed? | **NO** — matches the existing no-regression law; untick is the correction path | recommendation |
| **G3** | Does PARTIAL count in the plan-completion ratio, and as what? | **0.5** — this ratio is a load proxy, and load is genuinely half | **PRODUCT DECISION REQUIRED** |
| **G4** | What does re-tapping "halfway" on a PARTIAL mean? | no opinion — "still halfway" and "undo" are both plausible | **PRODUCT DECISION REQUIRED** |
| **G5** | What does a PARTIAL look like on the Today card? | none — deliberately not invented | **PRODUCT DECISION REQUIRED** |
| **G6** | Does a PARTIAL-only day earn a streak? | **NO**, follows from B-ii — but it is the ruling most likely to feel punishing, so it is flagged rather than assumed | **PRODUCT DECISION REQUIRED** |
| **G7** | Should `PARTIAL → FULL` emit a distinct event? | **NO new event.** One row, one task, one day — an UPDATE, not a second completion. A second row would break the "one logical completion → one canonical event" invariant P0-A established | recommendation |
| **G8** | Is the untick's non-regression of coverage acceptable? | **YES** — the ladder is monotonic by design; stated so the contract is honest about it | recommendation |

---

# H. RECOMMENDED RULING

> **PARTIAL is real evidence of work that is not a completion.**
>
> 1. It counts fully wherever the question is *"did work happen?"* — coverage,
>    topic recency, "was this touched".
> 2. It counts not at all wherever the question is *"was this finished?"* —
>    day closure, streak, emergency minimum. **(shipped)**
> 3. It counts as 0.5 only where the quantity is genuinely fractional — hours
>    credited **(shipped)**, and — pending G3 — the load ratio.
> 4. **PARTIAL → FULL is a valid, in-place upgrade**: one row, one task, one
>    day, no second event.
> 5. **FULL → PARTIAL is prohibited.** Correction is untick, then re-mark.
> 6. An untick removes the completion and does **not** regress coverage. That
>    is by design and is stated, not hidden.
> 7. Legacy `confidence = null` rows remain FULL, unchanged and unbackfilled.

**Four of the seven clauses are already true in code.** The contract's real
work is clauses 4 and 5, and the three open product decisions (G3, G4, G5) plus
the one that needs your judgement rather than mine (G6).

## What I would sequence next, once ruled

1. **P0-2.3a** — the transition (G1/G2/G7). Server-side, testable, no UX.
   Fixes the evidence-destroying path and unblocks `LoggingModal`.
2. **P0-2.3b** — the ratio (G3). One number, two call sites.
3. **P0-2.3c** — the card (G5/G6). Last, because it is the only part that needs
   a design and the only part with zero correctness risk.

Splitting it this way means the **evidence-destroying bug is fixed without
waiting on a visual decision** — which is the same reason P0-2.1 stopped where
it did.

---

**STOP.** No code. No schema. No migration. No facts. No insight work. No UI.
No historical repair. P0-2.3 not started; P0-3 not started.
