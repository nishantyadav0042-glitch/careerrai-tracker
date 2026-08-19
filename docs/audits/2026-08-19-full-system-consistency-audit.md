# CareerRai — Full System Consistency + Regression Audit

**19 Aug 2026. READ-ONLY. No code, no migrations, no data changes, no deploy.**
Everything below was re-verified against git, the filesystem and production. No
previous agent summary was taken on trust, and two of them turned out wrong.

---

## STOP — FOUNDER REVIEW REQUIRED BEFORE THE NEXT DEPLOY

Not a live outage. Students are not currently being harmed. But **merging
`claude/status-update-t1g5as` as it stands would actively make the system
less truthful**, and that branch is the obvious next step after today.

`daily_reports.study_duration` is **`numeric NOT NULL DEFAULT 0`**.
`durationIsUnknown()` on that branch decides unknown-ness from
`study_duration_source = 'not_collected'`. That column is **NULL in 342 of 342
production rows**. So on deploy, `durationIsUnknown()` returns **false for every
row that exists** — every unmeasured day would be classified as *measured*, and
the neutral-prior logic built in G7 would never fire.

The week's provenance work is well-built and rests on a premise nobody checked:
that UNKNOWN was representable. **It never has been.** Details in F3/F5.

---

## 1. SYSTEM STATE AT AUDIT START

| Fact | Value |
|---|---|
| main HEAD | `141e788` |
| origin/main | `141e788` (0 ahead, 0 behind) |
| Uncommitted / unpushed | **none** |
| Deployed | `dpl_9bwQzsEe7RwfDybx7nBc4xfihW29`, READY, sha `141e788` |
| Serving | `careerrai.in` returns `data-dpl-id=dpl_9bwQ…` — verified, not inferred |
| Tests | **1998 passing, 1 skipped** |
| tsc | clean |
| eslint | 0 errors, **49 warnings** |
| build | clean |

### LIVE IN PRODUCTION
Everything up to `141e788`: notification reliability v1+v2, singleton Supabase
client, login cache fix, tick-tap-target, `3c4481a` tick/day gap, A1 telemetry
(`42f7731`), the ₹299 rung + rewritten claim (`4b7cc19`), G12 nudge
instrumentation (`141e788`).

### ON MAIN BUT NOT DEPLOYED
None. main == deployed.

### ON OTHER BRANCHES — the large one
`claude/status-update-t1g5as` @ `acb5bb8`: **69 commits not in main.**
Contains, in full: 0C.3F/0C.3G, the Daily Evidence Contract, J1–J8, G1–G3, G4,
J6 memo, **J6-A**, **A3**, **G5 + `study-duration-source.ts`**, G6, **G7**,
**Q3**, **Q4**, **Q5**, off-plan log sheet, G8, `~nullh`, G9, the blue CHECK
P0, G10A/G10B, PARTIAL completion contract, rating prompts, topics-covered
contract, plus ~15 new test files.

**None of it is in production.** The rulings are real; the behaviour is not.

### DATABASE-ONLY CHANGES — the drift
Applied to production, **file missing from main's `supabase/migrations/`**:

| Ledger version | Name | On main? |
|---|---|---|
| `20260818192801` | `study_duration_provenance` | **NO** |
| `20260819061146` | `confidence_accepts_half_tick` | **NO** |

Two further branch migrations (`rating_prompts`, `logged_for_no_competing_day`)
exist as files on the branch and are **not** in the production ledger.

**A rebuild from main's migrations does not reproduce production.**

### PARKED / DEFERRED
G12-A (source attribution on `buddy_unlock_open`), A1 write-ordering, G7
threshold disposition, A2, G10 transaction rewrite, G11.

### UNKNOWN
Whether the ~2,900-line unmerged branch still applies cleanly to today's main.
Not tested — testing it is a merge, which this audit may not perform.

---

## 2–5. WHAT WE CHANGED, AND WHETHER IT IS REAL

The single most important column in this audit:

