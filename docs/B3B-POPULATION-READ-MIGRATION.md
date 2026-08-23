# B3b — population-scaled reads that can mutate student state

**Started 23 Aug 2026, immediately after Phase D closed.** Gate 1 is shipped and
enforcing; the migration itself is next.

---

## The target list is evidence-derived, and smaller than "55"

The Phase A sweep counted **56 unbounded, population-growing batch queries**
across the whole repository. That number includes read-only admin surfaces,
which are a performance concern rather than a truth-safety one.

A fresh scan against current `main` separates them:

| | Files |
|---|---|
| Files doing a population `.in(...ids)` read | **32** |
| …of which are **mutation-capable** (can change student-facing state) | **13** |
| …of which are already bounded (`readRowsForIds`) | **1** — `weekly-plan-reconcile`, migrated in B2 |

**13 is the B3b target set.** The other 19 are real and worth bounding, but a
failed read there produces a wrong number on an admin page, not a moved syllabus
date. They are Phase 2 of this work, not Phase 1.

### The 13

| Path | `.in()` reads | How it mutates |
|---|---|---|
| `api/cron/decision-engine` | 6 | via helper (dispatch) |
| `api/cron/study-companion` | 4 | via helper (dispatch) — 7 separate push gates |
| `api/cron/buddy-brief` | 3 | via helper |
| `api/cron/daily-reminder` | 3 | via helper (dispatch + email) |
| `api/cron/check-red-flags` | 2 | **direct write** + buddy notification |
| `api/cron/expire-subscriptions` | 2 | **direct write** |
| `api/cron/sales-ready` | 2 | **direct write** (CRM state) |
| `api/cron/onboarding-morning` | 2 | via helper |
| `api/admin/expedify-followups` | 1 | **direct write** |
| `api/cron/founder-alerts` | 1 | **direct write** |
| `api/cron/weekly-digest` | 1 | direct write + email |
| `api/cron/builder-recovery` | 1 | via helper |
| `api/cron/nishant-weekly` | 1 | via helper |

**A push notification is student-facing state.** The first version of my scan
found only 6 of these, because `daily-reminder` and `study-companion` contain no
write verb of their own — they call `dispatch()`. Both can notify the entire
cohort off a single unchecked read. Detection now covers helper-mediated
mutation, and the guard does too.

## The required shape

```
population
    ↓
bounded / chunked read          readRowsForIds — size bounded by CHUNK, not by cohort
    ↓
VALUE | NO_DATA | UNAVAILABLE   Source<T> — three irreducible states
    ↓
decision
    ↓
mutation gate                   gateOnSource — validity is an ARGUMENT of the decision
```

Never:

```
UNAVAILABLE → [] → 0 → "student did nothing" → mutation
```

## Acceptance gates (founder, 23 Aug)

| # | Gate | Status |
|---|---|---|
| 1 | No unbounded population `.in(...ids)` in mutation-capable paths | **SHIPPED** — `src/lib/truth/population-read.guard.test.ts`, 5 checks green, baseline of 13 that may only shrink |
| 2 | Every chunked read distinguishes empty from failed/incomplete | `Source<T>` already enforces; per-call-site as each migrates |
| 3 | One failed chunk invalidates the aggregate unless partial data is explicitly designed for | `readRowsForIds` already all-or-nothing |
| 4 | Source validity reaches the mutation boundary as a typed value | `gateOnSource`; per-call-site |
| 5 | No `catch → []`, `catch → 0`, `\|\| 0` turning unavailable into a decision | needs its own guard — **not yet written** |
| 6 | Every mutation-capable cron has a test proving: source failure → zero mutation | **not yet written** — one per cron |
| 7 | Regression test at 656+ students and a substantially larger synthetic population | partially exists (`truth/batch` tested at 656/1,000/5,000/50,000); needs per-cron coverage |
| 8 | Do not claim the 24 KB PostgREST hypothesis as fact | **honoured** — recorded as bracketed (~19.3 KB worked, ~33.3 KB failed), not proven, in the guard's own header |
| 9 | Keep the Sunday boundary decision separate from the mechanical migration | **honoured** — ruling recorded in `INVARIANT-RECONCILIATION-EVIDENCE.md`, not implemented here |
| 10 | Re-scan after migration and prove the count actually fell | **built into gate 1** — the baseline test fails if a migrated file is left listed, so the number cannot be gamed by moving code into a helper |

