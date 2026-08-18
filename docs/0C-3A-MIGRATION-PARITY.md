# 0C.3a — log-insight migration: parity result and completion

**18 Aug 2026.** Gate 4 of the locked seven-gate sequence. **COMPLETE.**

Contract, as ruled: *"Byte-identical parity. Old implementation and registry
implementation run side-by-side in tests. Do not modify the old producer to make
parity pass. Where the old system is provably wrong, classify that divergence
explicitly as a known semantic defect."*

---

## VERDICT: 🟢 GREEN

`log-insight.ts` is now a consumer of the Fact Registry. It applies no ladder
predicate, computes no percentage, counts no rows and constructs no date —
guards assert each of those. Parity is byte-identical on every input where the
old semantics were valid; two classified defects account for every divergence,
and exactly **one production student's output changes**.

---

# PART 1 — THE FOUR RULINGS, DISCHARGED

### 1. Canonical denominator = 46 (28 QA + 9 VARC + 9 DILR) ✅

`rows.length` is gone from the syllabus path. Enforced three ways: the registry
derives every denominator from `KNOWLEDGE_GRAPH`; guard §27 fails any ratio fact
whose declared denominator mentions a row count and asserts behaviourally that a
7-row QA matrix reads **21%, not 86%**; and `log-insight.ts` is asserted to
contain no `.filter(...).length` at all.

### 2. `syllabus_opened_pct` and `section_opened_pct`, derived from the unit facts ✅

Both call the corresponding unit fact's own producer and divide. Neither touches
a coverage row. The binding condition — *"Do NOT create a second implementation
of isOpened"* — is enforced by **counting predicate call sites in the registry
source**: `isOpened` appears exactly twice, `isCovered` twice,
`isAtRevisionDepth` once. One application per semantic family, mechanically.

A third guard asserts the percentage moves in lockstep with its unit fact, so
the two can never drift into disagreeing about the same student.

### 3. `topic` added to the source query ✅

`log-daily/route.ts` now selects `topic, section, status`. Without it the
registry cannot tell a retired or misspelled topic from a live one, and unknown
evidence would count silently.

**This ruling caught a bug in my own first draft.** The migrated function
originally filtered rows with `isExamSyllabusTopic` before calling any fact —
which drops habit tracks (correct) *and* silently drops unrecognised topics
(forbidden: *"no silent filtering of unknown evidence"*). The parity test's
fail-closed case caught it. The predicate is now `isPreparationTrackTopic`: only
the *known other universe* is set aside, and anything unrecognised passes
through to `checkUniverse`, which refuses the fact.

### 4. Missing row ≠ not_started, permanently ✅

Five states, kept apart:

| State | Meaning |
|---|---|
| no coverage row | **UNKNOWN** |
| row says `not_started` | **KNOWN not opened** |
| `isOpened` (learning+) | opened |
| `isCovered` (practicing+) | covered |
| `isAtRevisionDepth` (revising+) | at revision depth |

Guard §28 forbids any `?? 'not_started'` default inside `facts/` — the
`prep-memory.ts:330` pattern that turned absence into measurement in kind 6 — and
asserts an empty matrix stays UNKNOWN rather than becoming a measured zero.

`section_untouched_units` necessarily unions "declared not_started" with "no row
at all", so its **meaning string now says exactly that** and is guarded against
ever claiming "never started". A fact that folds UNKNOWN into a measured zero is
the kind-6 defect wearing a registry badge; a fact that says out loud which two
states it unions is honest. No consumer needs them separated today, so no fact
was invented to separate them.

### 4b. `logged_days_total` — the invariant enforced, not assumed ✅

Two-part proof, per the ruling:

- **Structural.** The producer counts distinct **dates**, so it is immune to
  duplicate rows by construction. Guard: four rows across two dates returns 2.
- **Contractual.** Guard §29 scans `supabase/migrations/` and fails unless
  `UNIQUE (student_id, report_date)` is declared *and* nothing drops it. Verified
  live: `daily_reports_student_id_report_date_key` exists, 0 duplicate pairs.

The route no longer passes `count(*)` at all — it passes the dates.

---

# PART 2 — THE PARITY HARNESS

`src/lib/log-insight.parity.test.ts`. The pre-migration producer is frozen
**inside the test file**, verbatim from commit `3a32277`, so ruling 10 (exactly
one producer in production code) and ruling 6 (both run side by side) hold at
once. Nothing imports it. It is a fixture, not a code path.

**~30,000 cells**, all deterministic — a seeded LCG, never `Math.random()`,
because an unreproducible parity failure is worthless:

| Corpus | What it covers |
|---|---|
| 200 seeded matrices × 12 section combos × 6 date sets × rest/not-rest | 28,800 cells |
| 5 ladder-restricted status pools × 25 seeds × 12 combos | ties and rung clustering the uniform generator misses |
| 9 hand-built boundary shapes × 12 combos × 6 date sets | every rung reached deliberately, incl. opened-but-not-covered and covered-but-not-at-depth |
| habit-track contamination | MOCKS/READING rows sharing the table |
| empty matrix, no daily reports, 45/46, 46/46, 1 row, 2, 16, 30 | the founder's required edge states |
| unrecognised topic | fail closed |

**Zero divergences wherever the old semantics were valid** — i.e. wherever the
student has a row per canonical topic, which is 426 of 427 production students.
A dedicated test re-runs 60 fresh seeds asserting that a 46-row matrix *never*
diverges, however the statuses fall.

---