| Item | Ruled | Implemented | Tested | **Deployed** |
|---|---|---|---|---|
| A3 `dayWasStudied` | ✅ | ✅ | ✅ | **NO** |
| J6 / J6-A contract | ✅ | (doc) | ✅ | n/a |
| G5 `study_duration_source` | ✅ | ✅ | ✅ | **DB only, code NO** |
| stamp-the-winner | ✅ | ✅ | ✅ | **NO** |
| G6 consumer audit | ✅ | (no-op by design) | n/a | n/a |
| G7 neutral prior / moodScore out | ✅ | ✅ | ✅ | **NO** |
| Q3 UNKNOWN ≠ 0 | ✅ | ✅ | ✅ | **NO** |
| Q4 capacity ignores unmeasured | ✅ | ✅ | ✅ | **NO** |
| Q5 check-in handoff | ✅ | ✅ | ✅ | **NO** |
| `~nullh` fix | ✅ | ✅ | ✅ | **NO** |
| blue CHECK P0 | ✅ | ✅ | ✅ | **DB yes, file NO** |
| G10B A1 telemetry | ✅ | ✅ | ✅ | **YES** |
| G12 nudge telemetry | ✅ | ✅ | ✅ | **YES** |
| ₹299 rung + claim | ✅ | ✅ | ✅ | **YES** |

**Two of fourteen items are actually live.** Every conclusion drawn this week
about improved truthfulness describes a branch, not the product.

---

## 6. ZERO / NULL / UNKNOWN — the central finding

### F3 — UNKNOWN was never representable `[P1, structural]`

```
daily_reports.study_duration : numeric  NOT NULL  DEFAULT 0
daily_reports.confidence     : smallint NOT NULL  DEFAULT 3
```

Production: **0 rows NULL, 161 rows = 0, 181 rows > 0** (342 total, 146 students).

The collapse everyone has been hunting at the *read* side already happened at
the *write* side, months ago, in the DDL. "Student said zero", "we never asked"
and "student skipped the field" are one indistinguishable value.

`confidence NOT NULL DEFAULT 3` is the same defect, never audited: every row
without a confidence answer silently reports a middling 3.

### F4 — the provenance column is installed and dead `[P1]`

`study_duration_source` is **NULL in 342/342 rows**, including **32 rows written
since 18 Aug**, after the column and the 9-arg RPC went into production.

Production has exactly one `upsert_log_and_streak`, 9 args, the 9th being
`p_study_duration_source text` with a DEFAULT. Deployed `log-daily/route.ts`
passes **8 named args**. The DEFAULT is the only reason logging still works —
remove it and every log in production fails immediately.

### F5 — the unknown-detector would be inert on arrival `[P1]`

`durationIsUnknown()` requires `study_duration_source === 'not_collected'`.
Zero production rows carry it. On deploy: every historical row reads as
*measured*. G7's neutral prior never fires; Q3's `avgOrNull` never returns null.
The fix ships and changes nothing, while the guard tests pass — because they
test the function, not the data it will meet.

### F10 — ~19 unfixed UNKNOWN→0 sites on main `[P2]`

Q3 fixed `analytics.ts` only, on the undeployed branch. Still live on main,
each of the form `sum(study_duration ?? 0) / daysLogged` — zero into the
numerator, one into the denominator, average understated:

`cockpit.tsx:91` · `weekly-plan-reconcile:82` · `routine/today:140,340` ·
`chat/draft:88` · `feedback-draft:57` · `weekly-signal:74` · `tracker/page:270` ·
`weekly-diagnosis:43,96` · `lis-health:119,158` · `buddy-briefing:99` ·
`buddy-case-data:53` · `student-360:106,137` · `complete-task:181`

**Classification: all UNKNOWN COLLAPSED TO ZERO**, because F3 means the source
value is already ambiguous before these ever run.

---

## 7–8, 16. CROSS-FEATURE CONTRADICTION MATRIX (production counts, n=342)

| # | State | Rows | check-in says | duration says | completion says | Contradiction |
|---|---|---|---|---|---|---|
| 1 | hours + ticks | 110 | studied | measured | evidence | — consistent |
| 2 | **worked, 0 hours** | **65** | studied/partial | **0h** | mixed | **"studied" vs "0 hours"** |
| 3 | **hours, no ticks** | **71** | — | >0 | **none** | credit without evidence |
| 4 | **ticks, 0 hours** | **9** | — | 0h | evidence | evidence without credit |
| 5 | not studied | 59 | not_studied | 0h | none | consistent |
| 6 | rest / skipped | 16 | skipped | 0h | none | consistent |
| 7 | **no outcome, 0h** | **21** | **silent** | 0h | none | pure unknown, stored as zero |
| 8 | didn't study but hours | **0** | — | — | — | clean |