## Why gate 1 pins the shape, not the byte count

A guard written against a request-size threshold would encode a number nobody
has measured. The mechanism is **bracketed, not proven**: ~19.3 KB of ids worked
on 16 Aug, ~33.3 KB failed on 23 Aug. Proving it needs a PostgREST `GET` with a
growing `in()` list until it errors, which needs an API key not held in that
session.

More importantly, a byte-count guard would miss the next transport that fails at
a different limit. What is actually dangerous is the **shape**: a request that
grows with the student base, feeding a path that can change student state. That
is what gate 1 detects, and it is why the failure being a *step change* —
263 fine, 428 fine, 739 total failure, nothing in between — makes a guard the
only real defence. There was no gradual signal to watch.

## Test-discovery audit — the `vitest.config.ts` widening

Required before continuing, because the first route test reported **"No test
files found"** — a silent tooling failure of exactly the kind this workstream
exists to remove from production code. Widening the include is only safe if the
resulting test universe is measured rather than assumed.

Measured by running the **previous config from git** against the current tree,
then the current config, and diffing:

| | Test files | Tests |
|---|---|---|
| Before — `include: ['src/lib/**/*.test.ts']` | 261 passed + 1 skipped = **262** | **2,932** passed + 1 skipped |
| After — `+ 'src/app/api/**/*.test.ts'` | 262 passed + 1 skipped = **263** | **2,942** passed + 1 skipped |
| **Delta** | **+1 file** | **+10 tests** |

The delta is exactly `check-red-flags/mutation-safety.test.ts` and its 10 cases.
**Nothing was lost**: no file discovered under the old pattern is missing under
the new one.

**Intentionally excluded, still excluded:** `src/app/student/today/form.test.ts`
— a pre-existing `console.log` script that tests a local copy of some form logic
rather than production code, and executes on import. Verified NOT discovered.

**Proof the new API-route tests actually execute** (not merely matched): the
+10 test delta is precisely the 10 cases in that file, and the file appears in
`vitest list`. A pattern that matched but did not run would show +1 file and +0
tests.

**A measurement error worth recording.** My first attempt at this audit used
`vitest list --include 'src/lib/**/*.test.ts'` for the "before" number. That CLI
flag returned **zero** files, which made the diff report all 262 pre-existing
files as newly discovered — i.e. it looked like the widening had transformed the
whole test universe. It had not; the flag simply did not apply. The table above
comes from running the actual previous config file, which is the only
measurement that answers the question.

## Order of migration

Highest blast radius first, measured by what a failed read would do:

1. **`check-red-flags`** — direct write plus a buddy notification, and it already
   reads `daily_reports` for the whole cohort on the same shape as the incident.
2. **`study-companion`** — 7 push gates, whole cohort. A failed read makes every
   student look inactive.
3. **`daily-reminder`** / **`onboarding-morning`** — activation ladder; a failed
   read mis-stages every student in the 7-day arc.
4. **`decision-engine`** — 6 population reads, the most of any single path.
5. **`weekly-digest`**, **`buddy-brief`**, **`nishant-weekly`**, **`builder-recovery`**.
6. **`expire-subscriptions`**, **`sales-ready`**, **`founder-alerts`**,
   **`expedify-followups`** — money and CRM state; smaller student blast radius
   but the writes are not reversible in the way a date is.

## Explicitly NOT in this phase

The Sunday weekly-window boundary (ruled, not implemented), Wave 2 coverage,
`ceil()` rounding, null provenance, `landed`, and the 19 read-only population
reads.
