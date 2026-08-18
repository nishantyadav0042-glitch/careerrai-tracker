# The Daily Evidence Contract — 0C.3G

**Locked 18 Aug 2026 by founder ruling. Binding.**
**AMENDED 18 Aug 2026 — J6 is superseded by [J6-A](#ruling-j6-a--provenance-must-be-legible-amendment-18-aug-2026).**

> This document does not choose a storage shape, propose a migration, or touch
> a single row. It defines what four facts *mean*, so that whichever shape
> implements them later cannot silently redefine them. `docs/0C-3F1-EVIDENCE-PROVENANCE.md`
> is the investigation that produced these four questions; this is the
> arbitration that answers them.

Founder ruling, this turn: **GO on J1, J6, J7, J8** — all four approved as
recommended. **NO-GO on implementation, migration or backfill** until this
contract exists. This document is that contract.

---

## The naming law this contract exists to enforce

> **A student's own account of a day and CareerRai's observation of that day
> are never the same fact, however similar their values look.**

`day_outcome` and `study_duration` each currently collapse two different
questions into one column. The Metric Constitution already ruled this shape
illegal for self-report generally (Article on self-report facts, guard §10:
*"a self-report fact carries no observed counterpart in the same key"*). This
contract is that law, applied to the two fields that still violate it.

---

## Ruling J1 — `day_outcome` is two facts, not one

**GO. Two facts.**

| | `self_reported_day_outcome` | `observed_day_outcome` |
|---|---|---|
| Semantic type | `FACT` | `DERIVED_FACT` |
| Time basis | `immutable_declaration` | `point_in_time` |
| Meaning | What the student explicitly said about the day | What CareerRai's own records show the student did |
| May it be overwritten by the other fact? | **Never.** | **Never.** |
| May it be silently dropped? | No — absence is UNKNOWN, not a claim | No — absence is UNKNOWN, not a claim |

### The corrected provenance map (per the 0C.3G audit's fresh finding)

`self_reported_day_outcome` has **two writers, not one** — this contract
preserves that finding rather than flattening it back into "student vs
system":

1. **The check-in gate** (`check-in-gate.tsx`) — an explicit tap on
   `studied / partial / not_studied / skipped`.
2. **The log sheet's own "Rest day" toggle** (`LoggingModal.tsx`) — an
   explicit declaration of rest, distinct from the check-in gate but
   equally a direct student statement, not an inference.

Both are `self_reported_day_outcome`. Neither is `observed_day_outcome`.

`observed_day_outcome` has one producer: whatever the log sheet's normal
submit path can honestly derive from what was actually ticked
(`deriveOutcome()` today). It is a `DERIVED_FACT` and must be labelled as one.

### J2 is answered as a direct corollary, not left open

0C.3F1's J2 asked: *"must `deriveOutcome()` stop writing the student's
column?"* **Yes — this is not a fifth decision, it is what "two facts" means.**
If `deriveOutcome()` continues writing into the same value
`self_reported_day_outcome` occupies, the two facts are not actually
separated; they are one column with two writers disagreeing invisibly, which
is the exact defect this contract exists to end. **`deriveOutcome()`'s output
is `observed_day_outcome`, full stop, whatever the eventual storage shape.**

### What this contract does NOT resolve

- **`REST` vs `NOT_STUDIED`** as distinct *product* states remains open. This
  contract fixes the **provenance** question (who said it), not whether the
  product should further distinguish a chosen rest from a missed day within
  `self_reported_day_outcome`'s own value space. Reported in 0C.3F1, still a
  founder call, not decided here.
- The **transaction contract** (0C.3F1's H5/B3: the fire-and-forget write) is
  implementation, not semantics. This contract states that whichever write
  path lands, it must write `self_reported_day_outcome` — a semantic
  requirement — but does not design the transaction.

---

## Ruling J6 — `study_duration` is two facts, not one

> ### ⚠️ AMENDED 18 Aug 2026 — read `J6-A` below before acting on this section
>
> J6 as originally written ("two facts, never merged") is **superseded by J6-A**.
> The original text is preserved unchanged below because the amendment cannot be
> understood without it, and because the reasoning that produced it was sound on
> the evidence available at the time. **It is no longer the operative rule.**

**GO. Two facts.**

| | `self_reported_study_duration` | `credited_study_duration` |
|---|---|---|
| Semantic type | `FACT` | `DERIVED_FACT` |
| Meaning | Hours the student directly typed on the full log sheet | Hours priced from coverage — `creditedHours()`, driven by which plan tasks were ticked and at what portion |
| Unit | hours, as stated | hours, as *priced* |
| May the two be summed, averaged, or displayed as one number without saying which? | **No.** |

Sharing a unit does not make these the same measurement. `credited_study_duration`
already has its own header (`study-credit.ts`) stating plainly: *"Hours
credited from what the student COVERED, not from a number they type."* This
contract makes that distinction a fact-registry-level law rather than a
comment one file honours and others might not.

### The live violation this contract identifies, not yet fixes

`complete-task/route.ts`'s `mergedHours = Math.max(earned, existingLog?.study_duration ?? 0)`
writes **one** column with **either** value and no record of which. Under
this contract that is illegal: the stored number must be traceable to one of
the two facts, not an anonymous maximum of both. **Not fixed here** — this
contract names the violation so the next gate has an exact target, per
0C.3F1's K7 (provenance columns) or an equivalent shape. No column is added
in this document.

---

## Ruling J6-A — provenance must be legible (AMENDMENT, 18 Aug 2026)

**This is the operative rule. It supersedes J6 above.**

> **A duration value may be presented as self-reported or as credited ONLY when
> its provenance is actually established. Historical values whose provenance
> cannot be established retain their historical value and are explicitly marked
> legacy/unknown provenance. Never represent an inferred or credited value as
> self-reported.**

### Why J6 was amended rather than enforced

J6 was ruled on the belief that `study_duration` carried two facts. The G4 audit
(`docs/0C-3G-G4-STUDY-DURATION-AUDIT.md`, `fc38554`) and the J6 decision memo
(`docs/0C-3G-J6-DECISION-MEMO.md`, `aeabac3`) established that it carries **four**,
produced by four deploy-bounded write eras:

| Era | What the number means | Real rows | Hours |
|---|---|---|---|
| E1 — before 9 Aug | Typed by the student | 167 | 373.5 |
| **E2 — 9–12 Aug** | **`max(1, round(min/60), existing)` — a 1-hour floor, whole-hour rounded** | **30** | **33.6** |
| E3 — 13–17 Aug | `creditedHours`, no half-tick | 79 | 102.0 |
| E4 — 18 Aug onward | Current semantics | 17 | 33.5 |

**E2 is the decisive case.** Its value is neither self-reported nor credited.
Forcing it into either fact would *manufacture provenance* — the precise failure
this contract's naming law exists to prevent. A two-fact model has nowhere
truthful to put 30 real rows belonging to 18 students.

The second reason is that historical credited duration **cannot be safely
back-calculated**: `daily_routines` is `UNIQUE (student_id, routine_date)` and
carries no `updated_at`, so a plan regeneration overwrites the denominator in
place and the overwrite is undetectable. A recomputation reproduces 39 of 293
real rows and runs *higher* than stored on 21 — proving the inputs have already
drifted from what was written.

### What J6-A requires

**Future data**
- Self-reported duration → recorded as explicitly self-reported.
- Credited duration → recorded as explicitly credited.
- No evidence → recorded as unknown. **Not as `0`.**
- One is never silently substituted for another.

**Historical data**
- The existing numeric value is **preserved**.
- The strongest provenance classification that can actually be *proven* is attached.
- The historical number is **never recomputed and overwritten.**

### What J6-A explicitly forbids

1. **Rewriting any historical duration value.** Not by backfill, not by
   recomputation, not by migration. The G4 evidence is that recomputation is
   wrong on 87% of rows it can even be attempted on.
2. **Redefining `study_duration` as a permanently merged value and declaring the
   problem solved.** Legibility is the requirement; a merged number that admits
   nothing about itself does not satisfy this contract.
3. **The shape G5 must not take:** *"add `credited_study_duration`, backfill 293
   rows, migrate all 30 consumers."* This is precisely what the G4 evidence says
   cannot be done safely, and it is prohibited by name so it cannot be
   rediscovered as a good idea later.

### Sequencing locked by this amendment

- **A3 is fixed independently and FIRST**, ahead of any storage work. `day_outcome ∈
  {studied, partial}` with `study_duration = 0` is a live truthfulness defect
  affecting 62 real rows across 38 students. It does not depend on this ruling.
  **The A3 fix must stay narrow** — it is not a licence to redesign duration
  semantics.
- **The four unclassified consumers (G4 §6) are DEFERRED.** No consumer is
  repointed until the semantic model is locked. Under this amendment none needs to be.
- **E2's 30 rows are preserved as historical legacy evidence**, classified as E2/legacy
  where the era can be established. Their values are not rewritten and not nulled.
- **G5 opens only after this amendment is locked**, and its first implementation
  question is exactly: *what is the minimum provenance representation that makes
  future duration truth legible without rewriting historical values?*

### Status of the original J6 violation

The violation J6 named — `mergedHours = Math.max(earned, existingLog?.study_duration ?? 0)`
writing one column with either value and no record of which — **remains a real
violation under J6-A.** What changed is the remedy: it is cured by making the
provenance legible, not by splitting the column into two facts.

---

## Ruling J7 — `topics_covered` holds exactly one vocabulary: sections

**GO. Sections only.**

The legal values of `topics_covered`, going forward, are exactly:
`VARC | DILR | QA | Mock | Revision`.

**No topic-level entries.** Topic-level granularity is not being discarded —
it already lives correctly in `topic_coverage`, a separate table built for
exactly that purpose, with its own canonical universe (`EXAM_SYLLABUS_TOPICS`,
46 units) and its own membership guard. `topics_covered` is a coarse,
section-level log of *what kind of work happened on this day*; it was never
meant to hold topic names, and the 46 rows that do are drift, not a second
intended vocabulary.

### Historical rows are untouched by this ruling

**46 rows across 2 non-real accounts** (a demo profile and one profile
literally named *"SUPERSEDED — use appreview@careerrai.in"*) predate this
contract and carry topic-name values. **No backfill, no reinterpretation, no
deletion.** They are pre-contract history. This ruling governs writes from
this point forward once implemented; it does not retroactively judge rows
written before the rule existed.

### What must be true once implemented (not yet true)

A writer must be structurally prevented from inserting a value outside the
five-item set — the same *"fails closed on the wrong universe"* discipline
the Fact Registry already enforces for `topic_coverage`. No such guard exists
today. Adding one is implementation, deferred.

---

## Ruling J8 — a later write to `topics_covered` may never shrink it

**GO. No-shrink.**

If day D's `topics_covered` already records `{QA, VARC}`, a subsequent write
for the same day may only **add** to that set, never remove from it. A
narrower payload on a later write is a *partial* observation, not a
*correction* — CareerRai does not currently have grounds to conclude a
section that was once evidenced stopped being true, and treating a narrower
write as authoritative would silently delete real history.

**This is not a new rule invented here.** It is the behaviour
`complete-task/route.ts` already implements correctly
(`[...new Set([...existing, ...routineSections])]`) and `log-daily`'s RPC
already violates (`topics_covered = p_topics_covered`, an unconditional
replace). This contract makes the correct half of the existing codebase the
*canonical* rule, and names the other half as the defect to close.

### Scope, stated precisely

This ruling is scoped to `topics_covered`, as asked. It is not extended here
to `day_outcome` or `study_duration` — those are protected by J1/J6 instead,
by construction: once stated and derived values live in separate facts, a
write to one structurally cannot "shrink" the other, because they were never
the same value to begin with. No additional no-shrink rule is needed for
them, and none is being added.

---

## What this contract explicitly leaves open

| Item | Status |
|---|---|
| **Storage shape** for J1's split | Not decided here. Implementation question for the next gate. |
| **Storage shape for `study_duration`** | **Superseded by J6-A.** No split is to be implemented. The open question is now narrower and stated in J6-A: the *minimum provenance representation* that makes future duration truth legible without rewriting historical values. |
| **J2's transactional half** — moving `day_outcome`/`confidence`/`plan_fit` off the fire-and-forget write | Semantically required by J1 (see above); *how* is implementation, not decided here. |
| **`REST` vs `NOT_STUDIED`** as distinct product states | Still a founder call, independent of this contract. |
| **J10 — the evidence model's concrete shape** | Was blocked on J1 and J6 being ruled. **Both are now ruled.** J10 is therefore the next open question, not this contract's job to answer. |
| **J12 — silent coverage-advance failure (H17)** | Entirely independent of this contract. Was already flagged as shippable standalone; remains so. |
| **The RPC's fabricated wellbeing constants** (0C.3e's own, separately-numbered J1) | Out of scope here. Different document, different fields, not touched. |

---

## The four rulings, restated as one law

> **A fact's provenance is part of its meaning.** What the student said, what
> CareerRai observed, and what CareerRai derived are three different kinds of
> evidence. A single column that receives writes from more than one of these
> kinds is not one fact economically represented — it is two or three facts
> with their identities erased, which is exactly how eleven implementations
> of "syllabus coverage" happened the first time. This contract is that
> lesson, applied before the daily-report fields make the same mistake at
> Fact Registry scale.

### The amendment's addition to that law (J6-A, 18 Aug)

> **Where provenance has already been erased, it may not be invented to satisfy
> a model.** The remedy for a column with lost provenance is to make what we
> actually know legible — including "we do not know" — never to recompute the
> past into a shape the rule prefers. A value whose origin cannot be proven is
> legacy evidence, and saying so is more truthful than assigning it a fact it
> may not belong to.

This is the same discipline as the rest of the contract, applied one level
deeper: J1/J7/J8 stop provenance being erased *going forward*; J6-A governs what
is owed to data whose provenance was *already* erased before the rule existed.

---

**STOP.** No code. No schema. No migration. No backfill. No historical
repair. This document rules semantics; it implements nothing.