**145 of 342 rows (42%) sit in a contradictory state.**

### Concrete traces (real rows, not aggregates)

| Student / date | sd | outcome | src | ticks | routine | Reads as |
|---|---|---|---|---|---|---|
| `421b32bc` 18 Aug | 4.5 | — | — | 3 | 1 | normal, but no outcome recorded |
| `52490969` 04 Aug | 2.0 | partial | — | 1 | 1 | normal partial |
| **`352d0c81` 05 Aug** | **0.0** | **studied** | — | **3** | 1 | **ticked 3 tasks, said "studied", stored 0 hours** |
| `359ef420` 17 Aug | 0.0 | partial | — | 0 | 1 | worked, nothing measured |
| `0af6ea9a` 13 Aug | 1.3 | — | — | 0 | 1 | hours with no plan evidence |
| `16286a33` 24 Jul | 4.0 | — | — | 0 | 1 | same, 4 hours |
| `1ac69bcc` 28 Jul | 0.0 | skipped | — | 0 | **0** | rest, no routine — clean |
| `ff9c7a50` 15 Aug | 0.0 | skipped | — | 0 | 1 | rest against a live plan |
| `6a48612b` 28 Jul | 0.0 | not_studied | — | 0 | 1 | honest zero |
| `d3aeb59b` 16 Aug | 0.0 | not_studied | — | 0 | 1 | honest zero |
| `52490969` 24 Jul | 0.0 | — | — | 0 | 1 | unknown |
| `52490969` 21 Jul | 0.0 | — | — | 0 | 1 | unknown |

`352d0c81` on 5 Aug is the whole audit in one row: three ticks, an explicit
"studied", and a duration of zero. Every averaging consumer in F10 reads that
student as having studied **0 hours**.

---

## 9. A1 — the telemetry answered nothing, and that is itself the finding

**`completion_write` events in production: 0. Zero. Since `42f7731` deployed.**

**SAMPLE INSUFFICIENT** does not cover this. 32 `daily_reports` rows were
written after the deploy, so logging is happening. The instrumented site fires
only when `!backdated && data.completedTasks.length > 0` inside the *integrated*
`DailyTrackerApp` fan-out. Zero events across two days of real logging says the
instrumentation **does not cover the path students actually use**, or that path
is not being exercised at all.

The 25% A1 estimate is **unrefreshed and unrefreshable** on current evidence.
The G10B gate was reported as "instrumented and awaiting evidence"; it is
better described as *awaiting evidence that may never arrive through this probe*.

Related: `routine_task_completions.confidence` = green 241, null 29, red 2 —
**still zero `blue` rows**, even though the CHECK now admits blue and main
writes it (`LoggingModal.tsx:166`). The half-tick remains unobserved in
production.

---

## 10. STUDENT-FACING FALSEHOODS STILL LIVE

| Surface | Says | Truth |
|---|---|---|
| `admin/student/[id]:179` | **"plan sized to {X}h"** | `capBudget()` has **zero callers**. Nothing sizes the plan by X. (A2, still open) |
| Every averaging surface (F10) | "you studied N hrs/day" | denominator includes days with no measurement |
| `profile/history-section:103` | `{study_duration}.toFixed(1)} hrs` | renders **"0.0 hrs"** for the 65 worked-but-unmeasured days |
| Consistency / streak surfaces | consistency % | denominator contains unmeasured days |

The Q3/Q4/G7 fixes for these exist. They are on the unmerged branch.

---

## 11. BUDDY / ₹299 FUNNEL

Audited fully in `docs/research/BUDDY-CONVERSION-RESEARCH-2026-08-19.md`
(already corrected once, in place). Standing items:

- `buddy_unlock_open` has **no source**, mounted from 3 surfaces — G12-A, deferred.
- Client `pay_success_callback` fired **2**; `student_payments` holds **4** paid.
  **`student_payments` is the ledger; client events are observability.** Any
  funnel built on the event stream understates success by ~50%.
- iOS: **no payment has ever completed in the app shell** (27 plan clicks);
  iOS Safari has completed at least one. The hand-off is Apple-required, not a bug.
- Modal-slot competition makes `shown ÷ eligible` the honest denominator, not 350.
- G12 observed: 1 impression, 1 `maybe_tomorrow` dismissal, 0 duplicates. n=1.

---

## 13, 19. DATABASE / SECURITY

