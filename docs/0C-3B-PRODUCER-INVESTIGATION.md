# 0C.3b — `computePrescriptiveLine`: read-only producer investigation

**18 Aug 2026. NO CODE. No file modified, nothing migrated, no rule created.**

Ordered before any 0C.3b migration, under the standing law:

> **NO CLAIM ABOUT PRODUCT BEHAVIOUR FROM CODE LOCATION ALONE.**
> **TRACE: PRODUCER → WRITE → CONSUMER → SURFACE → REAL DATA.**

Every number below comes from a production query, not from reading the rule.

---

# PART 1 — EXECUTIVE VERDICT

## 🔴 RED. Do not migrate any of the six rules yet.

Not because the rules are badly written — they are readable, well-intentioned
and shipped in good faith — but because **five of the six read a table whose
columns do not mean what the rules assume they mean**, and the investigation
found that by querying, not by reading.

Three findings dominate. In order of how much they matter to a student:

**1. The emotional-chip rule is 82% dead, and dead exactly when it matters
most.** 28 distress logs from 19 students. **23 of them (82%) happened on the
student's 1st or 2nd log** — below the `recent.length < 3` gate that returns
`null` *before* the chip rule is ever reached. A new student tells CareerRai
they are burned out and CareerRai says nothing. Exactly one `feeling_behind`
log in the product's history has ever reached the rule.

**2. Four rules count ROWS and call them DAYS.** Of the 6 students with ≥7
logs, only 2 have their 7 most recent rows inside a 7-day calendar span. The
average span is **12.2 days; the worst is 29**. So *"3/7 study days last week"*
can be describing a month, and *"Day 3 of skipping DILR"* can be nine calendar
days or three.

**3. `study_duration = 0` and `topics_covered = []` are not evidence of not
studying.** 67 rows carry `day_outcome = 'studied'` — the student affirmatively
said they studied — and **38 of those have zero hours, 30 have no sections**.
The check-in gate writes exactly that shape by design. The consistency rule
counts those as non-study days and the avoidance rule counts them as skipping
all three sections. **This is UNKNOWN presented as ZERO**, the same law that
stopped daily-insight kind 6, in a producer that runs ahead of it in the ladder.

None of these is fixable by "migrating the rule to the Fact Registry". The
registry would faithfully compute the same wrong thing from the same
mis-modelled evidence.

---

# PART 2 — TRACE: PRODUCER → WRITE → CONSUMER → SURFACE

### Consumers and surfaces (verified by reading the render sites)

`computePrescriptiveLine` → `dailyNudge` → `daily_nudge` in the log-daily
response → **two surfaces**:

| Surface | Path | Note |
|---|---|---|
| Full log sheet | `DailyTrackerApp.tsx:262` → `lastNudge` → `noticed` prop (`:388`) | milestone outranks it |
| Check-in gate | `check-in-gate.tsx:107` → `noticed` → `PlanRebuildPayoff` (`:136`) | milestone outranks it |

It is the **rank above** `log-insight.ts`: when it returns a line, the migrated
registry-backed producer never runs. So its defects are not additive with
log-insight's — they *replace* log-insight's correct output.

### Writers into what it reads

It reads `daily_reports`: `topics_covered`, `report_date`, `mock_taken`,
`emotional_chips`, `study_duration` — most recent 14 rows.

**`daily_reports` has three writers, and they do not agree:**

| Writer | `study_duration` | `topics_covered` | Shape |
|---|---|---|---|
| `log-daily` full sheet | student's hours | `body.sections` — VARC/DILR/QA/Mock/Revision | the intended shape |
| `complete-task` (tick closes the day) | `creditedHours(...)` | plan sections, `General` → `Revision` | agrees on vocabulary |
| **`check-in-gate`** | **hard-coded `0`** | **hard-coded `[]`** | records the outcome in `day_outcome` only |

The third writer is the problem. It posts `hours: 0, sections: []` **by
deliberate design** — its own comment says *"A check-in is not a study claim"* —
and files it against **yesterday**. That is a defensible product decision and a
disastrous input for a rule that treats 0 hours as "did not study".

### What is actually in the column

`topics_covered` holds **two vocabularies**:

| Style | Rows | Who |
|---|---|---|
| section names (`QA`, `VARC`, `Mock`…) | 170 | the two live writers |
| **topic names** (`Percentages`, `Geometry`, `Para Jumbles`…) | 23 | demo account `Arjun Sharma` (`is_demo = true`) + one superseded app-review account |
| empty | 127 | check-ins and rest days |

