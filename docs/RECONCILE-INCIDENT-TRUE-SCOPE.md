# The reconciliation incident — true scope, and it ran again today

**READ-ONLY investigation. Nothing mutated. Phase D remains frozen — every
number below is evidence for a founder decision, not a repair.**

**Found:** 23 Aug 2026, during the 0C.3 Wave 1 post-deploy verification. I was
checking "no production data was mutated" and found 655 `plan_extensions` rows
written today.

---

## 1. What actually happened

`weekly-plan-reconcile` runs every **Sunday at ~13:30 UTC**. Three runs exist in
`plan_extensions` history, and their correctness degrades with cohort size:

| Week reconciled | Ran at (UTC) | Students penalised | Actually studied | Recorded correctly | **Wrongly zeroed** | Hours erased | Days wrongly added |
|---|---|---|---|---|---|---|---|
| 3–9 Aug | 9 Aug 13:31 | 228 | 2 | 2 | **0** | 0 | 0 |
| 10–16 Aug | 16 Aug 13:30 | 373 | 21 | 20 | **0** *(corrected — see below)* | 0 | 0 |
| **17–23 Aug** | **23 Aug 13:30** | **655** | **57** | **0** | **57** | **277.9** | **284** |

**CORRECTION (same day, after deeper checking — see
`RECONCILE-RECOVERY-CLASSIFICATION.md` §1).** The "1 wrongly zeroed" on 16 Aug
was an artefact of MY comparison, not a defect in that run. I compared the job's
output against the FINAL state of the week; the student in question logged those
6.9 hours at 16:20 UTC, **2h50m after the 13:30 run**. The read was correct.

So the failure is not a gradient — it is a **step change**, and it began exactly
on 23 Aug: 0 failures, 0 failures, then total failure. The correct denominator is
the `.in()` list, which is EVERY student, not those extended: **263 students
(worked), 428 (worked), 739 (failed completely).**

That brackets the request-size hypothesis, previously recorded as **unproven**:
~19.3 KB of ids worked, ~33.3 KB failed. Consistent with the 24 KB figure — and
consistent is all it is. **Not reproduced, not proven.** Proving it needs a
PostgREST GET with a growing `in()` list, which needs an API key I deliberately
do not hold in this session.

## 2. The job reported success

`cron_runs`, today's run:

```
started_at   2026-08-23 13:30:28 UTC
duration_ms  80,391
fatal_error  (none)
result       {"ok": true, "week": {...}, "warned": 655, "results": [...]}
```

**`ok: true`, 655 students warned, 3,690 days added, on a read that returned
nothing for anyone.** This is the exact class the founder asked me to classify
in Task #48 — and the ruling that the DB mutation is decisive rather than the
HTTP status is what makes it classifiable at all. By status it is SUCCESS. By
what it wrote it is **PARTIAL-DEGRADED reported as SUCCESS.**

## 3. The fix missed this run by 69 minutes

| Event | Time (UTC) |
|---|---|
| Weekly reconcile ran, wrote 655 rows | **13:30:28** |
| PR #96 (fail-closed reconciliation) deployed | **~14:39** |
| PR #98 (0C.3 Wave 1) deployed | 15:41 |

B2 was built and shipped today *in response to* this incident, and it landed
about an hour after the weekly job had already run. The 30 Aug run will be the
first one under the fix — which is the release blocker as originally set, met.
Nothing was wrong with the ordering; the job simply fires on Sundays and today
was one.

## 4. What is still reversible

Phase D's invariant: only reverse an extension while the current state proves it
is still the active cause — `profiles.syllabus_target_date` still equals the
row's `new_date`.

| | |
|---|---|
| Today's rows still the active cause | **655 of 655** |
| Days recoverable from today's run | **3,690** |
| Not reversible | **0 from this run.** Apeksha Bhadouriya's **16 Aug** row was previously listed here as damage. It is not: the correction above shows that run read correctly and her extension was valid on the evidence available. There is nothing to reverse. |

This largely confirms the earlier record. The previously logged "57 rows / 56
students / ~282 hours / ~282 days" describes **the harm**, and matches today's
wrongly-zeroed population (57 students, 277.9 h, 284 days) within rounding. Two
things that record got wrong: **655 students had a date moved, not 57**, and the
"1 needing manual review" was not damage at all.

## 5. The decision I am not making

Two defensible positions, and they differ by 598 students:

**(a) Reverse only the 57 provably wrong.** They studied 277.9 hours and were
recorded at zero. Nobody disputes these.

**(b) Reverse all 655.** For the other 598 the outcome *coincides* with what a
correct run would probably have produced — they appear to have logged nothing.
But the job did not know that. It read nothing and treated nothing as zero for
everyone. Under the mandate's own rule — *a data-access failure must never
become a student fact* — all 655 dates were moved on absent evidence, and 598 of
them are right only by luck.

I lean to **(b)**, because (a) keeps 598 date-moves that were decided by a
failed query, and the whole point of this workstream is that "it happened to be
correct" is not the same as "it was known". But this moves real dates for real
students and it is squarely your call.

There is also a third question underneath: **should a student with genuinely
zero logs have their syllabus date moved at all, automatically, with no human in
the loop?** 598 students were told their plan slipped a week by a cron job. That
is a product question, not a correctness one, and I am raising it rather than
answering it.

## 6. What I did NOT do

- **No mutation.** Every query in this investigation was a `SELECT`.
- **No reversal.** Phase D stays frozen until you rule.
- **No notification** to any student or mentor.
- No change to `weekly-plan-reconcile`; the B2 fix already shipped and is live.

## 7. Method

Read-only SQL against `pobhpszlsozeonejtzqy`. "Actually studied" = any
`daily_reports` row in the reconciled week with `study_duration > 0`.
"Wrongly zeroed" = the student studied and the job recorded `actual_hours = 0`.
Reversibility read from `profiles.syllabus_target_date` against each row's
`new_date`. Run timing cross-checked against Vercel deployment timestamps.

**Caveat I want stated:** `study_duration > 0` is itself the metric whose
semantics are unresolved (Wave 5, blockers B1–B7). A student whose day was
logged through the check-in gate carries `study_duration = 0` with provenance
`not_collected` — they studied and the column cannot say so. So **57 is a lower
bound on the wrongly-penalised population, not an exact count.** The 78 students
who had at least one log row that week is the wider bound.
