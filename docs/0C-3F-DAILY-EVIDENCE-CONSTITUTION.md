# 0C.3F — Daily Evidence Constitution

**18 Aug 2026. AUDIT AND DESIGN ONLY. No code. No migration. No schema change.
No fact, no rule, no consumer change, no backfill.**

> **Objective:** define exactly what ONE Daily Report means, before any
> downstream engine is allowed to interpret it.

**Every `?` in Part B is left for the founder to rule.** Where I have an
opinion I mark it `RECOMMENDATION` and give the trade-off. Where the evidence
does not support an opinion I say so. Nothing here is a decision.

---

# THE LAW THIS DOCUMENT SERVES

> **A trustworthy UNKNOWN is infinitely more valuable than a precise lie.**

CareerRai Notice only works if the student comes to believe *"CareerRai notices
things about me I didn't notice myself."* That belief survives a silence. It
does not survive one discovery of *"wait — CareerRai made that number up."*

Every ruling below should be read against that single test.

---

# A. STATE MACHINE

## A1. The census — all twelve combinations exist in production

Not a theoretical enumeration. This is `daily_reports` today, 320 rows.

| `day_outcome` | hours | sections | rows | students | window |
|---|---|---|---|---|---|
| `(null)` | >0 | listed | **107** | 66 | 12 Jul – 18 Aug |
| `not_studied` | 0 | none | **54** | 38 | 27 Jul – 17 Aug |
| `studied` | **0** | **none** | **30** | 20 | 27 Jul – 17 Aug |
| `partial` | >0 | listed | 29 | 19 | 27 Jul – 16 Aug |
| `studied` | >0 | listed | 29 | **6** | 24 Jul – 17 Aug |
| `partial` | 0 | none | 16 | 14 | 28 Jul – 16 Aug |
| `(null)` | 0 | **listed** | 12 | 10 | 13 – 25 Jul (legacy) |
| `skipped` | 0 | none | 12 | 10 | 28 Jul – 17 Aug |
| `(null)` | 0 | none | **9** | 8 | 20 – 29 Jul |
| `partial` | 0 | **listed** | 8 | 7 | 6 – 17 Aug |
| `studied` | **0** | **listed** | 8 | 4 | 3 – 15 Aug |
| `(null)` | >0 | none | 6 | 1 | 19 Jul – 14 Aug |

**Every cell is populated.** There is no combination the model can dismiss as
impossible, and four of them (`studied`+0h+sections, `partial`+0h+sections,
`null`+0h+sections, `null`+>0h+no sections) are shapes no single writer
produces alone — they are **the residue of two writers touching one row.**

## A2. Proposed states

```
        ┌──────────────────┐
        │  NO ROW EXISTS   │   the student told us nothing about day D
        └────────┬─────────┘
                 │ any surface writes
                 ▼
   ┌─────────────────────────────────────┐
   │           A ROW EXISTS              │  = "on day D the student told us
   │  (this is an EVIDENCE record,       │     something." Never "here is the
   │   never a complete state of day D)  │     complete truth of day D."
   └──────┬───────────┬──────────┬───────┘
          │           │          │
   NOT_STUDIED     REST     STUDIED ──┬── STUDIED_WITH_DURATION
   student said    student      │     └── STUDIED_UNKNOWN_DURATION
   they did not    said rest    │
                                └── orthogonal: sections
                                    SECTIONS_LISTED / SECTIONS_NONE /
                                    SECTIONS_NOT_COLLECTED
```

**Two things this shape asserts, both requiring a ruling:**

- **A2-i.** *Studied-ness* and *duration* are **separate axes**. Today they are
  one column, and that is the root of the whole problem.
- **A2-ii.** *Sections* is a **third axis**, not a property of the other two. A
  student can study and record no sections; a student can record sections with
  no hours (8 rows do).

**RECOMMENDATION:** model these as three orthogonal axes, not one five-valued
enum. A single enum forces `STUDIED_UNKNOWN_DURATION` and `SECTIONS_LISTED` to
be one state, and production already contains that combination.

## A3. `REST` vs `NOT_STUDIED` — a distinction the product may not want

