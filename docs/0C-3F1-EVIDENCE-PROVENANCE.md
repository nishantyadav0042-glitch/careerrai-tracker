# 0C.3F.1 — Evidence Provenance Arbitration

**18 Aug 2026. AUDIT ONLY. No code, no migration, no schema change, no fact,
no rule, no consumer migration, no backfill, no historical repair.**

> **The standard is not "can we build it?" It is "can we prove what every value
> means?"** Where I cannot prove it, the entry says **UNRESOLVED** and I do not
> choose.

Provenance classes used throughout:

| Class | Meaning |
|---|---|
| `STUDENT_STATED` | the student explicitly supplied this exact value |
| `OBSERVED` | CareerRai directly witnessed the event (a tick, a submission) |
| `DERIVED` | computed from other evidence |
| `UNKNOWN` | no trustworthy evidence exists |
| `LEGACY_UNTRUSTWORTHY` | stored value whose provenance cannot be established |

---

# A. COMPLETE FIELD PROVENANCE MAP

Every writer traced by reading the write path, not the field name.

| Field | STUDENT_STATED | OBSERVED | DERIVED | Defaulted | Mixed? | Historical trustworthy? |
|---|---|---|---|---|---|---|
| `report_date` | — | ✅ always | — | — | no | ✅ **yes** |
| `student_id` | — | ✅ | — | — | no | ✅ yes |
| `day_outcome` | ✅ check-in tap | — | ✅ `deriveOutcome()` | null | **YES** | ⚠️ **value yes, provenance lost** |
| `study_duration` | ✅ full sheet | — | ✅ `creditedHours` | hard `0` | **YES** | ⚠️ **number yes, evidence class lost** |
| `topics_covered` | ✅ full sheet | ✅ tick sections | — | hard `[]` | **YES** | ⚠️ partly + two vocabularies |
| `mock_taken` | ✅ sheet | ✅ tick | — | `false` | mild | ⚠️ conflicts with `Mock` section on 9/26 |
| `emotional_chips` | ✅ | — | — | `{}` | no | ✅ **yes** |
| `mood_emoji` | ✅ sheet (`energy`) | — | — | `'💪'` by check-in | **YES** | ⚠️ check-in hard-codes 💪 |
| `notes` | ✅ | — | ✅ tick writes a canned note | null | **YES** | ⚠️ |
| `plan_fit` | ✅ | — | — | null | no | ✅ yes (nullable) |
| `blocker_reason` | ✅ | — | — | null | no | ✅ yes (nullable) |
| `confidence` | ⚠️ rarely | — | — | **RPC writes `4`** | **YES** | ❌ **unrecoverable** |
| `stress` | ❌ never | — | — | **RPC writes `2`** | no | ❌ **`LEGACY_UNTRUSTWORTHY`** |
| `sleep_quality` | ❌ | — | — | RPC `3` | no | ❌ |
| `overall_energy` | ❌ | — | — | RPC `4` | no | ❌ |
| `quality_focus` | ❌ | — | — | RPC `3` | no | ❌ |
| `difficulty` | ❌ | — | — | RPC `3` | no | ❌ |
| `nutrition_exercise` | ❌ | — | — | RPC `FALSE` | no | ❌ |
| `mock_name`, `quant/verbal/logic_score`, `total_accuracy` | ✅ | — | — | null | no | ✅ nullable — the only honest columns |
| `created_at` / `updated_at` | — | ✅ | — | `now()` | no | ✅ yes |

**Six fields carry mixed provenance in one column.** That is the finding this
phase exists to surface: `day_outcome`, `study_duration`, `topics_covered`,
`mood_emoji`, `notes`, `confidence`.

**Note the shape of the table.** Every nullable column is trustworthy. Every
`NOT NULL DEFAULT` column is not. That is not a coincidence — it is the
mechanism.

---

# B. `day_outcome` — PROVENANCE RULING

## The two paths, traced

| Path | Code | Class |
|---|---|---|
| Check-in gate | student taps one of four buttons → `finalOutcome` | **`STUDENT_STATED`** |
| Full log sheet | `deriveOutcome()`: all plan tasks marked full → `studied`; any mark or a mock → `partial`; else `null` | **`DERIVED`** |

