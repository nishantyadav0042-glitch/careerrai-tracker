# G4 — J6 `study_duration` Semantic Audit

**Gate:** G4 of the 0C.3G sequence (G1/J1 `eff5865`, G2/J7+J8 `0f1e968`, G3/J12 `1d249e6`).
**Ruling under audit:** J6 — *"`study_duration` is TWO facts: `self_reported_study_duration`
and `credited_study_duration`. Never merged. Sharing a unit does not make them the
same measurement."* (`docs/0C-3G-DAILY-EVIDENCE-CONTRACT.md`)
**Status:** READ-ONLY audit. No code, schema, migration, test or doc behaviour changed.
**Date:** 18 Aug 2026.

---

## VERDICT

**G4 remains OPEN. J6 is correct as a semantic ruling and is NOT implementable as
specified. Do not proceed to G5.**

Three findings, each independently blocking:

1. **The "no new storage required" claim from the Implementation Surface Audit
   (`95b1bb4`) is FALSIFIED.** `credited_study_duration` is reconstructable from
   persisted data for **98 of 293** real reports (33%), and of those only **39
   (13% of all real reports)** actually reproduce the value stored today. It is
   not a pure function of persisted data. New storage is required.

2. **No consumer wants the self-reported leg.** Of 30 consumers, **zero** classify
   as SELF-REPORTED. One classifies as CREDITED. The rest ask one question —
   *how much did this day amount to?* — which is the merged value J6 forbids.
   J6 as written creates a column nothing reads and removes the value everything reads.

3. **The column cannot represent UNKNOWN.** `study_duration NUMERIC(4,1) NOT NULL
   DEFAULT 0` (verified live). Zero currently means four different things, and
   **62 real rows across 38 students say the student declared they studied while
   the hours column reads 0.** Any split must first decide what a zero is; today
   it is a lie by omission that predates J6.

Four consumers could not be classified confidently and are listed in §6.
Per the fail-closed rule, that alone holds G4 open.

---

## 1. WRITER MAP (fresh sweep — five paths, not two)

The Implementation Surface Audit named two writers. A fresh sweep from every
writer of the column, not from that list, finds **five**. The third-path pattern
that G2 found in `topics_covered` repeats here, twice.

| # | Writer | Mechanism | What the value MEANS | Provenance |
|---|---|---|---|---|
| W1 | `LoggingModal` → `log-daily:184` | `p_study_duration: body.hours` where `body.hours = creditedHours({...})` computed **client-side** (`LoggingModal.tsx:190`) | Plan-coverage credit | **CREDITED** |
| W2 | `LoggingModal` rest toggle → same RPC | hard-coded `hours: 0` (`LoggingModal.tsx:154`) | "I rested" — a real declaration | **DECLARED ZERO** |
| W3 | `check-in-gate` → same RPC | hard-coded `hours: 0` (`check-in-gate.tsx:96`), with an explicit comment *"A check-in is not a study claim"* | The student was never asked | **UNKNOWN, stored as 0** |
| W4 | `TodaysRoutineCard` → `complete-task:261` | `p_study_duration: mergedHours = Math.max(earned, existingLog?.study_duration ?? 0)` where `earned = creditedHours({...})` computed **server-side** | Credit, floored by whatever was already there | **MERGED / MIXED** |
| W5 | Seed + demo migrations | `scripts/seed.mjs:41` (`randomInt(3,7)+random()`), `scripts/phase2-seed.mjs:103`, `scripts/seed-demo-data.sql:172/228/268/280/290`, `migrations/20260621_refresh_demo_dates.sql:85`, `migrations/20260707_demo_sales_asset_refresh.sql:128` | Fabricated | **FABRICATED** — bypasses the RPC and all validation |
| W6 | The column default | `NUMERIC(4,1) NOT NULL DEFAULT 0` (`001_initial_schema.sql:27`, verified live) | Never written | **STRUCTURAL DEFAULT** |

### W1/W4 divergence — two different `creditedHours` computations

`creditedHours` is called from **two places with different inputs and no
reconciliation**:

- **W1 (client):** `generatedHours` and `plannedTasks` come from the browser's
  copy of `/api/routine/today`, fetched when the modal opened. A plan that changed
  since is a stale denominator, and the server never validates the number it stores.
