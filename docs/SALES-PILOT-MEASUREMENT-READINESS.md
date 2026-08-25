# Sales Pilot — Measurement Readiness

**24 Aug 2026 · Read-only verification. No writes, no code.**

Before the two-week manual pilot begins, this confirms that the four questions
the capacity numbers depend on are **actually recordable** by the system as it
stands. The failure this prevents is the expensive one: running a pilot for two
weeks and discovering the evidence was never captured.

Every query below was executed against production. All return 0 today because
`lead_outreach`, `sales_activity` and `sales_followup` have never held a row —
that is the expected pre-pilot baseline. **The purpose was to prove the query
shapes run against real columns, and they do.**

---

## The four required measurements — all confirmed recordable

| # | Question | Source | Status |
|---|---|---|---|
| 1 | Follow-ups **created and completed**, per rep per day | `sales_followup` (`owner_id`, `created_at`, `status`, `completed_at`) | ✅ recordable |
| 2 | Students actually **worked** per rep per day | `sales_activity` (`actor_id`, `student_id`, `created_at`) | ✅ recordable |
| 3 | Contact → **next-day study return** | first `sales_activity` per (rep, student) vs `daily_reports.report_date` + 1 (IST) | ✅ recordable |
| 4 | Dormant students: genuinely fine vs **quietly abandoned** | `lead_outreach.status` + `daily_reports` + `classifyWorkItem` | ✅ recordable |

## Correction to an earlier statement: claim time IS recoverable

I previously said "new leads taken today" is not instrumented during the pilot,
because `lead_outreach.assigned_at` does not exist until 2B-2. **That is true of
the live panel number, but not of the pilot's evidence.**

In the manual flow, a rep claims a lead *through* `/api/sales/log`, which writes
a `sales_activity` row in the same request. So:

```sql
-- when a rep took a student on = their FIRST activity on that student
select actor_id, student_id, min(created_at) as claimed_at
from sales_activity where actor_id is not null group by 1, 2
```

**So the pilot can measure new-leads-per-day per rep after all**, from data the
existing manual flow already records. The `assigned_at` column in 2B-2 makes it
a live number rather than a derived one; it is not needed for evidence.

This matters because "how many new students can a rep absorb in a day" is one
of the two numbers the capacity ceilings must be set from.

## What is still NOT measurable, and must not be faked

- **Whether a call actually happened.** Every rep-logged row is
  `provenance:'self_reported'`; no telephony exists. The pilot measures what
  reps *report* plus what students *do*. The second is the honest check on the
  first — a rep whose reported calls never precede a return to the app is
  visible without accusing anyone of anything.
- **Time-to-first-contact SLA.** Nothing sets a due time in this phase, so SLA
  breach counts will be absent, not zero. 2B-2 adds it.
- **Anything about the 396 students nobody can reach.** With ~70 units of team
  capacity against 466 eligible students, most of the pool is untouched by
  construction. Their outcomes are a *control group*, not a rep failure — and
  reading them as either would be wrong.

## The one thing to check on pilot day 1

Open `/admin/sales/capacity` after the first lead is claimed and confirm the
rep's "active work" shows **1, not 0**. That single check catches the class of
defect found on 24 Aug (a broken read rendering as a confident zero) before it
can silently corrupt two weeks of evidence.

---

**Status: the pilot is measurable. Awaiting founder decisions on rep identities
and capacity numbers before configuration.**