Approximate split by row shape: ~112 rows check-in-shaped, ~58 sheet-derived.
**Exact attribution is impossible** — no column records which path wrote the
row. That is itself the finding.

## Strongest argument for ONE fact with a provenance marker

1. Both answer the same question — *"did study happen on day D?"* Different
   keys for one question is the split-brain the registry exists to prevent.
2. Two facts push a **precedence decision into every consumer**. Precedence
   logic in `if` statements is exactly the duplication 0C found eleven times.
3. `FactResult` already carries `Provenance` as a first-class field. This is
   what that field is for; not using it here means it was never needed.
4. The student and the system rarely disagree in practice — a merged fact is
   simpler and covers the common case.

## Strongest argument for TWO facts

1. **The Constitution already ruled this exact question in the other
   direction.** Self-report is typed `FACT` with
   `timeBasis: 'immutable_declaration'`, and guard §10 asserts a self-report
   fact *"carries no observed counterpart in the same key"* — a repeater's own
   words must survive whatever the evidence later shows. `day_outcome` is the
   same shape: what the student said versus what we watched.
2. **The disagreement is the most valuable signal either one produces.**
   *"Student said not_studied but ticked three tasks"* and *"student said
   studied but ticked nothing"* are the two most interesting rows in the table,
   and one column forces a winner and **destroys the disagreement**.
3. `semanticType` would differ: stated is `FACT`, derived is `DERIVED_FACT`.
   One key cannot hold two semantic types without lying about one of them.
4. A provenance marker on one fact still requires every consumer to branch on
   it — so argument (2) for merging does not actually survive; it relocates the
   branch rather than removing it.

## RECOMMENDATION: **two facts.** ⚠️ requires founder ruling

The registry precedent is decisive. The founder has already ruled that
self-report and observation may never share a key, and enforced it with a
guard. This is that case with different words.

The reconciliation between them — *"you said you rested, but you ticked three
topics"* — belongs in the **Rule Registry**, which is the layer built for
interpretation. Putting it in the fact layer is precisely the EVENT →
INTERPRETATION jump the founder named as how fake intelligence gets created.

**Consequence to accept:** `deriveOutcome()` must stop writing to the same
column the student's tap writes to. Until then, the derived value is
indistinguishable from the stated one and **neither fact can be registered.**

---

# C. HALF-TICK — MANDATORY INVESTIGATION

## C1. Production reality: **it has never happened**

| | |
|---|---|
| total `routine_task_completions` | **248** |
| `confidence = 'blue'` (half) | **0** |
| `confidence = 'green'` (full) | 217 |
| `confidence = null` | **29** |
| `yellow` / `red` (struggle) | 2 |
| students who have ever half-ticked | **0** |

**Every consequence below is latent.** No student is affected, there is no
history to reconcile, and the ruling is therefore free — it can be made purely
on what a half-tick *should* mean.

## C2. Three semantics exist for one tap

| Consumer | Reading | Source |
|---|---|---|
| **Hours** | **0.5 of a task** | `creditedHours`: `full + 0.5·half + offPlan` |
| **Day closure / streak** | **fully done** | `fullyDone = tasks.every(t => completedIds.has(t.id))` — **membership only; `confidence` is never read** |
| **Coverage ladder** | advances **one rung, ceiling `practicing`** | `applyConfidenceSignal`: blue → `rank+1` capped at `PRACTICING_RANK` (green caps at `REVISING_RANK`) |

The student-facing label is **"Got halfway."** The card's own comment documents
**only** the hours meaning: *"Half credits half the block's hours."*

**The day-closure reading is undocumented and contradicts the label.** A
student who half-ticks every task closes the day as fully done, advances the
streak, and is credited half the hours — four lines apart in the same function.

## C3. The 29 null-confidence completions

Bounded and legacy: **12–15 Jul only**, 12 students, before the portion control
shipped (first green tick 13 Jul). But the arithmetic is live:

```ts
const halfDone = completions.filter(c => c.confidence === 'blue' && …).length;
const fullDone = completedTasks.length - halfDone;   // ← null counts as FULL
```

