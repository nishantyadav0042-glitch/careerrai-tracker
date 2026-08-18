# G6 — Consumer Interpretation Audit (`study_duration`)

**Gate:** G6, read-only. Opened under J6-A with `study_duration_source` now live (`27e1749`).
**Question:** what question is each consumer actually answering, and what source-aware
interpretation is truthful for it?
**Status:** AUDIT ONLY. No code, schema, migration or data changed. No consumer repointed.
**Date:** 18 Aug 2026.

---

## VERDICT — do not make consumers source-aware yet

The obvious next step is wrong, and production proves it numerically.

**`study_duration_source` alone is not sufficient to interpret `study_duration`.**
It must be read together with `day_outcome`. A consumer that switches to the naive
source-only rule — *"exclude every `not_collected` row"* — **overstates** average study
by 29%, which is worse in magnitude than the bug it was meant to fix.

| Rule | Avg h/day across real reports | Error |
|---|---|---|
| **Today** — every zero counted | **1.85** | 28% LOW |
| **Naive source-only** — drop all `not_collected` | **3.31** | 29% HIGH |
| **Pair-aware** — drop only where the duration is genuinely unknown | **2.57** | the truthful one |

The naive rule discards **68 genuine zeros**: rows where the check-in gate collected
`day_outcome = 'not_studied'` or `'skipped'`. Those days really were zero — the gate
never asked *how long*, but the student already answered *whether*. Dropping them
inflates every average by removing the real zeros and keeping only the study days.

**Recommendation: GO on defining the interpretation authority; NO-GO on repointing any
consumer until it exists and the four rulings in §7 are made.**

---

## 1. What changed since G4

Three things, and they reframe the question:

1. **The vocabulary now exists** (`credited` | `self_reported` | `not_collected` |
   `declared_zero` | NULL). G4 could only classify consumers by intent; G6 can ask what
   each should *do* with each value.
2. **A3 already fixed the PRESENCE question.** "Did the student study that day?" is
   answered by `dayWasStudied()` in `check-in.ts` across all four sites that asked it.
   **G6 is about MAGNITUDE only** — how much — which A3 deliberately did not touch.
3. **All 330 existing rows are NULL.** Stamping begins only when the new build deploys.
   Any interpretation rule must therefore treat NULL as the dominant case, not the
   exception.

And this is not a legacy clean-up. Over the last 14 days of real traffic the projected
split is roughly **32% credited · 37% zero-with-outcome · 31% not-collected**. Nearly a
third of live logging carries an unknown duration. This is the steady state.

---

## 2. The central finding — the pair rule

`study_duration_source` records **how the number was produced**. It does not record
**whether the day's duration is knowable**. Those differ in exactly one place, and it is
the common one:

| `study_duration_source` | `day_outcome` | What the 0 means | Magnitude treatment |
|---|---|---|---|
| `not_collected` | `studied` / `partial` | We never asked, and they say they studied | **UNKNOWN — exclude** |
| `not_collected` | `not_studied` / `skipped` | We never asked, but they already said there was nothing | **Real zero — count as 0** |
| `not_collected` | NULL | No signal at all | **UNKNOWN — exclude** |
| `declared_zero` | any | The student stated they did not study | Real zero — count as 0 |
| `credited` | any | Priced from coverage | The value |
| NULL (legacy) | any | Provenance erased | The value, flagged unknown-provenance |

The check-in gate stamps `not_collected` for **all four outcomes**, because it never asks
for a duration whatever the answer. But when the outcome is `not_studied` or `skipped`,
the outcome has *already answered the duration question implicitly*. That asymmetry is
the whole finding.

**Production distribution of the 0-hour rows this governs:**

| `day_outcome` | Rows at 0 hours | Rule |
|---|---|---|
| `not_studied` | 55 | count as 0 |
| `studied` | 37 | **exclude — unknown** |
| `partial` | 25 | **exclude — unknown** |
| NULL | 21 | exclude — unknown |
| `skipped` | 13 | count as 0 |

68 count as zero; 83 are genuinely unknown. A rule that cannot tell them apart will be
wrong about one group or the other, whichever way it errs.

---

## 3. There are five questions, not thirty consumers

The 30 consumers ask only five distinct questions. Interpretation belongs to the
**question**, not the file — which is the same discipline that produced
`dayWasStudied()` and `completion-portion.ts`.

| # | Question | Consumers | Truthful rule |
|---|---|---|---|
| **Q1** | *Did they study that day?* (presence) | 4 | **DONE (A3).** `dayWasStudied()`. Reads `day_outcome` first — already immune to this whole problem. |
| **Q2** | *How much on this one day?* (single-day magnitude, displayed) | ~5 | Show the value when known; show **"not recorded"** — never `0.0 hrs` — when unknown. |
| **Q3** | *How much on average / in total?* (aggregate magnitude) | ~9 | Exclude unknown days from BOTH numerator and denominator. Return **UNKNOWN**, not 0, when nothing is known. |
| **Q4** | *What can this student sustain?* (capacity input) | 3 | **DEFERRED.** Capacity has its own trust model; feeding it fewer, truer days changes its `trust` tier. Needs its own ruling. |
| **Q5** | *Did they hit the hours they committed to?* (comparison, and it PENALISES) | 3 | **Highest risk.** An unknown day must never read as a shortfall. |
| **Q6** | Not a metric — round-trip, dedup, types | ~6 | Untouched by definition. |

