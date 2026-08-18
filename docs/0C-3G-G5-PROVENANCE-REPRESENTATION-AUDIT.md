# G5 — Minimum Provenance Representation Audit

**Gate:** G5, design only. Opened under the amended contract J6-A (`729eddd`).
**Question:** what is the **minimum** representation that makes future
`study_duration` provenance legible **without rewriting any historical value**?
**Status:** DESIGN ONLY. No code, schema, migration, test or production data changed.
**Date:** 18 Aug 2026.

---

## VERDICT

**GO — on Option 1, narrowed.** One nullable provenance column with a closed
vocabulary, plus a Fact Registry producer that reads it. Nothing else.

**NO-GO on Options 2 and 3** as standalone models: Option 2 cannot place historical
values anywhere without inventing provenance (it needs a third column to stay
truthful, at which point it is Option 1 with extra steps); Option 3 cannot classify
a future row at all, because the value reaching the server is a bare number.

Three findings shape the recommendation, and each is checkable:

1. **The server cannot currently observe provenance at all.** `body.hours` arrives as
   a bare number that the client computed. The route cannot distinguish a typed
   number from a derived one. **Provenance must therefore be DECLARED by the writer;
   it cannot be inferred at the boundary.** This is the actual reason storage is
   needed — not the two-facts argument J6 originally made.
2. **`self_reported` currently has zero writers.** The hours input was removed on
   9 Aug (`1bb4f56`). No first-party surface produces a student-typed duration today.
   The vocabulary must still *include* it (the API still accepts arbitrary `hours`,
   and the product may reintroduce self-report), but it will be **unwritten on
   arrival**, and that expectation should be pinned by test so its first appearance
   is a signal rather than a surprise.
3. **The `Math.max` merge can store a value whose provenance is not the writer's
   own.** `mergedHours = Math.max(earned, existingLog.study_duration ?? 0)` may return
   the *pre-existing* value, which came from a different era and a different writer.
   Any provenance stamp must describe **the value that actually won**, not the write
   that was attempted. This is the single most likely way a naive implementation
   would start lying on day one.

---

## 1. Starting point — the existing row and the registry's conventions

**`daily_reports` today (verified live):** `study_duration NUMERIC(4,1) NOT NULL
DEFAULT 0`, `day_outcome TEXT NULL`, plus `created_at` / `updated_at`. RLS is
**enabled and row-level**, with `Student manages own reports` = `ALL` on
`student_id = auth.uid()`.

**The Fact Registry (`src/lib/facts/`) stores nothing.** It is a read-side contract:
producers are pure functions over canonical persisted data returning
`FactResult<T>` — either KNOWN with a value, or **UNKNOWN with a reason**
(`no_evidence` | `out_of_universe` | `invalid_input`). Its three rules are directly
load-bearing here:

- *Different meaning → different fact_key.* A single number meaning four things is
  precisely the "umbrella fact" the contract rejects.
- *UNKNOWN is first-class.* The registry can already say "we do not know" — the
  **column** cannot, which is the whole defect.
- *Evidence is never laundered.* Inferring a provenance we cannot prove would be
  laundering, and J6-A forbids it in the same words.

The registry is therefore the right place to **read** provenance and the wrong place
to **hold** it. That asymmetry decides Option 3.

---

## 2. The four options against the twelve criteria

