# A3 (re-cut) — production observation record

**19 Aug 2026.** Deployed `e91c86e` / `dpl_EZYxG1HwHs6czTkm91fXDuW3xrva`.
Founder ruling: deployment ACCEPTED, data-shape validation ACCEPTED,
**runtime-path validation PENDING ordinary traffic.**

---

## The three-stage status, kept separate on purpose

| Stage | Status | What it means |
|---|---|---|
| **Deployed** | ✅ | `careerrai.in` serves `data-dpl-id=dpl_EZYxG1…`, `age: 0`. Fast-forward only, scope-checked file-by-file. |
| **Observed (data-shape)** | ✅ | The deployed predicate evaluated against all 342 real production rows. Monotonicity holds on today's data. |
| **Runtime-path validated** | ⏳ | No student request has yet exercised `dayWasStudied()` through `studyDaysIn7` / `activeDays21` / student-360 / lis-health. |

"Deployment succeeded" is not "A3 is proven." The third row closes only when a
real student interaction runs the repointed code.

## Measured, all-time, 342 rows

| Metric | Old rule (`study_duration > 0`) | New rule (union) |
|---|---|---|
| Study days | 181 | **246** |
| Restored days | — | **65** |
| Students affected | — | **40** |
| Students moving 0 → >0 | — | **17** |
| Largest single-student gain | — | **8 days** |
| Students losing days | — | **0** |
| Would-lose rows (`not_studied`/`skipped` with hours > 0) | — | **0** |

The 17 students moving from zero are the substantive finding: this is not an
obscure aggregate shifting. The product previously described those students as
having never studied at all, and told some of them so.

## THE MEASUREMENT CAVEAT — do not drop this when citing 65/40

**The 65/40 figures are ALL-TIME. The four repointed consumers are WINDOWED
(7-day and 21-day).** They are not the same quantity and must never be compared
directly.

- **65** = all-time historical study-days restored by the corrected predicate.
- **40** = distinct students affected, all-time.
- **Student-facing impact** depends entirely on whether a given student's
  restored days fall inside the relevant 7/21-day window. A student with 8
  restored days in June sees no change in their weekly payoff line today.

Anyone later reporting "A3 fixed 65 days for 40 students" as a statement about
what students currently see would be overstating it in exactly the way this
whole workstream exists to prevent.

## Drift since the parked branch measured

| | 18 Aug (branch `fdfa6de`) | 19 Aug (re-cut) |
|---|---|---|
| Restored days | 62 | **65** |
| Students | 38 | **40** |

Three further student-days were mis-read in live traffic between the two
measurements. The defect was still accruing, which is why the re-cut
re-measured rather than reusing the branch's figures.

## Errors

One runtime error group in the deploy window: a push 410 for a dead
subscription in `/api/cron/daily-insight`, **first seen 7 Aug**, last seen on
the *previous* deployment. Pre-existing and unrelated. **Logged separately; no
evidence A3 caused it.** Zero new error groups on `dpl_EZYxG1…`.

## What A3 deliberately did NOT decide

`dayWasStudied()` does not read `study_duration_source`. How the 342 historical
NULL-provenance rows should be interpreted is an open founder ruling (G14 item
F). A3 fixes a real interpretation defect **without** forcing that decision,
and the predicate must not quietly answer it later.