Rules 4 and 6 test `covered.includes('QA')`. Against a topic-style row that is
**always false**, so every one of those rows reads as "skipped QA". Confined to
non-real accounts today — but the column has no constraint preventing it, and
the rule has no way to tell the two vocabularies apart.

---

# PART 3 — THE SIX BEHAVIOURS, CLASSIFIED

The founder's question for each: *fact, event state, interpretation, or UX
feedback?* And: **do not force a behaviour into the Fact Registry merely because
we are migrating.**

| # | Behaviour | True classification | Registry fact needed | Verdict |
|---|---|---|---|---|
| 1 | first-log | **EVENT STATE** — "has this student logged before?" | `logged_days_total` (exists) | ✅ migratable, smallest risk |
| 2 | emotional chips | **UX FEEDBACK on a self-report** — not an insight at all | none. Ever. | ⚠️ move OUT of the engine |
| 3 | consistency | **DERIVED FACT with a broken window and a broken numerator** | needs a new fact + a data ruling | ⛔ blocked |
| 4 | section avoidance | **INTERPRETATION** (Constitution B5) built on unusable evidence | needs a fact that does not exist | ⛔ blocked |
| 5 | mock gap | **EVENT STATE** — "did the student say they took a mock?" | needs a fact; two disagreeing producers | ⛔ blocked on reconciliation |
| 6 | single-section run | **DERIVED FACT** — same row-vs-day defect | needs a fact | ⛔ blocked |

---

## 1 — First log ✅ MIGRATABLE

```
priorCount = recent.length − (isNewLogForDate ? 1 : 0)
if (priorCount <= 0) → "First log done…"
```

Not a fact about the syllabus — an **event state**. `logged_days_total` already
answers it exactly, and better: `recent` is capped at 14 rows, so the current
expression is only correct because nobody near the cap can also be at zero.

**One caveat, not a blocker:** the copy is a promise — *"in 2 weeks you'll see a
pattern you can't see now."* Whether CareerRai can keep that promise is a Rule
Registry question, not a fact question.

## 2 — Emotional chips ⚠️ THIS IS NOT AN INSIGHT

**This is the most important product finding in the investigation.**

Five chips get a scripted reply. The reply is not derived from evidence — it is
a **response to something the student just typed, one second ago**. It is UX
feedback wearing an insight's clothes, and it is ranked *above* every
evidence-based rule in the ladder.

Measured:

| | |
|---|---|
| logs carrying a distress chip | **28**, from 19 students |
| of those, on the student's 1st or 2nd log → **silently dropped** | **23 (82%)** |
| `feeling_behind` logs that ever reached the rule | **1** |
| `family_pressure` logs | **6** — **no branch exists**; the chip is offered and ignored |

Two defects on top of the gate:

