# 0C.3G — Daily Evidence Semantic Rulings: audit-only

**18 Aug 2026. AUDIT ONLY. No code, no schema, no migration, no backfill, no
historical repair, no opportunistic cleanup.**

## Where this gate's scope comes from

No document has ever been named `0C.3G`. This gate inherits its acceptance
criteria from **`docs/0C-3F1-EVIDENCE-PROVENANCE.md` Part J** — twelve
decisions (J1–J12) the founder deferred rather than letting an implementation
choose product semantics by accident. That is the closest thing this project
has to a pre-existing 0C.3G spec, so this audit starts there rather than
inventing new scope.

Per the standing instruction — **P0-2 needed three fresh sweeps because the
prior authority map was correct and still incomplete** — this audit does not
merely re-read 0C.3F1. It re-traces every writer and reader of `day_outcome`,
`study_duration` and `topics_covered` from the table outward, fresh, and
checks whether anything has changed since 18 Aug (P0-1, P0-2.1–2.3f, J2, J3
have all landed since 0C.3F1 was written, and several of them touched the
same files).

---

# A. STATUS RE-VERIFICATION — which of J1–J12 are already resolved?

Checked against the current tree, not assumed from memory.

| # | Decision | 0C.3F1 recommendation | Status now |
|---|---|---|---|
| J1 | `day_outcome`: one fact with provenance, or two facts | two facts | **UNRESOLVED** |
| J2 | Must `deriveOutcome()` stop writing the student's column | yes | **UNRESOLVED** |
| **J3** | Half-tick: what does "Got halfway" mean | partial completion | ✅ **RESOLVED — P0-2 (2.3a–2.3f)** |
| **J4** | Half-ticked day streak-less | (product decision) | ✅ **RESOLVED — implemented as "yes"**: `countsAsFullyDone` gates day closure/streak/emergency-min |
| **J5** | Null-confidence tick: full, half, or UNKNOWN | UNKNOWN | ✅ **RESOLVED — implemented as FULL, not UNKNOWN** (see below) |
| J6 | Duration: one fact or two | two | **UNRESOLVED**, still gated on J3 which is now itself resolved |
| J7 | `topics_covered`: one vocabulary | sections only | **UNRESOLVED** |
| J8 | May a later write shrink recorded sections | no | **UNRESOLVED** |
| J9 | Wellbeing: accept no trustworthy history exists | yes | ✅ **ACTED ON — J2/J3 (0C.3e's J-series, a different letter scheme, see warning below)** |
| J10 | Evidence model shape | O1 (per-field source columns) | **UNRESOLVED** |
| **J11** | H6: truthful resubmit acknowledgement | yes | ✅ **RESOLVED — P0-1** |
| J12 | H17: failed coverage advance not silent | no (should not be silent) | **UNRESOLVED — still `console.error` only** |

**⚠️ A naming collision, worth flagging precisely rather than letting it stand
ambiguous.** `docs/0C-3E-DATA-INTEGRITY-AUDIT.md` also has a "J1/J2/J3"
series — **stop the RPC asserting wellbeing / retire the burnout+sleep flags /
stop presenting wellbeing as measurement**. Those are closed (J3 there, J2
there). They are **not the same items** as J1/J2/J3 in this document's table,
which are about `day_outcome` provenance and half-tick semantics. The founder's
own status table in the prior turn conflated these under one "J1/J2/J3" row.
**They are two independent numbering schemes from two different documents.**
This document uses 0C.3F1's numbering throughout; where I mean the other
series I say "0C.3e's J1" explicitly.

## One correction to the J5 record

0C.3F1 recommended `UNKNOWN` for a null-confidence tick. **P0-2 implemented
`FULL` instead**, per a *later* founder ruling in the P0-2.2 contract audit
("legacy `confidence=null` rows remain FULL under the documented historical
rule") — because the two provenances that produce a null (pre-portion-control
legacy rows, and topicless tasks that offer no portion choice at all) both
mean *"no partiality was ever expressed,"* which is a known answer, not an
absent one. **This is not a contradiction to resolve** — it is a later,
more specific ruling superseding an earlier draft recommendation, and it is
already implemented and tested (`completion-portion.test.ts`). Recorded here
so the audit trail is honest about the change, not because it needs re-ruling.

---

# B. FRESH SWEEP — day_outcome

## B1. Writers (unchanged from 0C.3F1, re-verified)

| Writer | Provenance | Verified |
|---|---|---|
| `check-in-gate.tsx:92` | **STUDENT_STATED** — explicit tap on one of four buttons | ✅ |
| `LoggingModal.tsx:213` | **DERIVED** — `deriveOutcome()` inferred from ticked plan tasks | ✅ |
| `LoggingModal.tsx:163` | **STUDENT_STATED** — a *third* path, not previously separated | ⚠️ **new in this sweep** |

**B1 is the one genuine finding of this section.** 0C.3F1 described the
provenance split as binary: check-in taps vs. the sheet infers. It is
actually **three-way**: the log sheet's own explicit "Rest day" toggle
(`rest` state, set only by a direct tap on that control) hard-codes
`day_outcome: 'not_studied'` — and that is the student *declaring* rest, not
an inference from what they ticked. It happens to share a value
(`'not_studied'`) with what a derived read might also produce, but the
**provenance class is STUDENT_STATED**, same as the check-in gate.

This matters for **J1**: a two-fact model (stated vs. derived) needs to know
there are *two* stated-writers and one derived-writer, not one and one. It
does not change the recommendation — both stated paths still belong on the
same side of the split — but a two-fact model that only accounted for the
check-in gate as "the" stated path would have missed a live one.

## B2. Readers (unchanged, re-verified)

`log-daily/route.ts` (fire-and-forget write, unchanged — see B3),
`routine/today/route.ts:387,395` → `planReason` (the one real consumer,
driving the Home "because" line), `metric-registry.ts` (a documentation
string only, not logic).

**No new reader appeared.** `complete-task/route.ts` still never writes or
reads `day_outcome` — confirmed by direct grep, zero matches.

## B3. The transaction gap (H5) — unchanged, still live

```ts
void admin.from('daily_reports').update(reviewUpdate)
  .eq('student_id', user.id).eq('report_date', dateStr)
  .then(({ error }) => { if (error) console.error(...) });
```

Still fire-and-forget, still not awaited, still outside the RPC's
transaction. **Worth naming precisely: this single write also carries
`confidence`** (the daily-report 1–5 self-report scale, not the tick
signal) — the *only* path by which that field is ever genuinely
student-supplied. A silent failure here is not just a lost `day_outcome`; it
is the loss of one of the few genuinely real wellbeing data points this
product has ever collected. Not fixed here — J2 (this doc's numbering)
gates it, and J2 gates on J1.

## B4. Production, refreshed

328 rows (+8 since 0C.3F1, organic growth this session) · **138 null**
`day_outcome` (up from 134) · **39** `studied` + 0 hours (up from 30) · **31**
`studied` + no sections (up from 30). The proportions are stable; nothing
has shifted qualitatively.

---

# C. FRESH SWEEP — study_duration

No new writer or reader. `complete-task`'s `mergedHours =
max(earned, existingLog?.study_duration ?? 0)` is unchanged — still the one
place a stated value and a derived value can occupy the same cell with no
record of which one is stored. **This is J6's exact subject and remains
unresolved.**

---

# D. FRESH SWEEP — topics_covered

## D1. One consumer not previously enumerated by name

`buddy-briefing.ts:125` — `topicsFlat` flattens every student's
`topics_covered` array across the window and counts frequency to build
`topTopics`, fed into the mentor-facing LLM prompt as `"Topics covered: …"`.
This predates J2/J3 (it was not touched by either) and was implicitly covered
by 0C.3F1's Part F consumer classification, but never named individually.
**Not a violation** — it treats every array entry as an opaque string and
counts it, which is vocabulary-blind by construction. Named here so J7's
ruling has a complete list to check against, not because it needs fixing.

## D2. Two writers, one behaviour gap — unchanged

`log-daily` **replaces** `topics_covered` on every write (via the RPC's
unconditional `UPDATE ... topics_covered = p_topics_covered`).
`complete-task` **merges** (`[...new Set([...existing, ...routineSections])]`
before calling the same RPC). **J8's exact subject**, still open: a full log
sheet submitted after a tick still erases that tick's section evidence for
any section the sheet's own selection omits.

## D3. Vocabulary, refreshed

**46 rows, 2 students** carry topic-name vocabulary (`Percentages`, `Geometry`,
…) instead of section names. Both are non-real accounts, re-verified by name:
`Arjun Sharma` (`is_demo=true`) and one profile literally named *"SUPERSEDED -
use appreview@careerrai.in"*. **Zero real students.** Bounded, unchanged in
kind from 0C.3F1, larger only because the demo account keeps producing rows.

---

# E. WELLBEING — status after J2/J3 (0C.3e's numbering)

Not re-litigated in depth — J9 here ("accept no trustworthy history exists")
is functionally answered by the work already done: J3 (0C.3e) stopped
presenting the values, J2 (0C.3e) retired the two rules built on them. What
remains unresolved and **out of this gate's scope, listed only so it is not
lost**: 0C.3e's own J1 (stop the RPC asserting the six constants) is still
not started, still blocked on the same fabrication the earlier audits
described, still not this gate's job.

---

# F. UNRESOLVED, REPORTED RATHER THAN CHOSEN

Carried forward from 0C.3F1, still genuinely open, still not decided here:

- **`REST` vs `NOT_STUDIED`** — a product distinction. No data-side opinion
  exists that would settle it; it depends on whether the founder wants the
  product to distinguish a *chosen* rest from a *missed* day at the semantic
  level, independent of how `day_outcome` happens to be stored today.
- **The meaning of a `null` `day_outcome`** — "not asked" (check-in never
  ran) and "not inferable" (`deriveOutcome()` returned nothing) are both
  live causes and the row cannot say which. Blocked on J1/J2.
- **J6, duration provenance** — genuinely gated on J3, which is now resolved,
  so J6 is now **unblocked and ready to rule**, not merely open.

---

# G. GO / NO-GO MATRIX

| Item | State | Next action |
|---|---|---|
| J1 — day_outcome: one fact or two | 🔴 open | **founder ruling required** — recommend two, three-writer finding (B1) strengthens rather than weakens this |
| J2 — stop `deriveOutcome()` writing the student's column | 🔴 open | blocked on J1 |
| J3 — half-tick semantics | 🟢 **closed** | none |
| J4 — half-tick and streak | 🟢 **closed** (ruled yes, implemented) | none |
| J5 — null-confidence tick | 🟢 **closed** (superseded to FULL, implemented) | none |
| J6 — duration: one fact or two | 🟡 **unblocked, ready to rule** | **founder ruling required** |
| J7 — topics_covered vocabulary | 🔴 open | **founder ruling required**; zero real-student risk today, so free to rule now |
| J8 — may a write shrink sections | 🔴 open | **founder ruling required**; recommend no, per 0C.3F1 |
| J9 — wellbeing historical boundary | 🟢 **effectively closed** by J2/J3 (0C.3e) | none |
| J10 — evidence model shape (O1) | 🔴 open | blocked on J1, J6 |
| J11 — H6 truthful acknowledgement | 🟢 **closed** | none |
| J12 — H17 silent coverage-advance failure | 🔴 **open, still live** | small, isolated, does not depend on J1/J6/J7 — could ship standalone whenever authorised |

## What this means for the next implementation gate

**Four rulings are the actual blocker for any further code**: J1, J6, J7, J8.
All four are product decisions, not engineering ones — I have recommendations
in the table (two facts, two facts, sections-only, no-shrink) but have not
implemented any of them, per instruction.

**J12 is the one item on this list that could ship today without waiting on
anything else.** It touches no semantic question — only whether a failed
`topic_coverage` write during a tick is surfaced or swallowed. Flagged as a
free-standing candidate, not started.

**Everything past these rulings — the state-model implementation, the
transaction contract (J2/B3), the evidence-column shape (J10), and 0C.3b's
remaining producer migrations — stays exactly as blocked as the prior three
audits found it.**

---

**STOP.** No code. No schema. No migration. No backfill. No historical
repair. No opportunistic cleanup.