- **W4 (server):** the same formula recomputed from `daily_routines` at request time.

`offPlanCount: 0` is hard-coded at **both** call sites, so the off-plan branch of
`creditedHours` is currently dead. The audit brief asked specifically not to accept
the derivability claim on the strength of that hard-coding — see §4, where the
claim fails for reasons unrelated to it.

### Writer ordering in the integrated flow (`DailyTrackerApp.tsx:239-258`)

1. `submitLog()` → `log-daily` writes `study_duration` (W1) **first**.
2. *Then* the ticked tasks fan out to `complete-task` with `skip_day_close: true`.

So the credited number is persisted **before** the completion rows that justify it
exist. The fan-out is `.catch(() => {})` — every error swallowed. **Named, not fixed
(adjacent issue A1):** this is the J12 failure class in a second location — if the
fan-out fails, `study_duration` records credit for coverage that was never persisted,
and nothing anywhere reports it.

---

## 2. `mergedHours` traced through persistence and consumption

```
complete-task:252   mergedHours = Math.max(earned, existingLog?.study_duration ?? 0)
complete-task:261   → RPC upsert_log_and_streak(p_study_duration := mergedHours)
20260812:72         → UPDATE daily_reports SET study_duration = p_study_duration
                       (unconditional replace — the RPC itself has NO merge semantics)
                    → read back by all 30 consumers in §5 as one undifferentiated number
```

The `Math.max` exists because the RPC overwrites. It is the only thing preventing
the routine card from erasing a hand-made log. **Consequence for J6:** the merge
is not incidental — remove it without replacing the RPC's replace-semantics and
the routine card starts shrinking student logs again. The Implementation Surface
Audit did not surface this coupling.

**Live proof the merge binds:** of 114 real reports that have completion rows,
**38 store MORE than the derivation yields** — i.e. the `max` took the existing
value, not the earned one — and **21 store LESS**, which the `max` cannot produce
at all (see §4).

---

## 3. PROVENANCE MATRIX — what a stored value actually means today

| Stored value | Possible meanings (indistinguishable in the column) | Real rows |
|---|---|---|
| `0` | (a) honest rest day (W2) · (b) check-in answered, hours never asked (W3) · (c) plan existed but nothing ticked · (d) never written, column default (W6) | 150 |
| `> 0`, day has completions | client credit (W1) · server credit (W4) · `max`-merge of either with a prior value | 106 |
| `> 0`, day has **no** completions | pre-9-Aug typed number · hand log · fabricated seed (W5) | 71 (38 real) |
| any | fabricated (W5) — indistinguishable from real by value alone | 36 demo rows |

### The zero problem, quantified (real non-demo rows only)

| `day_outcome` | has completions | has topics | rows | students |
|---|---|---|---|---|
| `not_studied` | no | no | 54 | 38 |
| **`studied`** | **no** | **no** | **30** | **20** |
| `partial` | no | no | 16 | 14 |
| `skipped` | no | no | 13 | 10 |
| `null` | no | yes | 12 | 10 |
| `null` | no | no | 9 | 8 |
| `partial` | no | yes | 7 | 7 |
| **`studied`** | **yes** | **yes** | **7** | **3** |
| `partial` | yes | yes | 2 | 2 |

**62 real rows across 38 students carry `day_outcome ∈ {studied, partial}` with
`study_duration = 0`.** The student declared study; the column says zero. Every
`> 0` consumer in §5 reads those days as non-study days.

Additionally **7 of 18** rows with `Mock` in `topics_covered` store 0 hours — a
student who sat a full mock and ticked no plan topic earns zero credit, because
`finalSections` includes `Mock` but `creditedHours` counts only plan tasks.

**This is a live truthfulness defect that exists today, independent of J6.** It is
the same shape as the J2 sleep-flag finding: absence of evidence rendered as a
specific, confident number.

---

## 4. HISTORICAL RECONSTRUCTION LIMITS — the falsification of "no new storage"

`creditedHours` needs three inputs: `generated_hours`, `plannedTasks`
(= `jsonb_array_length(daily_routines.tasks)`), and the full/half completion counts.
Reconstructing it for history requires all three to still exist, unmutated, per day.

