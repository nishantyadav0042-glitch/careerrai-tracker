# Business capability integrity

**The unit of truth is the business object, not the file.**

"Study Log" touches 19 files, 8 APIs and 3 cron jobs. It is still *one*
capability, with one owner, one invariant set and one reconciliation report.
Repository coverage is a supporting metric; **capability integrity is the
outcome that decides whether CareerRai can safely scale.**

That distinction is not cosmetic. Chasing 331 files produced 3% verified in two
days. Chasing 12 capabilities produced 32 executable invariants — 26 of them
Tier 0 — in one evening, and those invariants cover every file that writes
those objects, including files written next year by people who never read this.

---

## Tiers

| Tier | Meaning | If it is wrong |
|---|---|---|
| **0** | The company's record of reality is wrong | Wake someone up |
| **1** | A feature is wrong | Fix this week |
| **2** | A screen is wrong | Fix when convenient |

A dashboard bug lies. **A database writer changes the truth forever** — every
dashboard built on it afterwards is mathematically wrong, however carefully it
is written. That asymmetry is why Tier 0 is defined by *what writes*, not by
what displays.

---

## The capabilities

| Capability | Tier | Owning tables | Invariants |
|---|---|---|---|
| Student identity | 0 | `profiles`, `auth.users` | 3 |
| Push subscription | 0 | `profiles.push_*` | 3 |
| Notification delivery | 0 | `notifications` | 4 |
| Study log | 0 | `daily_reports` | 4 |
| Streak | 0 | `streak_data` ← `daily_reports` | 5 |
| Payment | 0 | `student_payments` | 5 |
| Subscription | 0 | `profiles.is_premium` ← `student_payments` | 1 |
| Onboarding | 0 | `profiles` onboarding fields | 1 |
| Daily plan | 1 | `daily_routines` | 2 |
| Mentorship | 1 | `profiles.buddy_id`, sessions | 1 |
| Peer learning | 1 | `student_submissions`, `submission_votes` | 3 |

**32 invariants. 26 Tier 0. Currently 0 failing.**

Still unclaimed and therefore un-owned: **referral**, **swap/repeat**,
**account deletion**, **calendar/meetings**, **CRM (Expedify)**. These are the
47 files the coverage audit found matching no feature. A capability nobody has
named is a capability nobody tests.

---

## Running it

```sql
select * from business_invariants() where violations > 0;
```

Nightly at **03:15 IST** via `/api/cron/integrity-check` — just after the study
day rolls over, so a full day of writes has settled. A Tier-0 violation alerts;
**nothing is auto-repaired.** Automatic repair of business data is how a small
bug becomes a large one overnight.

---

## What the first production run found

Two failures, and **both were defects in the check, not in the data.** That is
the correct outcome for day one of an invariant suite, and it is recorded here
rather than quietly edited away:

**1. "last_log_date matches the newest actual log" — 3 real students.**
All three had `restored_dates` that exactly bridged the gap. A manual streak
restore is *designed* to move `last_log_date` past the newest log — that is the
entire feature. The invariant now accepts a restored day.

**2. "no death without a birth since 21 Jul" — 4 students.**
All four died **on 21 July**, the changeover day itself, between 02:30 and
14:31 UTC — the tail of the old regime, not new cases. Zero since. The boundary
is 22 July.

The lesson worth keeping: an invariant that fires is a hypothesis, not a
verdict. Investigate before you believe it, and especially before you change
production data because of it.

---

## The architecture ratchet

From here, **no feature merges without its integrity contract.** A pull request
that adds or changes a business capability must include:

1. **Events** — the user actions it emits, registered in `journey.ts`
2. **Metric definitions** — entries in `lib/metric-registry.ts`, one owner each
3. **Invariants** — statements added to `business_invariants()`
4. **Tests** — unit tests over the pure logic
5. **Dashboard** — where a human sees it, or an explicit note that nobody does

Enforced by `npm run verify` (registry tests), the nightly integrity cron, and
`scripts/coverage-audit.mjs` — which must never go backwards.

This is the part that decides whether we are in the same position in six
months. Everything above is a snapshot; this is the mechanism.
