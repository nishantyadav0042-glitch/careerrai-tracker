# Final triage — the decision board

**Mode:** read-only. Nothing implemented, nothing changed.
**Date:** 19 Aug 2026.
**Purpose:** close the 0C.3G / J6 / G6 / G7 workstream with a decision board, not another investigation.

---

## HEADLINE

**A1 is real, live, and larger than expected. It should outrank everything else here.**

**33 same-day logs across 29 students carry credited study hours and topic sections with
zero completion rows — 25.2% of every same-day credited log.** Backdating explains 1 of 34;
the off-plan feature explains 0. It is ongoing: 11 in the last 14 days, the most recent
yesterday.

Everything else on this board is either closed, cosmetic, or a founder decision.

---

## A1 — credit persisted before completion evidence · **P1, escalating to P0 if confirmed**

### The ordering, verified from code

`DailyTrackerApp.handleLogSubmit`:

```ts
const result = await submitLog({...});          // 1. daily_reports gets CREDITED hours
...
await Promise.all(data.completedTasks.map((t) =>
  fetch('/api/routine/complete-task', {...}).catch(() => {})   // 2. completions, failures swallowed
));
```

Credit is durable before the evidence for it is attempted. `.catch(() => {})` swallows network
errors, and there is **no `.ok` check**, so an HTTP 500 is discarded just as silently.

### What breaks downstream when completions are missing

