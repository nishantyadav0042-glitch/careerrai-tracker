# J6 Decision Memo — what semantic model can carry both histories truthfully

**Gate:** ruling gate between G4 (audit, `fc38554`, verdict OPEN) and any G5.
**Question:** *Given the G4 evidence, what semantic model can truthfully support both
historical and future data without pretending that historical provenance exists?*
**Status:** decision memo. Nothing implemented. G5 stays closed.
**Date:** 18 Aug 2026.

---

## 0. Two facts G4 did not have

Both change the option space, so they come first.

### 0.1 There are FOUR write eras, not two

G4 framed history as pre/post the 9 Aug ruling. Tracing the writers through git
shows the boundary is not clean — `complete-task` shipped on 9 Aug with its **own**
hours formula and did not adopt `creditedHours` until 13 Aug:

```
9ee1a34  9 Aug  complete-task created:  Math.max(1, Math.round(routineMinutes/60), existing)
1bb4f56  9 Aug  study-credit.ts created; hours input REMOVED from the log sheet
9c3476d 13 Aug  complete-task adopts creditedHours
fd30d75 18 Aug  half-tick semantics (P0-2)
```

Era 2 carries a **hard floor of 1 hour** and whole-hour rounding. Those values are
neither self-reported nor credited — they are a third thing, and no split of two
facts has anywhere to put them.

| Era (by last write) | Meaning of the value | Real reports | With hours | Hours | Students |
|---|---|---|---|---|---|
| **E1** — before 9 Aug | Typed by the student | 167 | 95 | 373.5 | 74 |
| **E2** — 9–12 Aug | `max(1, round(min/60), existing)` — floored, rounded | 30 | 6 | 33.6 | 18 |
| **E3** — 13–17 Aug | `creditedHours`, no half-tick | 79 | 31 | 102.0 | 56 |
| **E4** — 18 Aug onward | Current semantics | 17 | 11 | 33.5 | 16 |

**Only 17 of 293 real reports (6%) were written under the semantics we are ruling on.**
94% of the corpus is legacy. Any model that treats "history" as one thing is wrong.

### 0.2 Per-row provenance is PARTIALLY recoverable — G4 was too pessimistic

G4 concluded provenance is unavailable. That is true of the *row's own columns*, but
`daily_reports` carries **`created_at` and `updated_at`** (both verified present).
Because the eras are deploy-bounded in time, `updated_at` attributes each row's **last
write** to exactly one era. Cross-checked against completion evidence, this is a usable
backfill key.

**Stated confidence limits, which must not be glossed:**
- Commit date ≠ deploy date. Rows written within hours of a boundary can be misattributed.
- `updated_at` identifies the **last** writer, not the row's full history. 13 E1 rows were
  rewritten after creation; a row created in one era and rewritten in another carries the
  later era's semantics and the earlier era's origin.
- It cannot distinguish W1 (client credit) from W4 (server credit) inside E3/E4.
- It says nothing about the 36 fabricated seed rows beyond `is_demo`.

So: provenance is recoverable **to an era, with a residual `unknown` bucket** — not to a
per-row certainty. Any option below that claims a clean backfill is lying; any option that
claims none is possible is also wrong.

---

## 1. The four options against the nine required criteria

**A** — two independent facts, `UNKNOWN` where provenance is unavailable.
**B** — two facts + an explicit provenance discriminator.
**C** — preserve `study_duration` as effective/legacy; new credited fact for future data only.
**D** — staged truthfulness (below).

| Criterion | A: two facts + UNKNOWN | B: two facts + discriminator | C: legacy + future-only credited | D: staged (recommended) |
|---|---|---|---|---|
| **Historical rows — reconstructable** | E1→self-reported, E3/E4→credited. **E2 (30 rows, 33.6 h) fits neither → both NULL.** 6% of rows verifiable against a recomputation | Same era mapping, but E2 gets its own honest label rather than being erased | Nothing reconstructed. All 293 rows keep today's value; credited is NULL for all | Nothing rewritten. Every row keeps its value; each gains an era label incl. an `unknown` bucket |
| **Historical rows — cannot be reconstructed** | E2 entirely; W1-vs-W4 inside E3/E4; the 62 declared-studied-zero rows | Same, but each is *labelled* rather than silently dropped | Everything — by design | Same as B; nothing is claimed that isn't known |
| **Future write semantics** | Both columns written; `complete-task` must stop merging → RPC replace-semantics must be fixed first (B7) | Both columns + source stamp; same RPC problem | `study_duration` keeps current merge; `credited_*` written purely alongside | Phase 1: writers stamp provenance, values unchanged. Phase 2 decided by then-clean data |
| **What happens to the 30 consumers** | **~20 TOTAL consumers break.** Their only fix is `COALESCE(credited, self_reported)` — a read-time merge | Same 20 break if repointed; they can instead keep reading the value and filter by source | **Zero change.** All 30 keep reading `study_duration` | **Zero change** in phase 1. The 3 CREDITED consumers gain a source filter when they want it |
| **Does any existing metric change** | **Yes, extensively** — capacity, red flags, digests, PaceCard, peer pulse, buddy briefings. Plus the `analytics.ts` NaN hazard pins every student to "Needs intervention" | Yes if consumers repoint; **no** if they filter | **No** | **No** |
| **Backfill possible** | Partially (era key), E2 unassignable | Partially, with an explicit `unknown` bucket — the honest shape | N/A | Partially, `unknown` bucket, **no value ever rewritten** |
| **Does `0` stay ambiguous** | **Resolved** — nullable columns can say "not collected" | Resolved via the source label | **No — stays ambiguous.** The live A3 defect survives untouched | **Resolved** — `not_collected` is representable, which is the point of phase 1 |
| **Satisfies J6 "never merged"** | **Yes, literally** — but forces the merge into read-time in ~20 places, so the merge survives, just unpoliced | Storage separates; the effective value remains merged. **Letter: no. Spirit: arguably yes** | **No.** `study_duration` stays a merged value permanently | **No, not as J6 is written.** Requires amending J6 — stated plainly, not finessed |
| **Migration / storage** | 2 new nullable columns, drop `NOT NULL DEFAULT 0`, widen `types/index.ts`, fix `analytics.ts`, RLS/grant parity for the client-side select in `history-section.tsx` | Same as A **plus** a source column | 1 new nullable column | 1 nullable source column, no value migration, no type widening in phase 1 |
| **Can old and new rows coexist without lying** | Only if every consumer is repointed in the same commit; a half-migration lies | Yes — each row states its own provenance | **No.** Old rows keep four meanings in one number, unlabelled | Yes — that is the design goal |