---

## 4. Q3 carries the J2 bug, for the third time

`src/lib/analytics.ts`:

```ts
function avg(arr: number[]): number {
  if (!arr.length) return 0;      // ← absence of evidence, rendered as a confident 0
  ...
}
const avgStudy = avg(reports.map((r) => r.study_duration));
```

This is the **third recurrence of one pattern** in this workstream:

1. **J2** — `avg([]) === 0` fired a sleep-quality flag 26 times at students who had logged nothing.
2. **A3** — `study_duration > 0` read 62 declared study days as non-study days.
3. **Q3 (now)** — averaging unknown durations as zero understates every affected student.

Same disease each time: **absence of evidence rendered as a confident number.** Making
Q3 source-aware without fixing `avg()` would make it *worse*, because excluding unknown
days shrinks the array — and an empty array still returns 0 rather than UNKNOWN.

**Measured impact today:**

| | |
|---|---|
| Students with ≥1 unknown-duration day | **38** |
| Currently red-flagged (`avgStudy < 3`) | 106 |
| Flagged **only** because unknowns count as zero | **10** |
| Students with **no known duration at all** — reported as 0h rather than unknown | **24** |

Those 24 are the J2 case exactly: `avg([])` will return 0, they will be flagged, and
their buddy will be told they studied nothing.

---

## 5. Q5 is the one that causes harm, not just error

`api/cron/weekly-plan-reconcile/route.ts`:

```ts
loggedHoursByDay: week.days.map((d) => hoursByStudentDay.get(`${s.id}|${d}`) ?? 0)
```

A day with no row and a day with a check-in row are **indistinguishable** here — both
become `0`. That array feeds `reconcileWeek`, which **extends `syllabus_target_date`**.

So a student who checks in "Studied" every day but never opens the full log has their
finish date pushed out as though they studied nothing. Every other consumer merely
*reports* wrongly; this one *acts* on the wrong number, against the student.

**Exposure now: 35 students carry 58 unknown-duration days that feed this cron.**

Under J6-A the correct behaviour is not to guess the missing hours — it is to treat the
week as **not assessable** and leave the date alone. Extending a date on unknown evidence
is precisely manufacturing provenance, one layer up.

---

## 6. The rollout discontinuity nobody will expect

History is NULL; new rows are stamped. A rolling metric that excludes unknown days will
therefore **drift upward** as stamped rows replace legacy ones — not because students
changed, but because we stopped counting unknowns as zero.

- 7-day windows: complete the shift in 7 days
- 21-day capacity window: 21 days

Anyone watching a dashboard will read that as improvement. It is not. **Whatever ships
must date-stamp the change and annotate the series**, or the first person to look will
draw a false conclusion — and this project has already paid for a metric that changed
meaning silently.

---

## 7. What needs a ruling before any consumer moves

1. **Is the pair rule the law?** Specifically: `not_collected` + `not_studied`/`skipped`
   counts as a real zero. Everything in §2 depends on this and it is a semantic call, not
   an implementation detail.
2. **May `avg()` return UNKNOWN?** Q3 cannot be fixed truthfully while the shared helper
   converts "nothing known" into `0`. This touches `AnalyticsSummary`'s type and every
   surface that renders it.
3. **What does Q5 do with an unassessable week?** Recommended: leave the date untouched.
   The alternative — extend anyway — is the current behaviour and is what harms 35 students.
4. **Does Q4 (capacity) get the same rule, or its own?** Fewer, truer days change
   `computeCapacity`'s `trust` tier as well as its value. It stays deferred until ruled.

---

## 8. Recommended shape, if and when ruled

One authority, mirroring `dayWasStudied()`:

```
knownDuration(row) -> number | UNKNOWN     // one day, pair-aware
knownDurationStats(rows) -> { avg, total, n } | UNKNOWN   // aggregate, empty => UNKNOWN
```

Not a boolean helper and not a per-file fix: the 30 consumers drifted apart precisely
because each answered the question locally. Q1 already proved the shape works.

**Sequencing:** ruling → authority + tests → Q5 (harm) → Q3 (`avg()` first) → Q2 (display)
→ Q4 last, after its own ruling. Nothing repoints before the authority exists.

---

## 9. Method

Consumer set re-derived by fresh sweep (`study_duration` across `src/`), not inherited
from G4's list. All figures are read-only production queries excluding demo and test
accounts. The three-rule comparison in the verdict was computed on the same corpus in one
query so the numbers are directly comparable. Where the projected source of a historical
row was needed, `day_outcome` + value was used as an explicit proxy — stated as a proxy,
because all 330 rows are genuinely NULL today.
