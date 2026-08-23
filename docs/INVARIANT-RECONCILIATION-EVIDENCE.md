# Invariant — automated reconciliation may not mutate on incomplete evidence

**Status:** Founder ruling, 23 Aug 2026. Binding. Sits alongside the
Constitutions; nothing below is advisory.

---

## The rule

> **A scheduled reconciliation must never mutate student-facing plan state
> unless every source read required for that decision succeeds and is complete.**

And its corollary, which is the part that was actually violated:

> **A failed source read is `UNAVAILABLE`. It is not `VALUE(0)`.**

Automated reconciliation may **calculate** and **propose** state changes freely.
It may **commit** one only when the evidence the decision rests on is valid and
complete.

## The shape

```
        SOURCE READ
             │
        ┌────┴────┐
     VALID?    
   ┌────┴────┐
  NO         YES
   │          │
 STOP     CALCULATE
 (skip,       │
  record   MUTATION
  why)
```

Never:

```
   READ FAILED
        │
    default = 0
        │
  student punished
```

## What this cost, in the incident that produced the rule

On 23 Aug 2026 `weekly-plan-reconcile` read `daily_reports` for all 739
students in one request. The request returned nothing usable. The code
destructured `data` without checking `error`, `?? []` turned that into an empty
week for everyone, and the job:

- wrote **655 `plan_extensions` rows**, every one recording `actual_hours = 0.00`
- moved **3,690 days** of syllabus target dates
- returned **`{"ok": true, "warned": 655}`** with no `fatal_error`

**57 of those students had studied 277.9 hours that week.** They were told they
had studied nothing, and their finish dates moved.

The remaining 598 may well have studied nothing — but the job did not know that
and never asked successfully. Their extensions are right by luck. **Luck is not
evidence, and this rule exists because the two are indistinguishable after the
fact.**

## Why "it reported success" is the heart of it

The failure was not that a query broke. Queries break. The failure is that a
broken query and an empty result were **the same value** in the code, so:

- no reviewer's eye caught `?? []` — it is the natural thing to write;
- the job's own telemetry said `ok: true`;
- the damage was only visible three weeks later, in the mutations themselves.

Hence the operational corollary: **classify a scheduled job by what it wrote,
not by what it returned.** By HTTP status the 23 Aug run was SUCCESS. By its
mutations it was PARTIAL-DEGRADED. Only the second classification is true.

## What already enforces this

| Mechanism | Where | Covers |
|---|---|---|
| `Source<T>` — VALUE / NO_DATA / UNAVAILABLE, no default-value escape hatch | `src/lib/truth/source.ts` | makes the three states irreducible |
| `readRowsForIds` — request size bounded by chunk, all-or-nothing across chunks | `src/lib/truth/batch.ts` | population-scaled reads |
| `gateOnSource` — source validity as a required argument of the decision | `src/lib/truth/mutation-gate.ts` | the mutation itself |
| Fail-closed reconciliation: 503 `skipped: source_unavailable`, no deficit, no extension, no date moved | `api/cron/weekly-plan-reconcile` | the site of the incident |
| Producer-level refusal: an out-of-window row yields UNKNOWN + a violation, never a trimmed count | `src/lib/facts/daily-log.ts` | 0C.3 facts |

## What does NOT yet enforce it

**This invariant currently holds at one call site.** The Phase A sweep found
**56 unbounded, population-growing batch queries**. `weekly-plan-reconcile` was
one of them, and it is the only one migrated. The other 55 have the same shape
and the same failure mode waiting at the same kind of threshold — they simply
have not crossed theirs yet.

That is B3b, and this incident is its evidence. The discovery here is not "we
fixed a cron". It is:

> **A class of population-scaled reads exists that can silently mutate student
> state, and its failure arrives as a step change when the cohort crosses a
> threshold nobody measured.**

263 students: fine. 428 students: fine. 739 students: total failure. Nothing
warned in between.

## The open product question this does not settle

Should a scheduled job move a student's syllabus date **at all**, with no human
in the loop, even when every read succeeds?

598 students were told their plan slipped by a cron. This invariant makes the
mutation *evidence-gated*; it does not make it *reviewed*. That remains open.