**Real (non-demo) reports: 293.**

| Condition | Rows | Consequence |
|---|---|---|
| No completion rows that day | 179 | derivation yields 0 |
| …of which store **positive** hours | **38** (33 students, 104 h) | derivation would **zero out real evidence** |
| No `daily_routines` row at all | 57 | no denominator — underivable |
| …of which store positive hours | 3 | underivable and non-zero |
| `generated_hours IS NULL` but hours stored | 27 | no denominator — underivable |
| **Complete derivation inputs present** | **98 (33%)** | the only reconstructable set |

Of those 98 reconstructable rows (114 completion-bearing minus 16 lacking a
plan/denominator):

| Outcome | Rows |
|---|---|
| Derivation **matches** stored value | **39** |
| Stored **exceeds** derived (the `max` merge, or a hand log) | 38 |
| Stored **below** derived | 21 |

**39 of 293 real reports (13%) reproduce.** The 21 "stored below derived" rows are
decisive on their own: the `Math.max` writer can never store *less* than `earned`,
so those rows prove the derivation inputs have **changed since the write**. The
derivation is not merely lossy — it is not even a lower bound on what was stored.

### Two structural reasons reconstruction cannot be repaired

- **`daily_routines` is `UNIQUE (student_id, routine_date)`**
  (`20260814_plan_uniqueness.sql:27`). A plan regeneration **overwrites `tasks` and
  `generated_hours` in place.** The denominator used at write time is destroyed.
- **`daily_routines` has no `updated_at`** (columns verified live: `id, student_id,
  routine_date, phase, tasks, est_minutes, created_at, swapped_out, calibration,
  generated_hours, version`). We therefore **cannot even detect** which rows were
  rewritten after their report was written. `version > 1` on only 1 real row, but
  `version` was added 14 Aug — it cannot describe the 12 Jul – 14 Aug history where
  most of the divergence lives. 114 routines carry `generated_hours IS NULL`.

**Answer to audit question 7:** `credited_study_duration` is derivable **only for
the post-14-Aug integrated tick flow, and only while the plan is not regenerated**.
It is not derivable for history.

**Answer to audit question 8:** the no-new-storage claim fails, and **not** because
of the `offPlanCount: 0` hard-coding. It fails because (i) the derivation's
denominator is stored in a destructively-mutable row, (ii) 67% of real reports lack
complete inputs, and (iii) 21 rows prove the inputs already drifted from what was
written. `offPlanCount` is a red herring; the mutable denominator is the blocker.

### Era split (the 9 Aug ruling boundary)

| Era | Real reports | With hours | Total hours | Students |
|---|---|---|---|---|
| Pre-9-Aug (self-report era) | 170 | 95 | 373.5 | 74 |
| Post-9-Aug (credited era) | 123 | 48 | 169.1 | 72 |

**58% of real reports and 69% of all logged hours predate the credited era.** Any
backfill rule decides the meaning of the majority of the dataset. All four
classification passes independently flagged the missing backfill rule as the thing
they could not proceed without.

---

## 5. CONSUMER CLASSIFICATION — all 30

Classified by four independent passes over the actual code (not the grep line),
then spot-verified. `TOTAL` = TOTAL/DAY VALUE.