**(a) The `feeling_behind` line prints a wrong number.**
```ts
`${daysBetween(recent[0]?.report_date)} days of data say you're showing up.`
```
`recent` is ordered `report_date DESC` and queried *after* today's row is
written, so `recent[0]` **is today**. `daysBetween(today)` is **0**. The line
renders *"0 days of data say you're showing up. That's not behind — that's the
work."* It clearly intends the **oldest** row. Only one student has ever seen
it, which is the only reason this has not been reported.

**(b) `daysBetween` calls `Date.now()`** — a sixth definition of "today",
outside `getLogDateString()`, in a file that already has the canonical one.

**Recommendation: do not migrate this rule. Remove it from the insight engine
entirely and re-home it as an immediate UI acknowledgement** on the log sheet,
where it needs no history, no gate and no fact — so a student on log #1 saying
"burned out" is answered, which today they are not. That is a product change,
not a migration, and it is the founder's call.

## 3 — Consistency ⛔ BLOCKED

```ts
const last7 = recent.slice(0, 7);                                  // ROWS
const studyDaysIn7 = last7.filter((r) => r.study_duration > 0).length;
if (last7.length >= 7 && studyDaysIn7 < 4) → `${studyDaysIn7}/7 study days last week.`
```

**Three separate defects:**

1. **`slice(0,7)` is seven ROWS, not seven days.** Measured: 6 students have ≥7
   logs; 4 of them span more than 7 calendar days in their last 7 rows;
   **average 12.2 days, worst 29**. The line says *"last week"*.
2. **`study_duration > 0` is not "studied".** 38 rows say `day_outcome =
   'studied'` **and** `study_duration = 0`, because the check-in gate writes
   zero by design. The rule calls those non-study days. UNKNOWN → ZERO.
3. **The gate `last7.length >= 7` means only 6 students in the entire product
   can ever see this line.** It is nearly dead, and the ~1% who reach it are
   the most engaged students — the worst possible audience for a false
   *"3/7 study days last week"*.

This rule needs a **data ruling before a fact**: what does a check-in row mean?
See Part 5.

## 4 — Section avoidance ⛔ BLOCKED

Already excluded from the Fact Registry by **Constitution B5** as an
INTERPRETATION, and that ruling holds. But the evidence beneath it is worse than
the classification suggests:

- `daysMissed` counts **consecutive rows**, and is rendered as *"Day 3 of
  skipping DILR"*. Rows ≠ days (see above).
- A row with `topics_covered = []` counts as skipping **all three** sections.
  **9 students have their three most recent rows all empty.** For them the rule
  fires on the absence of a recording, not the absence of study.
- **The check-in gate triggers it against itself.** It posts `sections: []`, so
  `todaySections` is empty, so no section is excluded — and its own row is one
  of the rows counted as a skip. A student who checks in *"yes, I studied
  yesterday"* can be told *"Day 3 of skipping QA"* **on the strength of the
  check-in they just completed.**
- The claim *"that's the section costing you percentile"* is a **causal claim
  with no evidence behind it at all**. No mock-performance link exists. Under
  the founder's level hierarchy this is a Level 4 diagnosis rendered from Level
  1 evidence.

## 5 — Mock gap ⛔ BLOCKED, but not for the reason expected

The **NOT READY** flag on mock data covers mock *performance*. This rule does
not read performance — it reads `mock_taken`, a self-reported **event**. That
distinction matters and it is in the rule's favour.

What blocks it is that **"took a mock" has two disagreeing producers in the same
table**: 26 rows have `mock_taken = true`, and **9 of them (35%) do not carry
`Mock` in `topics_covered`**. The rule's guard reads the section list and its
test reads the flag, so the rule contradicts itself on a third of its own
evidence. (The reverse never happens: 0 rows have the section without the flag.)

Plus the same `slice(0,7)` rows-as-days defect, and the same ≥7-rows gate that
limits it to 6 students.

**Blocked on:** one canonical answer to *"did this student take a mock on day
D?"* — which is a 0C.3d data-semantics job, not a migration.

## 6 — Single-section run ⛔ BLOCKED

Cleanest logic of the six, same fatal input: `runLength` counts consecutive rows
and says *"4 days straight on QA"*. It also inherits the topic-vs-section
vocabulary problem, since it filters `topics_covered` against `coreSections`.

Worth preserving as a concept — it is the only rule that notices *balance*
rather than volume, and nothing in the registry expresses it today.

---

# PART 4 — WHAT A HONEST MIGRATION WOULD NEED

Facts that do not exist yet. **Listing them is not requesting them** — the
0C.3 investigation's mistake was to enumerate counts and miss percentages, so
this list is deliberately complete and deliberately unapproved.

| Fact | For | Blocked by |
|---|---|---|
| `study_days_last_7` | rule 3 | what counts as a study day (Part 5) |
| `section_days_since_last_studied` | rule 4 | day semantics + `topics_covered` vocabulary |
| `days_since_last_mock` | rule 5 | two disagreeing mock producers |
| `single_section_run_days` | rule 6 | day semantics + vocabulary |

Every one of the four is blocked by the same root cause, which is why the
correct next step is a data-semantics gate, not four fact registrations.

**One fact already exists and is enough for rule 1:** `logged_days_total`.

---

# PART 5 — THE GATE BEFORE THE GATE: what does a `daily_reports` row MEAN?

This is the founder's `topic_coverage` question — *complete state table, or
touched-only event table?* — asked of the other table, and it is the real
blocker.

Today one row can mean any of these, and nothing distinguishes them:

| Row shape | Rows | What actually happened |
|---|---|---|
| hours > 0, sections listed | 134 (approx.) | a full log |
| `day_outcome = 'studied'`, 0 hours, no sections | **38** | check-in: student **says they studied**, we know nothing else |
| `day_outcome = 'not_studied'`, 0 hours, no sections | **54** | check-in: student says they did not |
| `day_outcome = 'partial'`, 0 hours | **24** | check-in: partial |
| `day_outcome = 'skipped'` | 12 | check-in: skipped |
| no `day_outcome`, 0 hours | 21 | a rest-day full log |

**A rule that reads `study_duration` cannot tell row 2 from row 3.** One is a
student affirming they studied; the other is a student affirming they did not.
The column says `0` for both.

**Three questions that must be ruled before any of rules 3–6 can be migrated:**

- **Q1.** Does `day_outcome = 'studied'` with `study_duration = 0` count as a
  study day? (I would say **yes, as UNKNOWN-hours-but-studied** — a third state
  the schema does not currently have. It must not silently become either 0 or a
  guessed number.)
- **Q2.** Is `topics_covered = []` "no sections studied" or "sections not
  recorded"? For check-in rows it is unambiguously the second, and the avoidance
  rule assumes the first.
- **Q3.** Is a window seven **rows** or seven **calendar days**? Every windowed
  rule in this file currently answers "rows" while its copy says "days".

These are the same three questions as the `topic_coverage` audit, one table
over: *complete state, or evidence of what was touched?*

---

# PART 6 — RISKS

| # | Risk | Class | Exposure today |
|---|---|---|---|
| 1 | Distress chips silently dropped below the 3-log gate | **P0 product** | 23 of 28 distress logs, 19 students |
| 2 | `family_pressure` offered with no branch | **P1 product** | 6 logs |
| 3 | Consistency counts a check-in "studied" as a non-study day | **P0 integrity** | 38 rows |
| 4 | Avoidance fires on absent recording, incl. its own check-in row | **P0 integrity** | 9 students at 3-empty-rows |
| 5 | Four rules label row counts as calendar days | **P1** | 4 of 6 eligible students; worst 29 days called "7" |
| 6 | *"the section costing you percentile"* — causal claim, no evidence | **P1 trust** | any avoidance fire |
| 7 | `feeling_behind` renders "0 days of data" | **P2** (1 student reached it) | 1 |
| 8 | `daysBetween` uses `Date.now()` — a sixth "today" | **P2** | — |
| 9 | `mock_taken` vs `Mock` section disagree | **P1** | 9 of 26 |
| 10 | `topics_covered` holds two vocabularies | **P2 today, P0 latent** | 23 rows, non-real accounts only |

**Note on #1 and #2:** these are the only findings here that hurt a student
*today*, and neither is a metric defect. They are a product gap that the
integrity work happened to walk past.

---

# PART 7 — RECOMMENDED SEQUENCE

Not a request to proceed. A proposal for the founder to rule on.

1. **0C.3b-i — rule 1 only.** `logged_days_total` already exists; the migration
   is small, provable and parity-testable. Nothing else moves.
2. **Re-home rule 2 out of the insight engine.** Product change: answer a
   distress chip immediately on the log sheet, with no history gate. Fixes the
   82% drop and the `family_pressure` gap. Needs no fact and no registry.
3. **0C.3d before the rest of 0C.3b.** Rule Q1/Q2/Q3 above, and the
   `topic_coverage` complete-vs-touched question, and half-tick, and
   `swapped_out`. **Rules 3–6 stay exactly as they are until then** — they are
   wrong, but they are wrong in a way that is now written down, and changing
   them before the semantics are ruled would just move the wrongness.
4. **Then** 0C.3c (`daily-insight.ts` split, not retire).
5. **Then** 0C.4 Rule Registry.

## What I recommend NOT doing

**Do not migrate rules 3–6 now.** The Fact Registry would compute the same
claims from the same mis-modelled evidence, with provenance attached — which
makes a wrong claim *more* credible, not less. That is the worst possible
outcome for a trust system.

**Do not delete them either.** They are the only behavioural noticing the
product has, they are documented now, and four of the six describe something
real that the registry cannot yet express.

---

# PART 8 — FINAL GATE

## 🔴 RED — one rule migratable, five blocked on data semantics

**Cleared to migrate:** rule 1 (first log), on the existing `logged_days_total`.

**Product decision requested, no code:** rules 2's home — insight engine or
immediate UI acknowledgement.

**Blocked pending 0C.3d:** rules 3, 4, 5, 6.

---

**STOP.** No code written. No file modified. No fact registered. No rule
created. 0C.3b migration not started.