### F8 — provenance is client-forgeable `[P1 on deploy, P3 today]`

```
daily_reports              "Student manages own reports"      ALL     {public}
daily_reports              "Students can insert their own…"   INSERT  {public}
routine_task_completions   "Students manage own task compl…"  ALL     {public}
```

A student holds `UPDATE` on their own `daily_reports` row. The moment
`study_duration_source` carries meaning, a client can write
`study_duration = 8, study_duration_source = 'credited'` directly, bypassing the
RPC entirely. The provenance mechanism authenticates **nothing**.

Today this is inert (the column is unused). It becomes P1 the day F4/F5 ship.
The RPC being `SECURITY DEFINER` does not help when a parallel client write path
to the same columns is open.

Same shape on `routine_task_completions`: completion evidence the product treats
as authoritative is client-writable.

---

## 14. TEST QUALITY

**1998 tests pass and that number is not reassuring.** F5 is the proof: a
function whose guard suite is green would classify 100% of production rows
wrongly, because every test supplies its own fixture and none meets the data.

| Class | Finding |
|---|---|
| **GOOD INVARIANT** | `unknown-is-not-zero.guard.test.ts`, `tick-idempotency.guard.test.ts`, `topics-covered-contract.test.ts`, the G12 contract suite |
| **FRAGILE** | **88 test files read source with `readFileSync`** and assert on literal strings/regexes. Three failed this week purely from re-worded comments or a moved offset. They break when the code becomes *more* correct. |
| **FALSE INVARIANT** | `whatsapp-backfill.guard.test.ts` still uses `execSync`/git state as a standing invariant — the exact pattern corrected three times elsewhere. |
| **MISSING** | No test asserts a *production-shaped* row. No test would have caught `NOT NULL DEFAULT 0`. No schema-vs-migrations drift test. No test that `log-daily` passes the provenance arg. |

---

## 18. REGRESSIONS

**Direct: none found.** Nothing shipped this week broke a working behaviour.
The two deployed items (A1 telemetry, G12) are additive and inert.

**Second-order, and the important one:** the *absence* of deployment is itself
the regression risk. Production is running pre-A3 semantics while the team
reasons about post-A3 semantics. Every decision made this week — Q3's averages,
G7's composite, Q4's capacity — describes a system nobody is using. That gap
widens each day the branch sits.

---

## 20. OPERATIONAL

- `complete-task` fan-out is one HTTP request per task, client-side, unbatched
  and unretried — the A1 surface. Unchanged.
- Events ingest runs a per-IP `count(*)` on `student_events` on **every** flush.
  At 485 events / 20 min that is a full count per batch on a growing table.
  Flagged, not urgent.
- G12 adds ≤4 events per student per day. Negligible.

---

## 21–22. THE BOARDS

### BOARD A — VERIFIED HEALTHY

| ID | Area | Evidence |
|---|---|---|
| A-1 | Deploy integrity | main == origin/main == deployed sha, verified via `data-dpl-id` |
| A-2 | G12 instrumentation | contract holds; `maybe_tomorrow` classified correctly; 0 duplicates |
| A-3 | Build health | 1998 tests, tsc clean, 0 lint errors, build clean |
| A-4 | Payment ledger | `student_payments` internally consistent; 4 paid, 25 orders |
| A-5 | `didn't study but hours` | **0 rows** — that contradiction genuinely does not occur |
| A-6 | Rest/skipped semantics | 16 rows, all consistent across subsystems |

### BOARD B — ACTIVE PROBLEMS

| ID | Sev | Area | Evidence | Population | Prod status | Why it matters |
|---|---|---|---|---|---|---|
| **B-1** | **P1** | Schema drift | 2 applied migrations absent from main | whole DB | **live** | main can no longer rebuild production |
| **B-2** | **P1** | Undeployed truth | 69 commits, 12 of 14 rulings | all 146 logging students | **live** | the product does not implement its own contracts |
| **B-3** | **P1** | `NOT NULL DEFAULT 0` | 161/342 rows = 0, 0 NULL | 146 students | **live** | UNKNOWN was never representable |
| **B-4** | **P1** | Provenance dead | `study_duration_source` NULL 342/342, incl. 32 post-ship | all rows | **live** | column exists, nothing writes it |
| **B-5** | **P1** | Detector inert on arrival | `durationIsUnknown()` false for every prod row | all rows | pending deploy | fix would ship and do nothing, silently |
| **B-6** | **P1** | A1 unprobed | `completion_write` = **0** across 2 days of real logging | unknown | **live** | the probe does not cover the real path |
| **B-7** | **P1** | A2 falsehood | `capBudget` 0 callers; `admin:179` claims "plan sized to Xh" | all founder views | **live** | a stated number nothing computes |
| **B-8** | **P2** | 42% contradictory rows | 65 + 71 + 9 = 145/342 | 146 students | **live** | subsystems disagree about the same day |
| **B-9** | **P2** | 19 unfixed avg sites | grep, F10 | every hours display | **live** | averages understated |
| **B-10** | **P2** | `confidence DEFAULT 3` | DDL | all rows | **live** | unaudited unknown→value collapse |