| # | Consumer | Class | Blast radius if repointed at one leg |
|---|---|---|---|
| 1 | `lib/plan-extension.ts:29,96-101` | **CREDITED** | **P0.** Deficit → `syllabus_target_date`. Self-reported leg extends a completed week's finish date ~7 days + red warning |
| 2 | `api/cron/weekly-plan-reconcile:71,78` | TOTAL *(unresolved — §6)* | **P0.** The only writer of `syllabus_target_date`; the only path that penalises a student |
| 3 | `lib/analytics.ts:23,24` (`avgStudy`,`totalStudy`) | TOTAL | `studyScore` = 25/100 → band; `avgStudy < 3` red flag. **No null guard** — see NaN hazard below |
| 4 | `lib/analytics.ts:82` (`studyTrend`) | TOTAL | same summary object |
| 5 | `api/cron/check-red-flags:29` → `computeSummary` | TOTAL | Buddy `red_flag` notification + email. Tick-only students trip it |
| 6 | `api/cron/weekly-digest:37` → `computeSummary` | TOTAL | Buddy digest "N/100 (band)" |
| 7 | `admin/students/page.tsx:58` → `computeSummary` | TOTAL | Admin list score/band/red-flag pill |
| 8 | `admin/buddies/roster/page.tsx:57` → `computeSummary` | TOTAL | Mentor-quality red-flag count |
| 9 | `lib/lis-health.ts:120` → `computeCapacity` | TOTAL *(unresolved — §6)* | Cohort capacity bands, `/admin/lis-health` |
| 10 | `lib/lis-health.ts:162` (`>0` gate) | OTHER (activity presence) | Cohort direction |
| 11 | `lib/student-360.ts:107` → `computeCapacity` | TOTAL *(unresolved — §6)* | Admin 360 "studies ~Xh" / "plan sized to Xh" |
| 12 | `lib/student-360.ts:143` (`>0` gate) | OTHER (activity presence) | 360 direction |
| 13 | `api/routine/today:96,138` → `computeCapacity` | TOTAL *(unresolved — §6)* | `capacityGapHours` → home intelligence |
| 14 | `api/routine/today:310` `activeDays21` | OTHER (binary activity) | `momentumProxy` |
| 15 | `api/routine/today:313-318` | OTHER (activity trend) | Performance direction on home card |
| 16 | `lib/weekly-diagnosis.ts:43` | TOTAL | Buddy + admin "Studied N of 7 days (Xh logged)" |
| 17 | `lib/weekly-diagnosis.ts:96` | TOTAL | Volatility line; zero-mean makes it vanish |
| 18 | `lib/os/peer-cohort-data.ts:97-112` | **CREDITED** *(has a written contract)* | `peer-cohort.ts:350` — "observation vs observation, never self-report vs observation". Student peer-pulse card |
| 19 | `lib/buddy-briefing.ts:111` | TOTAL | Paid mentor briefing "avg X hrs/day" |
| 20 | `lib/buddy-case-data.ts:53` | TOTAL *(unresolved — §6)* | **Inverts.** 0 does not suppress the finding, it *fires* it: "You're falling behind your own plan" on the paid-conversion screen |
| 21 | `lib/prep-gain.ts:72-75` | TOTAL *(unresolved — §6)* | Student PaceCard "Xh extra prep since your first week" |
| 22 | `components/buddy/cockpit.tsx:91` → `computeBreach` | TOTAL | Buddy cockpit "Plan breached" banner; changes mentor's prescribed action |
| 23 | `buddy/(dashboard)/trends/page.tsx:41,52` | TOTAL | `select('*')` + non-null type → renders **`NaN h`** if the column is dropped |
| 24 | `student/tracker/page.tsx:88,258` | TOTAL | 7-day sparkline |
| 25 | `student/profile/history-section.tsx:49` → `computeSummary` | TOTAL | "Total study — N hrs". Client anon-key select — new columns need RLS/grant parity |
| 26 | `student/profile/history-section.tsx:103` | TOTAL | Per-day row; NULL renders `" hrs"` with no number |
| 27 | `student/debug/page.tsx:56,130` | TOTAL | NULL renders `"nullh"` |
| 28 | `api/weekly-signal:79` / `api/feedback-draft:57` / `api/chat/draft:88` | TOTAL | Three buddy-facing avg-hours surfaces, all `?? 0` |
| 29 | `api/logging/log-daily:106,150` | **OTHER — round-trip compare** | Not a metric. Feeds `isAlreadyPersisted`. **If write and read point at different columns, P0-1 regresses**: a saved log answered "Couldn't save that" |
| 30 | `api/logging/log-daily:389,435` `studyDaysIn7` | **CREDITED (intent)** | Student-facing "N/7 study days last week." Credited-only read silently zeroes all pre-9-Aug days |

**Non-consumers found (dead selects — verified by reading both files):**
`lib/student-dna.ts:69` and `lib/mentor-doors.ts:151` both `select` `study_duration`
and never read it; only `report_date` is used. `lib/capacity-engine.ts:32` and
`types/index.ts:28` are a contract comment and a type declaration, not reads.