| Criterion | **1 — provenance key alongside the value** | 2 — separate self-reported + credited fields | 3 — Fact Registry only | 4 — other minimal model |
|---|---|---|---|---|
| **Exact storage shape** | `study_duration_source TEXT NULL` + `CHECK` on a closed vocabulary. NULL = legacy/unknown | 2 nullable numerics — **plus** `study_duration` retained, because historical values belong in neither → 3 columns | Nothing stored | See §4: Option 1 **+** a registry producer. No extra storage |
| **Writer changes required** | Both writers stamp the source. Either an RPC signature change (DROP/CREATE + ACL restore, per `20260812`) or a post-RPC `update`, as `log-daily` already does for `plan_fit`/`day_outcome` | Same, twice over, plus a rule for which column each writer targets | None possible — nothing to write | Same as 1 |
| **How a new row is classified** | By the writer's own declaration, at the moment it writes | Same, but the writer must also choose a column, and `complete-task` cannot know which | **Cannot be classified.** `body.hours` is a bare number; the server cannot tell typed from derived | Same as 1 |
| **Retries / upserts preserve provenance** | Requires care: the stamp must describe the value the `Math.max` actually kept (finding 3). Solvable, and testable | Worse — the max-merge would have to move a value *between columns*, which is a rewrite | N/A | Same as 1, with the rule stated explicitly |
| **Both self-reported and credited exist** | One value wins; its source is stamped. The other is not stored — **and today cannot arise**, since self-report has no writer | Both stored — the honest case *for* Option 2, but for a situation that does not currently occur | N/A | Deferred by construction: the case has no live writer |
| **Neither exists** | `source = 'not_collected'`, value stays `0`. **This is the A3 case, resolved at the storage layer** | Both NULL; `study_duration` still `0` and still ambiguous | N/A | Same as 1 |
| **Historical rows byte-for-byte unchanged** | **Yes.** `ADD COLUMN … NULL` with no default is metadata-only on PG 11+ (live: 17.6). Zero rows touched | Yes *if* `study_duration` is retained; **no** if values are moved | Yes (trivially) | Yes |
| **Any consumer must change immediately** | **None.** All 30 keep reading `study_duration` unchanged | Yes — the ~20 TOTAL consumers lose their value unless a third column holds it | None | **None** |
| **Does `0` stay ambiguous** | **Resolved going forward** (`not_collected` / `declared_zero` / a genuine credited 0). Historical zeros stay `unknown` — which is the truth, not a gap | Partially; historical zeros unchanged | **Yes, entirely** | Same as 1 |
| **Migration requirements** | One `ADD COLUMN`, one `CHECK`. No rewrite, no backfill | Two or three columns, plus a placement decision J6-A forbids making | None | One `ADD COLUMN`, one `CHECK` |
| **RLS / security** | Inherits row-level policies — **no new RLS work**. But see §3: the column is student-writable, exactly as `study_duration` already is | Same, doubled | None | Same as 1, with §3 named as a pre-existing hole, not a new one |
| **Satisfies J6-A** | **Yes.** Explicit where provenance exists, `unknown` where erased, no value rewritten | **No.** Placing historical values in either fact invents provenance | **No.** Cannot make future provenance legible | **Yes** |

---

## 3. Findings that constrain any implementation

**3.1 — Provenance must be declared, not inferred.** The route receives
`body.hours` and cannot see how it was produced. `LoggingModal` computes
`creditedHours()` **client-side** (`LoggingModal.tsx:190`) and posts the result.
Any design that hopes to classify rows server-side from the value, the era, or the
presence of completions is inferring — which J6-A forbids and which G4 already
proved unreliable (39 of 293 rows reproduce).

**3.2 — The stamp must follow the value, not the intent.** `complete-task`'s
`Math.max(earned, existingLog.study_duration ?? 0)` can keep a pre-existing value
from a different era. A writer that stamps `'credited'` because it *ran* the credit
path, while the max kept an older number, produces a row that states a provenance it
does not have. The rule an implementation must satisfy: **stamp the winner.** If the
existing value wins, the stamp is whatever that value already carried — which, for
every current row, is `NULL`/unknown. This is testable and must be tested.

**3.3 — RLS gives students write access to their own rows.** `Student manages own
reports` is `ALL` with `student_id = auth.uid()`, so a student can `UPDATE` their own
`daily_reports` row directly through the anon key — including any provenance column.
**A provenance claim the subject can forge is not evidence.** Two clarifications so
this is not over-read: (a) this is a **pre-existing** hole — `study_duration` itself
is already student-writable — so provenance inherits it rather than creating it;
(b) it is out of scope for G5. It is named here so the implementation does not
*claim* tamper-evidence it does not have.