`not_studied` (54 rows) and `skipped` (12) both mean "no study happened", but
one is a chosen rest and the other is a missed day. **This is a product
distinction, not a data one**, and it sits underneath the founder's own
"never guilt" rule. It needs ruling, and it is not currently derivable from
anything but the student's own tap.

---

# B. FIELD SEMANTICS — **ALL CELLS REQUIRE A RULING**

## B1. `day_outcome`

| | |
|---|---|
| **Current de-facto meaning** | **two different things in one column** |
| **Who supplies it** | **BOTH — and the row cannot tell you which** |
| Can be UNKNOWN? | yes (nullable) — 134 rows are null |
| Can the system derive it? | **it already does, silently** |

**The finding that most changes this document:**

- **check-in gate** → the student *taps* `studied / partial / not_studied /
  skipped`. **Student-stated.**
- **full log sheet** → `deriveOutcome()` infers it from ticked plan tasks:
  all tasks marked full → `studied`; any mark or a mock → `partial`; otherwise
  `null`. **System-derived.**

So `day_outcome = 'studied'` means *"the student said so"* on some rows and
*"we inferred it from ticks"* on others, with **nothing in the row to tell them
apart** — the same defect class as `study_duration`, in the column we were
about to promote to the model's discriminator.

The sheet's own comment says *"inferred from what they marked, never guessed."*
That is true and it is still an inference, and the moment `day_outcome` becomes
canonical evidence, an inference stored as a statement is exactly what the
Constitution forbids.

| Ruling needed | Options |
|---|---|
| **B1-a** Is `day_outcome` a student statement, a system inference, or both with provenance? | (i) student-only — the sheet stops deriving; (ii) both, with a `source` marker; (iii) two columns |
| **B1-b** If both: may an inference ever override a statement? | RECOMMENDATION: **no, never** |
| **B1-c** What does `null` mean — not asked, or not inferable? | today it means both |

## B2. `study_duration`

| | |
|---|---|
| Current meaning | three things: student-typed hours · `creditedHours` derived from ticks · a hard-coded `0` |
| Can be UNKNOWN? | **no** — `numeric NOT NULL DEFAULT 0` |
| Who supplies it | student (sheet), system (tick), nobody (check-in) |
| Can the system derive it? | **it does** — `creditedHours(generatedHours, plannedTasks, fullDone, halfDone)` |

| Ruling needed | Note |
|---|---|
| **B2-a** Is a derived duration the same evidence as a stated one? | RECOMMENDATION: **no.** Needs provenance, or claims about hours mix two kinds. |
| **B2-b** Is a stated `0` legal, and distinct from "not collected"? | RECOMMENDATION: **yes** — a student may honestly log zero hours |
| **B2-c** May any consumer sum stated and derived hours? | RECOMMENDATION: only while saying so |
| **B2-d** Does the half-tick rule (`fullyDone` counts it done, `creditedHours` counts 0.5) stand? | **still unresolved from 0C.1** — blocks B2-a |

## B3. `topics_covered`

| | |
|---|---|
| Current meaning | sections studied · topics studied · not collected — all in one `text[]` |
| Can be UNKNOWN? | **no** — `text[] NOT NULL DEFAULT '{}'` |
| Vocabularies | **two**: section names (170 rows), topic names (23 rows, demo + one superseded app-review account) |

| Ruling needed | Note |
|---|---|
| **B3-a** One vocabulary or two? | RECOMMENDATION: **sections only**, and constrain the writer. Topics belong to `topic_coverage`. |
| **B3-b** Is `[]` "none" or "not collected"? | founder already ruled: **UNKNOWN**. Storage cannot express it. |
| **B3-c** May a later write shrink this list? | Today `log-daily` **replaces** and `complete-task` **merges** — a sheet after a tick erases tick evidence |

## B4. `stress`, `confidence`, `sleep_quality`, `overall_energy`, `quality_focus`, `difficulty`