### BOARD C — CONSISTENCY RISKS

| ID | Sev | Area | Why |
|---|---|---|---|
| C-1 | P1-on-deploy | RLS `ALL {public}` on `daily_reports` | provenance forgeable the day it means anything |
| C-2 | P2 | RLS `ALL {public}` on `routine_task_completions` | completion evidence client-writable |
| C-3 | P2 | 8-arg RPC call survives only via DEFAULT | removing the default breaks all logging instantly |
| C-4 | P3 | 88 source-reading guard tests | fail when code improves; 3 did this week |
| C-5 | P3 | `whatsapp-backfill.guard.test.ts` git-state invariant | known-bad pattern, still present |
| C-6 | P3 | Zero `blue` rows despite constraint + writer | half-tick may be unreachable |
| C-7 | P3 | Events ingest per-IP `count(*)` per flush | grows with the table |
| C-8 | INFO | 49 eslint warnings | no errors |

### BOARD D — PARKED, DO NOT REOPEN HERE

G12-A · A1 write-ordering · G7 threshold disposition · G10 transaction rewrite ·
G11 · the 30 undetermined E2 rows · historical backfill (forbidden by J6-A)

---

## 24. EXECUTIVE

**1. Overall health.** The *codebase* is in good shape: green, typed, well
guarded, unusually well documented. The *system* is not, for one reason — the
thinking and the running product diverged, and nobody re-checked the schema the
whole design rested on.

**2. Top 5 risks.** B-3 (UNKNOWN unrepresentable) · B-5 (fix inert on arrival) ·
B-2 (12 of 14 rulings unshipped) · B-1 (schema drift) · B-6 (A1 unprobed).

**3. Top 5 consistency problems.** 42% contradictory rows · 19 averaging sites ·
`0.0 hrs` shown for worked days · A2's "plan sized to Xh" · client events vs
payment ledger.

**4. Top 5 solid.** Deploy integrity · G12 contract · payment ledger ·
zero `didn't-study-but-hours` · rest/skipped semantics.

**5. Data integrity.** No corruption. No loss. The integrity problem is
*expressive*: the schema cannot say "we don't know."

**6. Student-facing falsehoods remaining.** Yes — B-7, B-9, and "0.0 hrs" on 65
worked days.

**7. Hidden UNKNOWN→ZERO remaining.** Yes, and it is upstream of everything:
the column default itself, plus `confidence DEFAULT 3`.

**8. Duplicate sources of truth.** `dayWasStudied` (branch) vs `study_duration > 0`
(19 live sites). Payment truth: ledger vs client events — ruled, ledger wins.

**9. Deployed-vs-code mismatch.** Yes: B-1 and B-2, both directions.

**10. Fix next.** Nothing until a ruling. Recommended order below.

**11. Do NOT touch.** Historical rows (J6-A). `momentum.ts`. The 33 A1 rows.
G12 instrumentation. Pricing. Copy. Board D.

**12. Recommended next three gates.**

- **G13 — Representability.** Read-only. Decide how "unknown duration" is
  expressed at all, given `NOT NULL DEFAULT 0`. Every downstream ruling depends
  on this answer, and all of them currently assume an answer that is false.
- **G14 — Reconciliation.** Bring main's migrations and production's ledger into
  agreement, and decide the fate of the 69-commit branch: land it, re-cut it, or
  retire it. It cannot stay where it is.
- **G15 — A1 probe correctness.** Establish why `completion_write` is zero
  before drawing any conclusion from its silence.

**Audit only. Nothing was fixed, migrated, deployed, deleted or cleaned up.**