**3.4 — Two `select('*')` readers will silently acquire the new column.**
`buddy/(dashboard)/trends/page.tsx:35` and `buddy/(dashboard)/students/[id]/page.tsx:169`.
Neither breaks — but `types/index.ts`'s `DailyReport` must gain the field, or these
pages carry an undeclared property.

**3.5 — Adding a column and labelling history are two different acts.** The brief
requires historical rows byte-for-byte unchanged; J6-A permits attaching "the
strongest provenance classification we can actually prove." These pull in opposite
directions for the 293 existing rows. **Resolved by sequencing, not by compromise:**
G5 ships the column with every historical row `NULL`. Whether to later label eras
from `updated_at` (§0.2 of the decision memo, with its stated confidence limits) is a
**separate, optional decision** — not part of this gate, and not required for the
column to be useful.

---

## 4. Recommendation — the minimum representation

**One nullable column, one closed vocabulary, one registry producer.**

```
ALTER TABLE daily_reports ADD COLUMN study_duration_source TEXT NULL;
-- CHECK (study_duration_source IS NULL OR study_duration_source IN (...))
```

**Vocabulary (closed, four values + NULL):**

| Value | Meaning | Live writer today |
|---|---|---|
| `credited` | Priced from plan coverage (`creditedHours`) | `log-daily` (W1), `complete-task` (W4) |
| `self_reported` | A duration the student stated | **None.** Reserved — see finding 2 |
| `not_collected` | The surface never asked (the check-in gate) | `check-in-gate` (W3) |
| `declared_zero` | The student stated they did not study | `LoggingModal` rest toggle (W2) |
| `NULL` | Legacy / unknown provenance — **all 293 existing rows** | — |

`NULL` carrying "unknown" is deliberate: it needs no backfill, it is what an
un-stamped row honestly is, and it maps cleanly onto the registry's first-class
`UNKNOWN` rather than inventing a fifth label.

**Why this is the minimum.** It adds exactly one column, changes zero consumers,
rewrites zero values, requires no RLS work, and resolves the `0` ambiguity for every
future row. Removing anything from it loses a distinction J6-A requires; adding
anything to it provisions for a case that has no writer.

**What it explicitly does NOT do**, per the brief: it does not create
`credited_study_duration`; it does not touch the 30 consumers; it does not resolve
whether capacity, `weekly-plan-reconcile`, `buddy-case-data` or `prep-gain` should
read a magnitude differently — those four remain deferred, and this gate does not
make them easier or harder to decide later.

**Open implementation question, deliberately not answered here:** whether the writers
stamp via an RPC signature change (transactional, but a DROP/CREATE with ACL restore —
the `20260812` precedent) or via a post-RPC `update` (no migration risk, but
best-effort and non-transactional, so a failure yields a value with a `NULL` stamp,
degrading into `unknown`). Both are defensible; the choice is an implementation gate,
not a semantic one, and finding 3.2 binds either way.

---

## 5. GO / NO-GO

| | Decision |
|---|---|
| **Option 1 (narrowed, as §4)** | **GO** — recommended |
| Option 2 (two duration fields) | **NO-GO** — cannot place historical values without inventing provenance |
| Option 3 (registry only) | **NO-GO** as a model; **adopted as the read layer** for Option 1 |
| Option 4 | Resolves to Option 1 + registry producer; no separate model needed |
| Consumer semantics | **Not addressed.** Out of scope by instruction |
| Era labelling of the 293 historical rows | **Deferred** — separate decision (finding 3.5) |
| A1 / A2 | **Remain parked.** Neither affects this design |

**Stopped after the design audit. No implementation.**

---

## 6. Method

Started from the live `daily_reports` shape and RLS policies (queried read-only) and
from `src/lib/facts/contract.ts` + `canonical.ts`, not from the option names in the
brief. Findings 3.1–3.4 came from reading the writers and the RLS policies directly;
each is stated so it can be falsified. No code, schema, migration, test or production
data was changed.