---

## 2. Reading of the matrix

**A is the most faithful to J6 and the most dangerous to students.** It is the only
option that satisfies "never merged" literally, and it achieves that by pushing the
merge into ~20 read sites where nothing can police it — while changing capacity,
red flags, weekly digests, the PaceCard and peer pulse in one commit, on a corpus
where 94% of rows predate the semantics being imposed. It also has no home for E2.
The `analytics.ts` NaN hazard (B6) makes its failure mode silent: every student pins
to "Needs intervention" and the red flag stops firing.

**C is the safest and the least honest.** Zero consumer risk, zero metric change —
and the live defect A3 survives: 62 rows across 38 students continue to say a student
studied while the hours read 0. It also freezes a permanently-merged column, which
J6 exists to forbid. C buys safety by declining to fix the thing that prompted the
ruling.

**B is where the evidence actually points**, with one honest caveat: it does not
store two facts, so it does not satisfy J6 as written. It makes the existing value
*legible* rather than splitting it — which resolves the `0` ambiguity, changes no
metric, needs no read-time merge, and lets the three CREDITED consumers get what they
need by filtering.

**D is B, sequenced so the P0 lands before the P1.**

---

## 3. Option D — staged truthfulness (recommendation)

The session's standing pattern: smallest truthful step, fail closed, never bundle a
semantic change with a data change.

**D1 — fix A3 first, independent of J6.** Make "not collected" representable and stop
the check-in gate writing a hard `0` into a column that cannot say "never asked."
62 real rows / 38 students currently assert study happened with zero hours. This is a
live student-facing truthfulness defect that **predates J6 and does not depend on any
ruling here.** Under SCALE-CONTRACT precedence (student correctness P0 > founder
visibility P1), it goes first.

**D2 — add the provenance discriminator, rewrite no values.** One nullable column
recording which writer/era produced each row's value, backfilled from `updated_at` +
completion evidence with an explicit `unknown` bucket for the residue. No value
changes, no consumer changes, no metric changes, no type widening, no RLS work. The
column becomes *honest about itself* without anyone having to trust a recomputation
that only 13% of rows reproduce.

**D3 — decide the split on clean data, later.** Once every new row is provenance-stamped,
the question "do we need a separate credited fact?" is answered by evidence rather than
by inference over a corpus that is 94% legacy. If the answer is yes, D2's labels are
exactly the backfill key A and B both needed and neither had.

**What D costs:** J6 as written does not survive it. D does not produce two facts, and
the effective day value remains a merged number. That must be an explicit amendment —
"provenance must be legible; a merged effective value is permitted where every consumer
requires one" — not a quiet reinterpretation.

**What D refuses to do:** it will not rewrite a single historical value. G4 proved a
recomputation reproduces 39 of 293 rows and runs *higher* than stored on 21 of them.
Any option that backfills values rather than labels would overwrite real student
evidence with a number derived from a denominator that has already drifted.

---

## 4. What I need from you

1. **Amend or hold J6?** D (and B) require amending "two facts, never merged" to
   "provenance must be legible." A is the only option that keeps J6 literal, at the
   cost in §2. **This is the decision; the rest follow from it.**
2. **May A3 be fixed now, ahead of the J6 ruling?** It is a live defect affecting 38
   students and is independent of every option here.
3. **The four unclassified consumers** (G4 §6) still need rulings before any consumer
   repoints — but under D none repoint, so this can wait until D3.
4. **E2's 30 rows** — label as `legacy_floored` (D/B), or null out (A)? They are 33.6 h
   across 18 students.

**Recommendation: D. Do not open G5. Do not implement any option until (1) is ruled.**

---

## 5. Method

Era boundaries traced by `git log -S` over the three writer files, not inferred from
the 9 Aug ruling date — which is how E2 and the 1-hour floor surfaced. All counts are
read-only queries against `pobhpszlsozeonejtzqy`, demo accounts excluded. Confidence
limits on the era key are stated in §0.2 rather than assumed away. No code, schema,
migration, test or documented behaviour changed.