**An UNKNOWN portion is credited as a full one.** 29 of 248 ticks (12%). Not
ongoing, but it is `UNKNOWN → a flattering value` in the tick path, and the
same class as everything else in this audit.

## C4. RECOMMENDATION ⚠️ requires founder ruling

**"Got halfway" means PARTIAL COMPLETION**, and therefore:

| Reading | Today | Proposed |
|---|---|---|
| hours | 0.5 | **0.5 — keep, it is correct** |
| coverage ladder | +1 rung, cap `practicing` | **keep, it is correct** — halfway earns practising, not revising |
| day closure | **counts as done** | **must not** |
| null-confidence tick | counts as full | **`UNKNOWN` — must not be credited as full** |

**The trade-off the founder must weigh:** if half-ticks stop closing the day, a
student who half-ticks everything never gets a closed day or a streak
increment. That is arithmetically honest and may read as punishing. It is a
product decision, not a data one, and I am not making it.

**I have deliberately not chosen the definition that creates fewer code
changes.** Making `fullyDone` confidence-aware is the larger change; it is also
the one that matches the label the student reads.

---

# D. `study_duration` — PROVENANCE RULING

## Four provenances in one `numeric NOT NULL DEFAULT 0`

| Origin | Class | Rows (approx.) |
|---|---|---|
| student typed it on the full sheet | `STUDENT_STATED` | ~107 |
| `creditedHours(generatedHours, plannedTasks, fullDone, halfDone, offPlan)` | `DERIVED` | tick-closed days |
| check-in gate hard-codes `0` | **`UNKNOWN`** | **62** |
| `max(earned, existing)` merge | **mixed within one value** | any tick-after-log day |

**The 62 rows** are `day_outcome ∈ {studied, partial}` with `study_duration = 0`
— the student affirmed study and no duration was ever collected. Today they are
indistinguishable from a stated zero.

**A fifth case, and the worst:** `complete-task` writes
`max(creditedHours(...), existingLog.study_duration)`. The stored number may be
the derived one or the stated one **and the row does not say which** — one
value, two provenances, resolved by a `max()` that leaves no trace.

## RECOMMENDATION: **two facts, not one with a marker** ⚠️ requires ruling

Unlike `day_outcome`, these are not two answers to one question. They answer
**different questions**:

- *stated* answers **"how long did you study?"**
- *derived* answers **"how much of the plan did you cover, priced in hours?"**

`creditedHours` is explicitly a **coverage** measure wearing an hours unit — its
own header says so: *"Hours credited from what the student COVERED, not from a
number they type."* Merging them would put a coverage ratio and a duration in
one fact key, which is the `syllabus_coverage_pct`-versus-`opened` mistake in a
different column.

**Do not merge them because both are measured in hours.** The founder's warning
was exactly right.

**UNRESOLVED and blocking:** the derived side cannot be defined until the
half-tick is ruled (Part C), because `creditedHours` takes `halfDone` as an
input. **D is gated on C.**

---

# E. `topics_covered` — PROVENANCE RULING

## What `[]` means today — four different things

| Origin | True meaning | Rows |
|---|---|---|
| check-in gate hard-codes `[]` | **`UNKNOWN`** — never asked | ~112 |
| full sheet rest path (`LoggingModal:151`) | **`STUDENT_STATED` none** | some of the 9 |
| schema default on a legacy row | `LEGACY_UNTRUSTWORTHY` | 12 (Jul) |
| student listed sections | `STUDENT_STATED` / `OBSERVED` via ticks | 170 |

**127 rows are `[]` and the four causes are indistinguishable.**

## Two vocabularies, confirmed and bounded

| Style | Rows | Accounts |
|---|---|---|
| section names (`QA`, `VARC`, `DILR`, `Mock`, `Revision`) | 170 | all live writers |
| **topic names** (`Percentages`, `Geometry`, `Para Jumbles`…) | **23** | demo `Arjun Sharma` (`is_demo=true`) + one superseded app-review account |
| empty | 127 | — |
| **mixed within one row** | **0** | — |

**No real student has a topic-vocabulary row.** The anomaly is bounded to
non-real accounts, and nothing in the schema prevents it recurring.

## RECOMMENDATION ⚠️ requires ruling