| | |
|---|---|
| Current meaning | **fabricated** — the RPC hard-codes `2 / 4 / 3 / 4 / 3 / 3` on every write |
| Can be UNKNOWN? | **no** — `smallint NOT NULL DEFAULT 3` |
| Who supplies it | **nobody**, except `confidence` on the ~30 rows where the fire-and-forget update landed |
| Can the system derive it? | **it must not** |

| Ruling needed | Note |
|---|---|
| **B4-a** Does CareerRai collect wellbeing at all today? | Evidence says **no** — only emotional chips, and 82% of those never reach a response |
| **B4-b** If not collected, may any surface display it? | RECOMMENDATION: **no.** This is J3. |
| **B4-c** Do these columns have a future, or are they retired? | Genuinely open — depends on whether wellbeing becomes a product surface |

## B5. `mock_taken`

| | |
|---|---|
| Current meaning | "the student said they took a mock" |
| Conflict | **9 of 26 rows** have `mock_taken = true` without `Mock` in `topics_covered` |
| Ruling needed | **B5-a** which is canonical? RECOMMENDATION: keep `mock_taken`, retire the `Mock` section entry, since a mock is an event and not a syllabus section |

## B6. `report_date`

The one field with no ambiguity. Canonical CareerRai day, `getLogDateString()`,
unique with `student_id`. **No ruling needed.** Backdating is deliberate and
documented.

---

# C. WRITE CONTRACT (proposal)

What a daily-log submission may write. Stated as constraints, not code.

- **C1.** A writer may only write a field it actually collected. **No writer may
  assert a value it was not given** — this single rule retires the RPC's
  wellbeing block.
- **C2.** A writer must record **who supplied** each value it writes (student /
  system-derived), for at least `study_duration` and `day_outcome`.
- **C3.** A writer may **never shrink** evidence another writer recorded.
  `log-daily`'s replace-semantics violates this today.
- **C4.** A writer may not convert an absence into a value. `hours: 0` and
  `sections: []` from the check-in gate are absences today.
- **C5.** One student action → one committed state (Part D).
- **C6.** `topics_covered` entries must come from one declared vocabulary (B3-a).

**Note on C1 + C3 in tension:** the check-in gate must be able to write
`day_outcome` without erasing hours the tick recorded. Today it cannot, because
the RPC takes all fields positionally and overwrites. Any implementation of C1
must handle partial writes, which the current RPC signature cannot express.

---

# D. TRANSACTION CONTRACT (proposal)

**Today:**
```
1. RPC (daily_reports + streak_data)   ← atomic
2. void .update({day_outcome, plan_fit, blocker_reason, confidence})
                                        ← not awaited, not retried, not surfaced
3. return 200                           ← regardless of whether (2) landed
```

**Proposed:** one student action commits one complete canonical state —
`daily_reports` row, streak, outcome, and any review signal, in a single
transaction. Nothing about the day is written outside it.

**Explicitly NOT proposed yet:** moving `day_outcome` into the RPC. Doing that
before B1 is ruled would produce *a beautifully atomic implementation of an
unapproved meaning* — the founder's phrasing, and correct.

**What must be true before the transaction is designed:** B1, B2-a, B3-b.

---

# E. UNKNOWN CONTRACT

The core of the constitution.

- **E1.** UNKNOWN must be **representable in storage**, not reconstructed in
  application code. `0 = UNKNOWN` in TypeScript moves the ambiguity from SQL
  into TS and adds a second place to get it wrong.
- **E2.** UNKNOWN must **never be interpreted as ZERO**, and never as a
  flattering default. The current defect is not `UNKNOWN → 0`; it is
  `UNKNOWN → 4/5`, which is worse — a zero looks like missing data, a 4/5 looks
  like a measurement.
- **E3.** A consumer that cannot express UNKNOWN must **decline**, not
  substitute. Per the 0C.3e consumer sweep, **every consumer of the six
  wellbeing columns is in this category.**
- **E4.** UNKNOWN must be **visible at the surface**, as silence or an explicit
  "not recorded" — never as a number, a zero, or an average that quietly
  excludes it without saying so.
