# Phase D — repair executed and verified

**Authorised by the founder, 23 Aug 2026: the 635 `SAFE_AUTO_REVERSE` rows only.**
Executed 23 Aug 2026 against `pobhpszlsozeonejtzqy`.

---

## Result

| | Authorised | Attempted | Reversed | Skipped |
|---|---|---|---|---|
| Rows | 635 | **635** | **635** | **0** |
| Students | 635 | 635 | **635** | 0 |
| Days | 3,690 | 3,690 | **3,690** | 0 |

**Independent post-repair verification** (re-derived from current state, not from
the write's own `RETURNING`):

| Check | Expected | Actual |
|---|---|---|
| Rows in the failed run | 655 | **655** |
| Classified SAFE_AUTO_REVERSE | 635 | **635** |
| **Extensions from the failed run whose date move is still active** | **0** | **0** ✅ |
| Students now sitting at their pre-incident `previous_date` | 635 | **635** ✅ |
| Rows in neither state (something else moved the date) | 0 | **0** ✅ |
| `NO_MUTATION_HIT_EXAM_WALL` rows untouched | 20 | **20** ✅ |
| `plan_extensions` rows total (nothing deleted) | 1,256 | **1,256** ✅ |

Spot-check: Apeksha Bhadouriya's 23 Aug row was `2026-10-05 → 2026-10-12`. Her
target date is now **`2026-10-05`**.

**The before/after invariant is satisfied.** Not "635 rows deleted" — no row was
deleted. The statement that holds is: *zero extensions from the failed run still
have an active date mutation, and every student the run moved is back at the
date they held before it ran.*

## How the guard worked

One `UPDATE` statement, therefore atomic. The equality check lives **inside the
`UPDATE`'s own `WHERE`**, so Postgres evaluates it against the locked row version
at write time and re-qualifies under READ COMMITTED if a concurrent write
intervened. A row failing any condition is simply not updated — skipped, never
forced.

```sql
WITH target AS (
  SELECT pe.id, pe.student_id, pe.previous_date, pe.new_date, pe.days_added
  FROM plan_extensions pe JOIN profiles p ON p.id = pe.student_id
  WHERE pe.created_at BETWEEN '2026-08-23 13:30:00+00' AND '2026-08-23 13:32:00+00'
    AND pe.days_added > 0
    AND pe.previous_date IS NOT NULL
    AND pe.previous_date <> pe.new_date
    AND p.syllabus_target_date = pe.new_date
), upd AS (
  UPDATE profiles p SET syllabus_target_date = t.previous_date
  FROM target t
  WHERE p.id = t.student_id
    AND p.syllabus_target_date = t.new_date   -- re-checked AT WRITE TIME
  RETURNING p.id, t.days_added
)
SELECT (SELECT COUNT(*) FROM target) AS attempted,
       (SELECT COUNT(*) FROM upd)    AS reversed;
```

**No database limitation to report.** The missing `profiles.updated_at` prevented
*historical* proof, and the founder's ruling was right: historical proof is
unnecessary when the write itself is guarded.

**Idempotency comes free.** After reversal `syllabus_target_date = previous_date
≠ new_date`, so the guard is false and a re-run reverses nothing. No `reversed_at`
marker column was added — that would have been a production DDL change nobody
authorised, and the guard already provides the property it would have provided.
If a persistent marker is wanted for audit, that is a separate decision.

## What was NOT touched

- The 20 `NO_MUTATION_HIT_EXAM_WALL` rows — verified still at `new_date`, as they
  always were, because no date ever moved.
- The 9 Aug and 16 Aug runs — no row from either was in the target set.
- Any `plan_extensions` row — none deleted, none updated. Only
  `profiles.syllabus_target_date` was written.
- Students with a NULL target date — unreachable by construction: the guard
  requires `syllabus_target_date = new_date`, and `new_date` is never NULL.
- No notification of any kind. No student or mentor was told anything.

## One verification label of mine was wrong, and the result is right

My verification query annotated the earlier runs as *"rows still active
(untouched, must be 3)"*. The actual counts came back **205** and **351**, and
that is the **correct** outcome, not a regression.

Before the repair, the 9 and 16 Aug extensions read as `LATER_STATE_CHANGE`
purely because the 23 Aug run had moved everyone's date *past* them. Reversing
23 Aug restores each student to the date the 16 Aug run had legitimately set —
so those older, valid extensions are once again the active cause. That is exactly
the pre-incident state we were restoring to.

The "must be 3" was my expectation carried over from the pre-repair snapshot
without thinking it through. The number that actually proves the repair is
`restored_to_previous_date = 635`, which is measured against each row's own
`previous_date` and is independent of any other run.

## Still open, deliberately untouched

- **The Sunday timing defect.** The job judges a week at 13:30 UTC / 19:00 IST on
  that week's own Sunday, with five hours of the CareerRai day still to run.
  Not changed during the repair. Needs a ruling: move the run, exclude Sunday
  until the day closes, or end the weekly window at the reconciliation boundary.
- **The 20 exam-wall rows** — no action needed, none taken.
- **55 remaining population-scaled reads** (B3b) — the next phase.
- `ceil()` rounding, null provenance, `landed`, Wave 2 coverage — all untouched.
