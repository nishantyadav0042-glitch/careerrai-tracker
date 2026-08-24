# Invariant — automated reconciliation may not mutate on incomplete evidence

**Status:** Founder ruling, 23 Aug 2026. Binding. Sits alongside the
Constitutions; nothing below is advisory.

---

## The rule

> **A scheduled reconciliation must never mutate student-facing plan state
> unless every source read required for that decision succeeds and is complete.**

And its corollary, which is the part that was actually violated:

> **A failed source read is `UNAVAILABLE`. It is not `VALUE(0)`.**

## The general form — permanent CareerRai engineering invariant

Founder ruling, 23 Aug: this is not a B3b task requirement, it is permanent.

> **Source validity must travel auditably all the way to the mutation boundary.**
>
> **A system must never convert "I don't know" into "zero" when zero causes a
> student-state mutation.**

"The query didn't throw" is not source validity. A mutation-capable path must be
able to answer, after the fact: *what data did you use, was it complete, which
fact produced the decision, and which mutation did it cause?*

The generality is the point. The lesson of this incident is **not** "don't send
739 UUIDs in one request" — that is the mechanism, and the next incident will
have a different one. The rule above holds whatever the infrastructure failure
turns out to be.

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

## "No side effect occurred" is NOT evidence of safety — founder ruling, 23 Aug

`decision-engine` established this, and it belongs in the permanent rationale
rather than in one migration's notes.

A path can be **fail-closed at the detector level and still violate the
invariant**, because `UNAVAILABLE` can collapse into a legitimate-looking
business outcome instead of into a wrong action.

Both directions were present in the same file:

| Read | Failure | Result |
|---|---|---|
| `streak_data` | unavailable → every `daysSinceLastLog` null → every student `plan_ready` → skipped as owned elsewhere | `{ notified: 0, ownedElsewhere: everyone }` — **byte-identical to a genuinely quiet run** |
| `notifications` (dedup) | unavailable → empty set → "nothing sent today" | **duplicate notifications** |

The first produced no side effect at all. It was still a violation: the entire
cohort was silently suppressed and the run reported a normal day. A reviewer
checking "did anything wrong get written?" would have passed it.

So the test for a mutation-capable path is not *"did a bad thing happen?"* but:

> **Could an observer tell this run apart from a healthy one?**

A run that silently suppresses the whole cohort is as inconsistent as one that
sends the wrong thing — the damage is to what we can conclude from our own
telemetry, and that damage compounds silently. This is why every migrated cron
answers `503 skipped: source_unavailable` rather than a plausible-looking zero.

## The temporal model — founder ruling, 23 Aug

The incident also exposed that the job judged a week **while that week's Sunday
was still running** (13:30 UTC / 19:00 IST, five hours before the CareerRai day
closes). Apeksha Bhadouriya's 16 Aug extension is the live example: correct when
written, wrong three hours later because she studied that evening.

**The ruling, and the rejected alternative, both matter:**

> **The canonical weekly window closes only after the CareerRai study day closes.
> The reconciliation is then scheduled to run after that boundary.**

REJECTED: *"end the weekly window at the reconciliation boundary."* That would
make the meaning of **a week** depend on infrastructure scheduling — the exact
class of hidden inconsistency this whole workstream exists to remove. A week is
a business fact; when a cron happens to fire is an operational detail. Defining
the first in terms of the second inverts them.

One coherent temporal chain, in this order and no other:

```
study-day boundary  →  weekly window  →  reconciliation
   (05:30 IST)          [Mon … Sun,          runs strictly
                         closed]              after close
```

Not implemented yet. Kept deliberately OUT of the B3b mechanical migration
unless a specific cron's correctness depends on it — mixing a temporal-semantics
change into a read-safety migration would make both harder to verify.

## Student communication — founder ruling, 23 Aug

For the 23 Aug repair: **no student-facing notification.** The repair restored
each student's prior state and requires no action from them; an explanation of an
internal reconciliation failure serves us, not them.

**Internal audit record: yes.** The 635 affected student IDs, their removed bad
date, restored date and days are held in a private artifact so support can answer
"why did my target date change?" with the actual trail. Not committed — this
repository is public.

## The open product question this does not settle

Should a scheduled job move a student's syllabus date **at all**, with no human
in the loop, even when every read succeeds?

598 students had their plan moved by a cron on this run alone. This invariant
makes the mutation *evidence-gated*; it does not make it *reviewed*. Still open.