- **E5.** UNKNOWN must **survive aggregation**. `avg([UNKNOWN, 4])` is not `4`
  and is not `2`. It is "one value, one unknown" — and any average that drops
  UNKNOWNs must state its denominator. Four surfaces currently divide by row
  count and call it "avg hrs/day".
- **E6.** UNKNOWN is **not an error**. It needs no alert, no retry and no
  repair. It is a legitimate answer, and the Fact Registry's `FactResult` type
  already models it correctly — this contract extends that discipline to
  storage.

---

# F. CONSUMER MATRIX

Full per-file classification is in `docs/0C-3E-DATA-INTEGRITY-AUDIT.md` Part B.
Summarised by field:

| Field | Consumers | Tolerate UNKNOWN today | Required change |
|---|---|---|---|
| six wellbeing columns | 11 surfaces | **0 of 11** | **all must stop presenting or be retired** |
| `study_duration` | 13 | 3 (display + capacity engine) | 10 must declare their treatment of 0 |
| `topics_covered` | 7 | 1 (display) | 6 must distinguish `[]` from "not collected" |
| `day_outcome` | 1 real (`planReason` → the Home plan narration) | n/a — already nullable ✅ | needs provenance (B1) |
| `mock_taken` | 2 | 2 | one canonical answer (B5-a) |
| **Fact Registry** | 8 facts | **n/a — reads none of these fields** | **none. 0C.3a stands.** |

**The single most important row is the last one.** I attempted again to
construct a path from any of these five fields into `log-insight.ts` and could
not: it consumes eight facts, all of which read distinct dates or
`topic_coverage`.

---

# G. HISTORICAL BOUNDARY

**Proposal: data written before the fix date is marked, never rewritten.**

| Field | Trustworthy before the fix? | Recoverable? |
|---|---|---|
| `stress`, `sleep_quality`, `quality_focus`, `difficulty`, `overall_energy` | ❌ **no** — constants | ❌ never collected |
| `confidence` | ❌ **no** — 290 of 320 fabricated | ❌ **provably unrecoverable**: a fabricated `4` and a genuine student `4` are byte-identical, and `4` is a legal answer |
| `study_duration` | ⚠️ trustworthy **as a number**, ambiguous **as evidence** — stated vs derived vs never-collected | ⚠️ partly: the check-in shape is identifiable by `day_outcome` + `0` + `[]`, but not reliably (Part H, H7) |
| `topics_covered` | ⚠️ same | ⚠️ partly |
| `day_outcome` | ⚠️ value trustworthy, **provenance lost** | ❌ stated vs derived not distinguishable |
| `report_date`, streak | ✅ **yes** | n/a |
| `topic_coverage` (the syllabus matrix) | ✅ **yes** | n/a — unaffected by everything here |

**Rules proposed:**

- **G1.** No backfill, no inference, no AI estimation, no "best guess" for any
  field marked ❌. **A reconstructed value is a fabricated value with extra
  steps.**
- **G2.** Any claim about wellbeing, confidence trends, or hours-provenance
  begins **after** the fix date. A trend computed across the boundary compares
  real data to fabricated data and is worse than no trend.
- **G3.** The boundary date must be **recorded in the repo**, not inferred from
  git history, so a future producer can gate on it.
- **G4.** History is not deleted. It is marked. Deleting it would destroy the
  streak and coverage evidence that **is** trustworthy.

---

# H. ATTACK SUITE

Every case run against the **current** code path. ✅ = the current system
already handles it; ❌ = it does not.