# PART 3 — CLASSIFIED SEMANTIC DEFECTS

Every divergence in the corpus traces to one of two defects. Both are recorded
in `docs/ENGINEERING-MEMORY-ARCHIVE.md` (#31, #32).

### Defect A — the row-count denominator (Incident #31)

Fixture is the real shape of student `50b0ad71`: 16 rows of 46.

| Studied | Before | After |
|---|---|---|
| QA | *"Just 1 QA topic left untouched — the whole section is in sight."* | *"QA: 6 of 28 topics opened — 21%…"* |
| VARC | *"Every VARC topic is opened — nothing untouched. Now it's depth."* | *"VARC: 4 of 9 topics opened — 44%…"* |
| Mock only | *"Across the syllabus: 15 of 16 topics opened (94%)."* | *"…15 of 46 topics opened (33%)."* |
| All three | *"Just 1 QA topic left untouched"* | *"DILR: 5 of 9 topics opened — 56%"* |

The VARC line is the worst of the four: not a skewed percentage but a **wrong
rung** — breadth declared finished, student advised to move to depth, with 5 of
9 topics never opened.

### Defect B — one topic, two sections (Incident #32) — found in production, averted

`topic_coverage` is unique on `(student_id, section, topic)`, so a mis-sectioned
row duplicates a topic freely. Student `352d0c81` — **21 logs, active** — has
`Vocabulary` under both `VARC` and `General`, both `revising`.

The old producer scoped by section and never saw the stray row. The registry
scopes by topic — deliberately, so it can refuse an unrecognised one — which
made the duplicate **visible and countable**: 10 opened VARC topics out of 9,
untouched −1, *"111% of the section on the board"*.

`prepare()` now runs before every coverage producer and, in order:

1. **refuses** out-of-universe rows,
2. **refuses** contradictory rows — one topic, two different statuses, a
   disagreement no producer may resolve,
3. **collapses** agreeing duplicates — one fact stated twice.

Deduplication and filtering look alike and are opposites. Collapsing a repeat
preserves the evidence; dropping an unknown moves a denominator silently. A
producer may do the first and may never do the second.

---

# PART 4 — PRODUCTION VERIFICATION (read-only)

There are exactly three ways old and new can disagree on a real student. All
three were measured against the live database.

| Condition | Students | Effect |
|---|---|---|
| a core section whose row count ≠ its canonical size | **1** | output changes — Defect A |
| one topic filed under two sections | **1** | output **unchanged** (dedup restores parity); would have broken without it |
| a topic name outside the canonical taxonomy | **0** | — |

All 46 topic names in `topic_coverage` were diffed against `KNOWLEDGE_GRAPH`:
**zero strays, zero canonical topics missing**, in all three sections.

**Students whose post-log line changes: 1.** `50b0ad71` — 3 logs, last active
26 Jul, currently dormant. Their next log will show true numbers instead of
flattering ones.

**Students protected by the dedup fix: 1.** `352d0c81` — 21 logs, logged
yesterday. Their VARC line is byte-identical before and after; without
`prepare()` it would have read 111%. Confirmed against their actual rows: VARC
9 topics, 3 at `revising`, `Vocabulary` agreeing across both sections.

The 47 students with no coverage rows are unaffected — both implementations fall
through to the day count, asserted in the corpus.

---

# PART 5 — ONE PRODUCER, PROVEN

Ruling 10 asked for proof that `log-insight.ts` no longer independently
calculates a canonical fact. Four source-level guards:

- applies no `isOpened` / `isCovered` / `isAtRevisionDepth`
- contains no `* 100` and no `Math.round(` — every ratio the student sees comes
  from a fact with a declared numerator, denominator and range
- contains no `.filter(...).length` and no `rows.length`
- constructs no date and reads no clock

And an exact-set assertion on the eight facts it consumes:
`section_opened_units`, `section_untouched_units`, `section_at_depth_units`,
`section_opened_pct`, `syllabus_opened_units`, `syllabus_opened_pct`,
`logged_days_last_7`, `logged_days_total`.

`log-insight-facts.ts` — the parallel implementation written to *measure*
parity — has been deleted. It existed to be compared, and it has been.

---

# PART 6 — VERIFICATION RUN

| Check | Result |
|---|---|
| Full test suite | **1943 passed, 1 skipped** |
| Registry guards | 49 |
| Parity + migration guards | 21 |
| log-insight behaviour | 18 |
| `tsc --noEmit` | clean in `src/` |
| `eslint` on every touched file | 0 errors, 0 warnings |
| `next build` | success |
| Production read-only queries | 6, all listed above |

---

# PART 7 — STATUS

| Gate | State |
|---|---|
| Gate 3 — opened / depth / lifetime facts | ✅ |
| Gate 4 — 0C.3a parity harness | ✅ |
| Gate 4 — 0C.3a migration | ✅ **complete** |
| Gates 5–7 (0C.3b/c, rule centralisation, Notice engine) | **not started, blocked as ruled** |

`daily-insight.ts` untouched. `computePrescriptiveLine` untouched. No new insight
rule was added, no copy was changed, and no producer outside `log-insight.ts`
was migrated.

**One thing worth flagging before 0C.3b.** The partial-matrix shape is not
legacy residue: `/complete-task` upserts one coverage row on demand, so any
student who skips the onboarding matrix and then ticks tasks lands in it. The
registry now reports such a student honestly, but nothing repairs the matrix.
Whether onboarding should backfill the missing rows is a product decision, not a
migration one, and it is left for the founder rather than taken here.