`routine_task_completions` is the evidence base for `observed_day_outcome` (G1's DERIVED_FACT),
`advanceCoverage`, and every plan-completion ratio in `adaptation`, `lis-health` and
`student-360`. A row with credited hours and no completions is a day the system says was
studied and priced, while the record of *what* was studied is absent.

### Production measurement

| Measure | Value |
|---|---|
| Real reports | 285 |
| With credited hours (> 0) | 134 |
| …of which a plan existed that day | 133 |
| **Credited hours + sections + ZERO completions** | **34** |
| …explained by backdating (fan-out is deliberately skipped) | **1** |
| …explained by the off-plan feature (shipped 18 Aug) | **0** |
| **Unexplained, same-day** | **33 rows · 29 students** |
| **Share of all same-day credited logs** | **25.2%** |
| In the last 14 days | 11 (most recent 18 Aug) |
| Date range | 13 Jul → 18 Aug |

Every one of the 34 has `topics_covered` populated — sections are derived from the marked plan
tasks, so the client believed tasks were marked in all 34 cases.

### What could not be determined

**The mechanism.** A 25% failure rate on a same-origin POST is implausibly high for network
error alone, so `.catch(() => {})` is likely masking a *systematic* cause rather than being the
whole story. A notable signal: **25 of the 29 affected students have never had a single
completion row**, which points at a path that consistently produces no completions for them
rather than intermittent loss. Candidates not resolvable from stored data — `completionRequestFor`
returning nothing, a `/api/routine/today` seed failure leaving `taskChoice` empty, or
complete-task 404ing on a routine-date mismatch — need instrumentation, not more SQL.

### Recommended next gate

**G9 — A1 evidence-ordering audit.** Read-only first: instrument or reproduce the fan-out to
identify the mechanism before changing the ordering. Do **not** simply move the credit write
after the fan-out; that trades one inconsistency for another (evidence without credit) unless
the two become one transaction.

**Founder ruling required: NO** to investigate. **YES** before changing the write ordering.

---

## A2 — `capBudget` dead while the UI asserts plan sizing · **P2**

### Verified from code

- `capBudget` is **defined once** (`capacity-engine.ts:78`), **mentioned in one comment**
  (`daily-hours.ts:18`), and otherwise referenced **only by the guard test asserting it has no
  callers**. Zero production callers.
- `admin/student/[id]/page.tsx:179` renders an assertive badge: **"plan sized to
  {sustainableHours}h"**.
- `plan-day.ts` contains **zero** occurrences of `capacity` or `sustainable`. Plans are sized by
  `hoursForDayOf(profile, …)` — the student's **claimed** hours.

**The badge is false.** No plan has ever been sized to `sustainableHours`.

### Production

| Measure | Value |
|---|---|
| Students with a capacity readout | 90 |
| Past the behaviour threshold (badge shows a *different* number than claimed) | **4** |
| Below it (badge coincidentally equals claimed hours) | 86 |

So the claim is wrong for all 90 and *visibly* wrong for **4**.

### Risk if left

The badge is an operator-facing falsehood, currently small. The real risk is the reverse: wiring
`capBudget` in later to "make the display true" would silently shrink real students' plans —
the Pranav trap the capacity engine's own header warns about.

### Recommended next gate

Cheapest honest fix is **copy**: state what capacity *would* suggest rather than what the plan
*is*. Retiring `capBudget` or wiring it are both larger decisions.

**Founder ruling required: YES** — three options (fix the copy, wire the engine, retire it).

---

## G7 — `overallScore` / `band` · **PARKED, founder decision**

Evidence assembled; nothing further implemented.

1. **Composition now:** `(consistency + studyScore + mockScore) / 75 × 100`.
2. **Unknown duration:** neutral 12.5/25 in the scoring layer; `avgStudy` stays `null`.
3. **Mood:** removed from the composite. Measured as a constant 20.0 across 110 real reports
   (confidence/stress/energy each had exactly one distinct value). Data retained.
4. **Band distribution (72 students):** 0 On track · 7 Needs nudging · 65 Needs intervention.
5. **"On track" is unreachable, and always was.** Old maximum across all students was **69**
   against a 70 threshold. New range is 21–66.
6. **vs `momentum.ts`:** momentum takes recency, `activeDays14`, push engagement and buying
   intent. It uses **no duration** and `activeDays14` counts distinct `report_date`s, so it is
   immune to every defect in this workstream.
7. **What depends on `overallScore`/`band`:** the admin students list and the weekly digest.
   **No student- or buddy-facing surface reads either** (checked directly).
8. **Does it add information?** After the mood constant was removed, it is essentially
   *consistency + hours*, with `mockScore` a flat 12 for nearly everyone. Momentum measures more
   signals and drives the decisions that matter (sales queue, call queue, Mission Control).
9. **If retired:** the admin list loses a badge and the weekly digest loses a number. Both could
   read momentum instead. Red flags are independent and would survive.
10. **To retain honestly:** thresholds must be re-ruled (the current ones make one band
    unreachable), and `mockScore`'s flat 12 needs the same scrutiny mood just received.

Threshold candidates were measured and are recorded in `0C-3G-G7-OVERALL-SCORE-AUDIT.md`
**as a future ruling question only** — deliberately not recommended here.

**Founder ruling required: YES** — (a) does it survive at all; (b) if yes, what do thresholds mean.

---

## Arnav — three distinct things, closed

Deliberately separated, because they are **not** one causal chain:

| Finding | Status | Nature |
|---|---|---|
| Repeated forced re-logins | **CLOSED** (`189ef59`) | Device clears PWA storage. 10/10 `anon_id` resets match new sessions; 365/396 users have exactly one `anon_id`. Environment, not product. |
| Six measured days at zero hours | **Not a defect** | A real, measured state. He logged; the hours were genuinely zero. |
| `~nullh` in the capacity note | **CLOSED** (`06f86dc`) | Presentation only. `typical` is the median of an empty productive set. |

The `~nullh` display was **not caused by the session bug**. It was triggered by his zero-hours
state, which is itself a plausible *consequence* of sessions dying before he completes a log —
but that is an association, not a demonstrated causal chain, and it is stated here as such.

---

## THE BOARD

### 1. CLOSED
- P0-2 · J2 · 0C.3G contract · G1 · G2 · G3 · G4 · J6-A · A3 · G5 · G6 · Q2 · Q3 · Q4 · Q5
- Off-plan logging · how-to-log strip removed · three log-open events collapsed
- **G8** Arnav session forensic — environment, no code change
- **`~nullh`** capacity note — presentation fixed

### 2. ACTIVE — needs engineering
| Issue | Severity | Population |
|---|---|---|
| **A1 — credit without completion evidence** | **P1 → P0 if mechanism confirmed** | **33 rows · 29 students · 25.2% of same-day credited logs · ongoing** |

### 3. PARKED — needs founder ruling
| Issue | Severity | Decision needed |
|---|---|---|
| G7 `overallScore` / `band` | P2 | Retire, or keep and re-rule thresholds |
| A2 `capBudget` / "plan sized to Xh" | P2 | Fix copy, wire engine, or retire |
| A1 write-ordering change | — | Required *before* implementation, not before investigation |

### 4. FUTURE / LOW PRIORITY
| Issue | Severity | Note |
|---|---|---|
| Session durability on Android | P2 | One user today; revisit if storage eviction proves common |
| "Storage empty on boot" telemetry | P3 | Would have made G8 a five-minute diagnosis |
| `mockScore` flat 12 for most students | P3 | Same shape as the mood constant; only matters if G7 survives |
| 58 historical unmeasured rows | P3 | J6-A forbids rewriting. Leave. |
| P0-1 dedup vs J8 merge interaction | P3 | Named at G2; still cosmetic |

### 5. RECOMMENDED NEXT THREE GATES
1. **G9 — A1 mechanism audit** (read-only). The only active correctness issue, affecting a
   quarter of same-day credited logs. Find the mechanism before touching the ordering.
2. **G10 — A1 remedy** (needs the G9 finding + a founder ruling on ordering/transactionality).
3. **G11 — G7 disposition** (pure decision; retire or re-rule thresholds). Cheap once ruled.

A2 sits behind these: it is operator-facing, affects 4 students visibly, and its main risk is a
*future* wiring mistake rather than present harm.

---

## Method

Every figure is a read-only production query, demo and test accounts excluded. A1's population
was narrowed by ruling out backdating and the off-plan feature explicitly rather than assuming
the residual was a defect. Where the mechanism could not be established from stored data, that
is stated as unknown rather than inferred.