| # | Attack | Current behaviour | Verdict |
|---|---|---|---|
| **H1** | Student says "studied", gives no hours | stored as `study_duration = 0`; 6 consumers read "did not study" | ❌ **the core defect** — 30 rows |
| **H2** | Student says "rest" | `not_studied` + `0` + `[]` — **byte-identical to a `null`-outcome rest log** | ❌ `REST` / `NOT_RECORDED` collide (9 rows) |
| **H3** | Student deliberately submits 0 hours | indistinguishable from H1 and H2 | ❌ a legitimate stated zero cannot be told from a non-measurement |
| **H4** | Student submits no topics | `[]`; avoidance rule reads "skipped all three sections" | ❌ 127 rows; 9 students at 3-empty-rows |
| **H5** | Duplicate submission | RPC upserts on `(student_id, report_date)` — idempotent | ✅ |
| **H6** | **Retry after timeout** | route returns **429** for a resubmit within 15s. **No caller handles 429.** `check-in-gate` shows *"Couldn't save that. Check your connection and try again."* | ❌ **the log DID save; the student is told it did not** |
| **H7** | RPC succeeds, client disconnects | row + streak committed; the `void` update never runs | ❌ row exists with `day_outcome = null`, `confidence` left at the fabricated `4`. **Silent.** |
| **H8** | RPC fails halfway | `plpgsql` function — atomic, rolls back | ✅ |
| **H9** | Old malformed row | 12 rows `(null)` + 0h + sections, all Jul; 6 rows `(null)` + hours + no sections | ❌ no reader accounts for these shapes |
| **H10** | Fabricated legacy row | 282 rows carry the RPC wellbeing signature | ❌ unmarked and indistinguishable |
| **H11** | Missing field | impossible — every column is `NOT NULL` with a default | ❌ **this is the disease, not the cure**: the schema guarantees a value where there is no evidence |
| **H12** | Contradictory combination | `not_studied` + hours > 0: **0 rows today**, but the RPC `UPDATE` does not touch `day_outcome`, and 71 rows have been rewritten — the path is live | ⚠️ **latent** |
| **H13** | Tick after a check-in, same day | `complete-task` merges → sections restored, hours derived; `day_outcome` keeps the check-in's value | ⚠️ produces the `studied`+0h+sections shape (8 rows) |
| **H14** | Full sheet after a tick | `log-daily` **replaces** `topics_covered` → **tick evidence erased** | ❌ violates C3 |
| **H15** | Two devices submit at once | 15s rate limit is a read-then-check, not a lock; the RPC upsert converges | ⚠️ converges on data, but the later `void` update can land on either order |
| **H16** | Rollover moves off 05:30 IST | ~73 `Date.now()`-derived day strings silently disagree with the canonical day | ❌ correct today **by coincidence** |

**Four attacks the current system passes: H5, H8** — and both are the RPC's
doing. The transactional core is sound; everything around it is not.

**H6 and H7 are new in this document** and both are user-visible:
a student who resubmits within 15 seconds is told their log failed when it
succeeded, and a client that disconnects after the RPC leaves a row whose
outcome is silently absent and whose confidence is silently fabricated.

---

# OPEN RULINGS, CONSOLIDATED

| # | Ruling | My recommendation |
|---|---|---|
| B1-a | `day_outcome` provenance — stated, derived, or both-with-marker | **both, with a marker** |
| B1-b | May an inference override a statement? | **never** |
| B1-c | Meaning of `null` outcome | split "not asked" from "not inferable" |
| B2-a | Is derived duration the same evidence as stated? | **no** |
| B2-b | Is a stated `0` legal? | **yes**, and distinct from not-collected |
| B2-d | Half-tick semantics | **still unresolved from 0C.1** — blocks B2-a |
| B3-a | One `topics_covered` vocabulary? | **sections only** |
| B3-c | May a later write shrink evidence? | **no** (fixes H14) |
| B4-a/b/c | Is wellbeing collected? displayable? retained? | **not collected · not displayable · open** |
| B5-a | `mock_taken` vs `Mock` section | keep the flag, retire the section entry |
| A2-i/ii | Three orthogonal axes, or one enum? | **three axes** — production already contains the combination an enum forbids |
| A3 | Is `rest` distinct from `not_studied`? | product decision, no data opinion |
| G3 | Where the boundary date lives | in the repo, gate-able |

---

# STATUS

**No code. No migration. No schema change. No fact. No rule. No consumer
change. No backfill.**

0C.3b remains blocked. 0C.3c not started. J1/J2/J3 from the 0C.3e audit are
approved by the founder but **not started** — they wait on this constitution,
except J3, which the founder ruled may go first and which is scoped in
`docs/0C-3E-DATA-INTEGRITY-AUDIT.md` Part J.

**STOP.**