### Headline: the distribution itself is the finding

**SELF-REPORTED: 0. CREDITED: 3 (one by intent, one by written contract, one by
syllabus logic). TOTAL/DAY VALUE: ~20. OTHER: 7.**

J6 splits a column into two facts when **no consumer asks for one of them** and
almost every consumer asks for the merged value. The natural fix every classifier
independently reached — `COALESCE(credited, self_reported)` at read time — is a
merge, which is precisely what J6 forbids. That tension is a ruling-level question,
not an implementation detail.

### Cross-cutting hazards found

- **NaN hazard (verified at `analytics.ts:23-24`).** `avg(reports.map(r => r.study_duration))`
  and `reduce((s,r) => s + r.study_duration, 0)` have **no null coalescing**, and
  `types/index.ts:28` declares `study_duration: number` (non-nullable), so the
  compiler will not warn. A nullable leg yields `NaN` → `overallScore` `NaN` →
  **every student pins to "Needs intervention"**, and `NaN < 3` is `false` so the
  red flag **stops firing entirely and silently**. Affects consumers 3–8.
- **Silent degradation is the norm.** Consumers 18, 20, 21 fail by *disappearing*
  or, worse, by *inverting*: consumer 20 treats 0 as evidence the student is behind.
- **Guard tests pin the current shape verbatim.** `log-hours-decimal.guard.test.ts:28`
  pins `p_study_duration:  body.hours`; `coverage-advance-truthful.guard.test.ts`
  pins the `mergedHours` line (added by G3). Both must be updated deliberately.

---

## 6. CANNOT CLASSIFY CONFIDENTLY — fail closed

Per the brief, one unclassifiable consumer holds G4 open. There are four.

1. **The capacity engine's input** (consumers 9, 11, 13). `capacity-engine.ts:1-10`
   says "believe behaviour, not onboarding input" — but *both* legs are behaviour.
   Choosing **credited** creates a closed downward ratchet: credit is capped by
   `generated_hours`, which is sized from capacity, which would then be computed
   from credit — a student who never fully completes a day drives their own plan
   monotonically down with no floor. Choosing **self-reported** reopens the exact
   failure the 9 Aug ruling closed.
   *Mitigating fact I verified myself:* **`capBudget` has zero callers** — it is
   referenced only in a comment at `daily-hours.ts:18`. So capacity does **not**
   resize plans today. The ratchet is one call site away, not live.
   **Adjacent issue A2 (named, not fixed):** `admin/student/[id]/page.tsx:179`
   displays *"plan sized to {sustainableHours}h"* while nothing sizes the plan to it.
   **Needs:** a ruling on whether sustainable capacity means *hours sat* or
   *plan-hours earned*.

2. **`weekly-plan-reconcile` / `plan-extension`** (consumers 1, 2). The only path
   that penalises a student and the only real writer of `syllabus_target_date`. The
   two legs give **opposite verdicts** for a hand-logged-but-unticked day.
   **Needs:** is the weekly deficit measured against *stated effort* or *earned coverage*?

3. **`buddy-case-data.ts:53`** (consumer 20). Compares logged hours against
   plan-derived planned hours, which argues CREDITED; but a student doing heavy
   off-plan self-study genuinely is not behind in the TOTAL sense. It appears on a
   paid-conversion surface and **fires** on zero.
   **Needs:** does "logged Yh" there mean plan work done, or total effort?

4. **`prep-gain.ts`** (consumer 21). Compares a baseline window (first 3 days on
   record — for most students pre-9-Aug, i.e. self-reported) against a recent window
   (credited). **It already compares two provenances today**, and `prep-gain.ts:14-15`
   forbids "a number we cannot show the working for."
   **Needs:** a ruling on whether the gain line must be suppressed for students whose
   baseline predates 9 Aug. This is a TRUST-OS question.

**Plus the blocker every pass named independently:** J6 specifies no **backfill rule**.
With 58% of real reports and 69% of logged hours predating the credited era, the
backfill rule decides the meaning of the majority of the dataset. It cannot be
inferred from code.

---

## 7. EXACT BLOCKERS