- **E1.** One vocabulary: **sections**. Topics belong to `topic_coverage`,
  which the Fact Registry already reads and which is trustworthy.
- **E2.** `[]` must be able to mean `SECTIONS_NOT_COLLECTED` distinctly from
  `SECTIONS_NONE`. It cannot today.
- **E3.** A later write must never shrink this list. `log-daily` replaces;
  `complete-task` merges. **The replace path erases tick evidence.**
- **E4. Do not clean historical data.** The 23 rows stay.

---

# F. WELLBEING — HISTORICAL BOUNDARY

## The measurement, split by account type

| | real students | demo accounts |
|---|---|---|
| rows with `stress ≠ 2` | **1** | 23 |
| rows with `confidence ≠ 4` | **4** | 26 |
| date range | **24 Jul only** | 19 Jul – 17 Aug |

**For real students, CareerRai has never meaningfully collected wellbeing.**
One stress row and four confidence rows, all on a single day, across the entire
history of the product.

| Field | Recoverable? | Earliest trustworthy date |
|---|---|---|
| `stress` | ❌ **never collected** | **none exists** |
| `sleep_quality`, `overall_energy`, `quality_focus`, `difficulty`, `nutrition_exercise` | ❌ never collected | none |
| `confidence` | ❌ **provably unrecoverable** | none |
| `emotional_chips` | ✅ **genuinely student-stated** | **the whole history is real** |

### Why `confidence` is provably unrecoverable

A fabricated `4` and a genuine student `4` are **byte-identical**, and `4` is a
legal answer. The 4 real rows found are a **lower bound, not a count** — any
student who chose `4` is invisible. No inference, no reconstruction, no
estimation can separate them. **This is a permanent property of the data, not a
gap waiting for effort.**

### The one wellbeing signal that IS trustworthy

`emotional_chips` is nullable-by-default, only ever written from student input,
and never asserted by the RPC. **Its entire history is real.** It is also the
signal whose response path is 82% dead (separate document).

**RECOMMENDATION:** the trustworthy wellbeing timeline **begins after the
eventual fix**, and the only wellbeing evidence CareerRai currently owns is
`emotional_chips`. Historical fabricated values remain untouched.

---

# G. H6 / H7 RELIABILITY FINDINGS

Full lifecycle traced: client → route → RPC → response → client.

| Case | Data correctness | **User-visible acknowledgement** |
|---|---|---|
| **H5** duplicate submission | ✅ RPC upserts on `(student_id, report_date)` | ✅ correct |
| **H8** RPC fails halfway | ✅ `plpgsql`, atomic rollback | ✅ correct |
| **H6** resubmit within 15s | ✅ **row is saved** | ❌ **route returns 429; no caller handles it.** Sheet shows *"Too many requests"*; check-in shows *"Couldn't save that. Check your connection and try again."* |
| **H7** RPC succeeds, client disconnects | ⚠️ row + streak committed; the `void` update never runs | ❌ **silent** — `day_outcome` absent, `confidence` left at the fabricated `4` |
| **H17 (new)** integrated log with ticked topics | ⚠️ log saved; `complete-task` fan-out is `.catch(() => {})` | ❌ **silent** — coverage advance can fail entirely and the student is told nothing; their Preparation Map simply does not move |

**The pattern across all three failures is the same:** the transactional core is
correct and the acknowledgement is not. In every case the data is fine or
partly fine, and **the student is told something false about it** — either
"it failed" when it succeeded, or nothing at all when part of it failed.

**H6 is the one to fix first** of the three, because it actively tells a
student their log was lost. A student who believes that will re-submit — and
be rate-limited again.

---

# H. PROPOSED EVIDENCE MODEL

Smallest model that can represent the five classes, **based only on what the
audit found**. No migration proposed, no nullable-column assumption, no new
event system.

## H1. The principle

> **Provenance is a property of a VALUE, not of a table.**

Every disputed field needs to answer two questions, not one:

```
    what is the value?          ← already stored
    where did the value come from?   ← stored nowhere
```

## H2. Three shapes, in increasing cost

