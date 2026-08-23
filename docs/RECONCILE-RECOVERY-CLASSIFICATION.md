# Reconciliation recovery — read-only row-level classification

**SELECT only. No UPDATE, no DELETE, no INSERT. Nothing repaired. Phase D
frozen. This document exists so a repair can be authorised from evidence, not
from a summary.**

**Date:** 23 Aug 2026 · **Scope:** all 1,256 `plan_extensions` rows ever written
· **Row-level table:** `2026-08-plan-extension-recovery.csv` (1,256 rows), sent
to the founder directly — **deliberately not committed: this repository is
public and the table carries student identifiers and syllabus dates.**

---

## 0. The conceptual lock

> **A failed source read is `UNAVAILABLE`, not `VALUE(0)`.**

Every row from the 23 Aug run is an **untrusted mutation**, regardless of what
the student's true study activity turns out to have been. "The student really
did study zero hours" and "today's +N extension was valid" are different
claims. The job did not establish zero. It received nothing and wrote zero.

598 of those students probably would have been extended by a correct run. They
are right by luck, not by evidence, and luck is not a recovery criterion.

---

## 1. When the failure began — and it is later than I previously said

| Run (UTC) | Week reconciled | **Students in the `.in()` list** | Rows written | Students who had hours **at read time** | Recorded correctly | **Read failures** |
|---|---|---|---|---|---|---|
| 9 Aug 13:31 | 3–9 Aug | **263** | 228 | 2 | 2 | **0** |
| 16 Aug 13:30 | 10–16 Aug | **428** | 373 | 20 | 20 | **0** |
| **23 Aug 13:30** | **17–23 Aug** | **739** | **655** | **57** | **0** | **57 — total failure** |

**Correction to my own earlier report.** I previously recorded the 16 Aug run as
having 1 wrongly-zeroed student (Apeksha Bhadouriya, 6.9 h). That was an artefact
of my comparison, not a defect in the run: I compared the job's output against
the *final* state of that week, but **she logged those 6.9 hours at 16:20 UTC —
two hours and fifty minutes AFTER the 13:30 run**. The read was correct. The
extension was correct on the evidence available at the moment it ran.

So the source-read failure did not degrade gradually. **It began exactly on
23 Aug**, as a step change: 0 failures, 0 failures, then total failure.

The `.in()` list is every student, not only those extended — so request size
tracks total cohort. It worked at **428** students and failed completely at
**739**.

### The mechanism is bracketed, NOT proven

At ~45 URL-encoded bytes per UUID the `student_id=in.(…)` clause is roughly
11.8 KB at 263 students, **19.3 KB at 428 (worked)** and **33.3 KB at 739
(failed)**. That brackets a limit somewhere between ~19 KB and ~33 KB, which is
consistent with the 24 KB figure hypothesised earlier — and consistent is all it
is.

**I have not reproduced it and I am not calling it proven.** Proving it needs a
PostgREST `GET` with a growing `in` list until it errors, which requires an API
key I deliberately do not hold in this session. What is established is the
correlation and the step change; the causal mechanism remains inference.

---

## 2. Recovery classification — the 23 Aug run (the untrusted mutations)

| Classification | Rows | Students | Days | Reason |
|---|---|---|---|---|
| **SAFE_AUTO_REVERSE** | **635** | **635** | **3,690** | Current `syllabus_target_date` still equals this extension's `new_date`, so this extension is still the active cause. |
| **ALREADY_CORRECTED** | 20 | 20 | 0 | `hit_exam_wall`: the date was already at the exam boundary and could not move. `days_added = 0`, `previous_date = new_date`. **No mutation occurred, so there is nothing to reverse.** |
| LATER_STATE_CHANGE | 0 | 0 | 0 | — |
| UNKNOWN | 0 | 0 | 0 | — |

**Recoverable: 635 rows, 635 students, 3,690 days.**

Two of the 635 have `dismissed_at` set — the student dismissed the warning card.
That dismisses a notification, not the date change, so they stay in
SAFE_AUTO_REVERSE. Flagging it because a repair script must not treat
`dismissed_at` as "handled".

**A note on where I bent the taxonomy.** The 20 `hit_exam_wall` rows are not
"someone already reversed it" — they are "no state change ever happened". I
filed them under ALREADY_CORRECTED because the *action* is identical (none), but
the reason column says exactly what they are rather than pretending.

## 3. The other two runs — valid, and must NOT be reversed