| # | Blocker | Why it blocks | Resolvable by |
|---|---|---|---|
| B1 | `credited_study_duration` is not derivable for history (13% reproduce) | The gate's premise — "no new storage" — is false | Founder: accept new storage + an explicit `UNKNOWN` for history |
| B2 | No backfill rule in J6 | Decides the meaning of 58% of reports / 69% of hours | Founder ruling |
| B3 | Column is `NOT NULL DEFAULT 0`; zero means four things | The split cannot be truthful while UNKNOWN is unrepresentable | Schema decision (nullable new columns) |
| B4 | No consumer wants the self-reported leg; ~20 want the merged value | J6 as written removes what everything reads | Founder: revisit J6's *"never merged"* — see §8 |
| B5 | 4 consumers unclassifiable (§6) | Fail-closed rule | Four founder rulings |
| B6 | `analytics.ts` NaN hazard + non-nullable `types/index.ts:28` | Silent cohort-wide band corruption + red flags silently ceasing | Must land in the same commit as any split |
| B7 | Removing `Math.max` reopens log-shrinking | The RPC replaces unconditionally (`20260812:72`) | Must be handled with, not after, the split |

---

## 8. RECOMMENDED G5 STORAGE SHAPE

**The evidence does not support recommending a storage shape yet.** B1–B5 are all
ruling-level, and the brief permits a recommendation *only if* the evidence supports
one. It does not.

What the evidence **does** support, offered as input to those rulings rather than as
a design:

- The two facts J6 names are real and distinct — W1/W4 (credit) and the pre-9-Aug
  typed number are genuinely different measurements, exactly as J6 says.
- But the split J6 implies (two columns, consumers repointed) is **not** what the
  consumer map asks for. What the map asks for is: *keep one effective day value
  that every consumer reads, and add provenance beside it.* A `study_duration_source`
  discriminator would let a consumer that cares (18, 30, 1) filter by provenance,
  while the ~20 TOTAL consumers keep reading the value they already read —
  no NaN hazard, no backfill crisis, no RLS parity work, no `Math.max` removal.
  That is a materially smaller change than two columns, and it is *not* what J6 says.
- Whether that satisfies J6's *"never merged"* is a founder question. It preserves
  a merged **value** while making the merge **legible** — which may be the honest
  reading of the ruling's intent, or may violate it.

**Recommendation: do not open G5. Return J6 to the founder with §6's four questions
and §7's B1–B4.**

---

## 9. ADJACENT ISSUES — named, not fixed

| ID | Issue | Severity |
|---|---|---|
| A1 | `DailyTrackerApp.tsx:254` fans out completions with `.catch(() => {})`. Credit is persisted **before** the completions that justify it; a failed fan-out is invisible. Same class as J12, second location | P1 |
| A2 | `admin/student/[id]/page.tsx:179` shows *"plan sized to Xh"* while `capBudget` has zero callers — the plan is not sized to it | P2 (truthfulness) |
| A3 | 62 real rows across 38 students: `day_outcome ∈ {studied, partial}` with `study_duration = 0`. Check-in-gate writes a hard 0 into a NOT-NULL column that cannot say "not asked" | **P1 — live truthfulness defect, predates J6** |
| A4 | 7 of 18 mock rows store 0 hours — a full mock with no plan tick earns no credit | P2 |
| A5 | `analytics.ts:23-24` unguarded reduce + non-nullable `types/index.ts:28` | P1 if any nullable column ever reaches it |
| A6 | `daily_routines` has no `updated_at`, so post-hoc plan rewrites are undetectable — the reason B1 cannot be repaired by better queries | P2 (forensics) |
| A7 | Two `creditedHours` call sites (client W1, server W4) with independent inputs and no reconciliation | P2 |

---

## 10. METHOD

Writers swept from every write of the column (`grep` over `src`, `scripts`,
`supabase/migrations`), not from the prior audit's file list — which is how W3, W5
and W6 were found. Consumers classified by four independent passes over the actual
code; two claims that conflicted between passes (`capBudget` callers, the two dead
selects) were re-verified by hand, and the conflict was resolved against the pass
that was wrong. All production figures are read-only queries against
`pobhpszlsozeonejtzqy`, demo accounts excluded except where stated.

No code, schema, migration, test or documented behaviour was changed by this audit.