| Option | Shape | Cost | Weakness |
|---|---|---|---|
| **O1 — provenance column per disputed field** | `study_duration_source`, `day_outcome_source`, `sections_source` | 3 small columns, no reader breaks | provenance and value can drift; nothing enforces the pair |
| **O2 — one provenance JSON per row** | `evidence_provenance jsonb` | 1 column | untyped; no constraint; invites a fourth vocabulary |
| **O3 — a separate evidence table** | one row per (day, field, value, source) | full normalisation | **a new event system — explicitly out of scope** |

**RECOMMENDATION: O1**, and only for the fields the audit proved carry mixed
provenance: `study_duration`, `day_outcome`, `topics_covered`.

Reasons: it is the only option that lets a consumer be **migrated one at a
time** — the value column keeps working untouched while a migrated consumer
starts reading the source; it adds no new vocabulary; and it does not require
the nullable migration the founder has already ruled NO-GO.

**What O1 does NOT solve, stated plainly:** it cannot recover history. Rows
written before the columns exist have `source = NULL`, which is itself
`LEGACY_UNTRUSTWORTHY` — correct, and the honest answer.

## H3. What must NOT be built

- ❌ nullable-column migration on the six wellbeing fields (ruled NO-GO; the
  `NaN` blast radius stands)
- ❌ a new event/outbox system
- ❌ any backfill, inference, or estimation of a `source` for existing rows
- ❌ a TypeScript-side `0 means UNKNOWN` convention

---

# I. ATTACK RESULTS

Fifteen cases, run against the current code. ✅ handled · ⚠️ latent · ❌ live.

| # | Attack | Result |
|---|---|---|
| 1 | says "studied", no hours | ❌ stored `0`; six consumers read "did not study" — **62 rows** |
| 2 | says "studied", **stated** 0 hours | ❌ **indistinguishable from #1** |
| 3 | says "rest" | ❌ collides with `NOT_RECORDED` — 9 rows |
| 4 | says no sections | ❌ `[]`; four causes indistinguishable — 127 rows |
| 5 | says studied, ticks nothing | ⚠️ sheet's `deriveOutcome()` returns `null`; check-in stores `studied`. **Two surfaces, two answers to one situation** |
| 6 | says studied **and** ticks tasks | ✅ consistent |
| 7 | **ticks imply study, student says not_studied** | ⚠️ **latent, 0 rows** — RPC `UPDATE` never touches `day_outcome`, so a stale `not_studied` can survive a later tick. 71 rows have been rewritten; the path is live |
| 8 | half-tick | ⚠️ **latent, 0 rows** — three contradictory readings (Part C) |
| 9 | null-confidence tick | ❌ **credited as full** — 29 rows, bounded to 12–15 Jul |
| 10 | duplicate submission | ✅ idempotent upsert |
| 11 | retry after timeout | ❌ **429, student told the save failed** (H6) |
| 12 | client disconnect after RPC | ❌ silent partial state (H7) |
| 13 | **integrated log, tick fan-out fails** | ❌ **silent** — `.catch(() => {})`, coverage never advances (H17) |
| 14 | legacy fabricated confidence | ❌ 282 rows, unmarked, unrecoverable |
| 15 | missing field | ❌ impossible — every column is `NOT NULL DEFAULT`. **The schema guarantees a value where there is no evidence** |

**Two attacks pass. Both are the RPC's doing.** Every other failure is in a
layer wrapped around a correct transactional core.

---

# J. EXACT DECISIONS REQUIRED FROM FOUNDER

| # | Decision | My recommendation | Blocked by |
|---|---|---|---|
| **J1** | `day_outcome`: one fact with provenance, or two facts? | **two facts** — the self-report guard already rules this | — |
| **J2** | Must `deriveOutcome()` stop writing the student's column? | **yes** — otherwise neither fact can be registered | J1 |
| **J3** | Half-tick: what does "Got halfway" mean? | **partial completion** — hours 0.5 ✅, ladder +1 ✅, **day closure must not count it** | — |
| **J4** | If half-ticks stop closing the day, is a half-ticked day streak-less? | **no opinion — product decision** | J3 |
| **J5** | Null-confidence tick: full, half, or UNKNOWN? | **UNKNOWN**; bounded to 29 legacy rows | — |
| **J6** | Duration: one fact with provenance, or two? | **two** — they answer different questions | **J3** |
| **J7** | `topics_covered`: one vocabulary? | **sections only** | — |
| **J8** | May a later write shrink recorded sections? | **no** — fixes the erase-on-sheet path | — |
| **J9** | Wellbeing: accept that no trustworthy history exists? | **yes**; `emotional_chips` is the only real signal | — |
| **J10** | Evidence model shape | **O1** — per-field source columns, three fields only | J1, J3, J6 |
| **J11** | H6: tell the student the truth on a rate-limited resubmit | **yes — smallest and most valuable fix in this document** | — |
| **J12** | H17: should a failed coverage advance be silent? | **no** | — |