| Week | SAFE_AUTO_REVERSE | LATER_STATE_CHANGE | ALREADY_CORRECTED |
|---|---|---|---|
| 3–9 Aug | 3 rows / 13 days | 211 rows / 1,507 days | 14 rows / 0 days |
| 10–16 Aug | 3 rows / 13 days | 355 rows / 2,016 days | 15 rows / 0 days |

**These runs read successfully.** Their extensions were arithmetically correct on
the evidence available. The `LATER_STATE_CHANGE` majority is simply the 23 Aug
run having moved everyone's date again afterwards.

**Do not reverse these.** They are not damage. Listing them keeps the recovery
scope from quietly widening: the repair set is the 23 Aug run's 635 rows, and
nothing else.

## 4. Why 57 is a lower bound, not the recovery set

Within the 635 SAFE_AUTO_REVERSE rows:

| Evidence about the student's actual week | Rows |
|---|---|
| Provably studied — `study_duration > 0` in that week | **57** |
| Logged at least one day, but hours sum to 0 | **20** |
| No `daily_reports` row at all that week | 558 |

**57 understates the harm for three independent reasons:**

1. **`study_duration = 0` does not mean "did not study."** The daily check-in
   gate posts `hours: 0` with provenance `not_collected` — the student was never
   asked. G4 found 62 real rows across 38 students carrying
   `day_outcome ∈ {studied, partial}` with a zero hours column. The 20
   logged-but-zero rows above are exactly this population.
2. **Provenance is itself incomplete.** 21 rows repo-wide carry a null
   `study_duration_source` (a frozen item), so for those we cannot even say
   which kind of zero it is. Apeksha's row is one of them.
3. **The job's own output is not evidence of anything.** It read nothing. Using
   `actual_hours = 0` to conclude a student did not study is the exact inference
   this incident is about.

So the honest statement is: **57 provably wrong, up to 77 plausibly wrong, and
635 decided on no evidence at all.** The recovery set is the 635 — not because
all 635 students were harmed, but because none of the 635 decisions were made on
valid data.

## 5. A design issue found on the way, not fixed

The job reconciles week `[Mon…Sun]` at **13:30 UTC on the Sunday** — 19:00 IST,
with five hours of the CareerRai day still to run. Any studying a student does
on Sunday evening is invisible to the reconciliation that judges that Sunday.
Apeksha's 16 Aug row is a live example: correct when written, wrong three hours
later.

Not a read failure and not in scope here. Recorded because a repair that only
fixes the read leaves this intact.

## 6. Reproducing this table

```sql
WITH ext AS (
  SELECT pe.*, p.syllabus_target_date AS current_date_now,
    COALESCE((SELECT SUM(r.study_duration) FROM daily_reports r
              WHERE r.student_id = pe.student_id
                AND r.report_date BETWEEN pe.week_start AND pe.week_end), 0) AS real_hours
  FROM plan_extensions pe JOIN profiles p ON p.id = pe.student_id
)
SELECT id, student_id, week_start, created_at, previous_date, new_date,
       current_date_now, days_added, actual_hours, real_hours,
  CASE
    WHEN current_date_now IS NULL                                       THEN 'UNKNOWN'
    WHEN days_added = 0 AND previous_date = new_date                    THEN 'ALREADY_CORRECTED'
    WHEN current_date_now = new_date AND new_date <> previous_date      THEN 'SAFE_AUTO_REVERSE'
    WHEN current_date_now = previous_date AND new_date <> previous_date THEN 'ALREADY_CORRECTED'
    WHEN current_date_now <> new_date                                   THEN 'LATER_STATE_CHANGE'
    ELSE 'UNKNOWN' END AS classification
FROM ext ORDER BY week_start DESC, classification;
```

## 7. Limits of this classification — stated, not buried

- **`profiles` has no `updated_at`.** I can prove the current date *equals* the
  bad `new_date`; I cannot prove nothing else moved it and moved it back. For
  the 23 Aug run the window is under three hours, so intervening movement is
  unlikely — but it is unproven, and a repair should re-verify the equality
  inside the same transaction as the write rather than trusting this snapshot.
- **No mutation-level audit trail exists** for `syllabus_target_date`. The
  causal chain is reconstructed from `plan_extensions` alone.
- **`real_hours` is computed from `study_duration`**, whose semantics are
  unresolved (Wave 5, B1–B7). Every count derived from it is provisional.