**UNRESOLVED, reported rather than chosen:**
- **`REST` vs `NOT_STUDIED`** — a product distinction, no data opinion available.
- **`null` `day_outcome`** — means "not asked" and "not inferable" and the row
  cannot say which. Cannot be settled until J1/J2.
- **Duration semantics (J6)** — genuinely gated on J3; any answer given now
  would be a guess.

---

# K. RECOMMENDED IMPLEMENTATION SEQUENCE

Each step states old semantic → new semantic → students affected.

| # | Step | Students affected | Why it is safe |
|---|---|---|---|
| **K1** | **H6** — stop telling the student a saved log failed | anyone who double-taps | Pure acknowledgement fix. No data, no schema, no semantic. |
| **K2** | **J3 stop presenting wellbeing as measurement** (from 0C.3e) | every briefed student | Deletes fabricated sentences. No new data needed. |
| **K3** | Retire the burnout + sleep detectors, record the gap | **0** — never fired | Removing something that never fired cannot change an experience. |
| **K4** | Stop the RPC asserting wellbeing | future rows | **Must ship with K2**, never alone. |
| **K5** | Half-tick ruling (J3/J4) | **0 today** | Zero half-ticks exist. Free to rule now, expensive to rule later. |
| **K6** | H17 — surface a failed coverage advance | anyone whose tick fan-out fails | Error surfacing only. |
| **K7** | Provenance columns (O1) | none initially | Additive; readers untouched until migrated one at a time. |
| **K8** | Then, and only then, the state model and the transaction contract | — | Needs J1–J8 ruled. |
| **K9** | Then 0C.3b | — | — |

**K1 and K5 are the two free wins.** K1 is a client-side error branch. K5 costs
nothing today and becomes a migration the first time a student half-ticks.

---

# L. GO / NO-GO

## 🔴 NO-GO on 0C.3b. Unchanged.
## 🔴 NO-GO on the state model, the schema, and any migration.
## 🔴 NO-GO on all historical repair.

| Item | Verdict |
|---|---|
| K1 — H6 acknowledgement fix | 🟢 **GO — smallest, most valuable, no semantics involved** |
| K2/K3 — wellbeing display + dead detectors (already approved) | 🟢 GO |
| K4 — stop the RPC asserting | 🟡 GO **only with K2** |
| K5 — half-tick **ruling** (not implementation) | 🟢 **decide now** — zero rows, zero cost, zero risk |
| K7 — provenance columns | 🔵 **DECISION, no code** — needs J1, J3, J6 |
| State model / transaction contract | 🔴 NO-GO until J1–J8 |
| Nullable wellbeing migration | 🔴 NO-GO (unchanged) |
| Backfill of anything | 🔴 NO-GO (unchanged) |

## Can we prove what every value means?

**No — and now we know exactly which ones, and why.**

| | Fields |
|---|---|
| **Provable** | `report_date`, `emotional_chips`, `plan_fit`, `blocker_reason`, mock scores, timestamps |
| **Provable value, lost provenance** | `day_outcome`, `study_duration`, `topics_covered` — **fixable going forward** |
| **Permanently unprovable** | `confidence`, `stress`, `sleep_quality`, `overall_energy`, `quality_focus`, `difficulty` — **not fixable, only markable** |

**The Fact Registry reads none of the unprovable fields.** Verified a fourth
time: `log-insight` consumes eight facts, all of which read distinct dates or
`topic_coverage`. **The contamination has not reached the Insight Engine, and
this audit is the reason it will not.**

---

**STOP.** No code. No migration. No schema change. No fact. No rule. No
consumer change. No historical repair.
