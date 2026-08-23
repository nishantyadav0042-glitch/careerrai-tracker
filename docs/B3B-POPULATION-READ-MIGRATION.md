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
| 6 | Every mutation-capable cron has a test proving: source failure → zero mutation | **9 of 13 done** — `check-red-flags` (10), `study-companion` (23), `daily-reminder` (16), `onboarding-morning` (17), `decision-engine` (29), `weekly-digest` (13), `buddy-brief` (16), `nishant-weekly` (12), `builder-recovery` (13) |
| 7 | Regression test at 656+ students and a substantially larger synthetic population | **9 of 13 done** — each migrated cron asserts both failure and success at 2,000 students, well above the 739 at which production broke |
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

## Migrated so far — read → decision → side effect

The enumeration matters more than the chunking. "The read is chunked, so it is
safe" is exactly the claim that misses a partial read becoming a student-facing
statement.

| # | Path | Read → derived decision → side effect | What a failed read did before |
|---|---|---|---|
| 1 | `check-red-flags` | `daily_reports` → `reports.length < 4` → in-app alert + **email to the mentor** | Every mentor told every student had "gone quiet". Dedup read also failed OPEN, so a broken query produced a **duplicate** alert |
| 2 | `study-companion` | `daily_reports`/`streak_data`/`topic_coverage` → copy + eligibility → **push**; `notifications` → "already messaged today?" | An unavailable dedup read left `alreadySent` empty → **re-push the whole cohort** |
| 3 | `daily-reminder` | `daily_reports(today)` → "logged today?"; `daily_reports(all)` → `size 0` = never logged → **which ladder**; `notifications` → duplicate | Already chunked, but each chunk ended `.data ?? []`, so **one failed chunk shrank a flattened aggregate** and the walk continued believing it was complete |
| 4 | `onboarding-morning` | `daily_reports` → `loggedDays.size`, which gates the send **and becomes `dayNumber = size + 1`** | Not merely under-sending: **telling a student they are on day 2 of their arc when they are on day 5.** An infrastructure failure rendered as a student-facing claim |

| 5 | `decision-engine` | `streak_data` → `daysSinceLastLog` → `computeStudentState`; `topic_coverage` → revision/earned; `daily_routines`×2 → mission_changed; `notifications` → dedup | **Silent total suppression reported as a normal day.** The detectors fail closed by construction, so nothing false was claimed — but a dead `streak_data` read made every student `plan_ready`, and the run answered `{ notified: 0, ownedElsewhere: everyone }`, byte-identical to a genuinely quiet cohort. The dedup read is the exception: unavailable → empty set → the Phase 11 duplicate-send bug, reachable again by a dead query |

| 6 | `weekly-digest` | `daily_reports` → `computeSummary()` → **score + band + redFlags per NAMED student** → in-app row **and EMAIL to the mentor** | The strongest false-claim case in the migration. Every student got `reps = []`, and computeSummary on an empty week yields a bottom-band score plus "Fewer than 4 reports". The mentor was emailed `Priya: 25/100 (Needs intervention) • Arjun: 25/100 …` for their whole roster — **numeric scores about named students, delivered outside the product where they cannot be corrected** |
| 7 | `buddy-brief` | `daily_reports` → `loggedYesterday` (**a count**) and `atRisk` (**names**) → `buddyBriefCopy(...)` | `reportDates` empty → "0 of 7 logged yesterday — at risk: Priya, Arjun, …" about a roster that may have logged perfectly |
| 8 | `nishant-weekly` | `notifications` → `alreadyPinged` → 6-day dedup | Empty set → the founder ping re-sent to the **entire cohort** inside its own dedup window. No numeric claim; the damage is pure repetition, which on a personal-voice message is its own kind of untruth |
| 9 | `builder-recovery` | `profiles` → open drops; `notifications` → `sentSinceAnchor` (**a count**) → ladder position | Both directions in one file: a dead roster read produced `{ sent: 0, reason: 'no_open_drops' }` (the `decision-engine` shape), and a dead ladder read put **every** open drop back at the bottom rung |

Rows 6 and 7 are the ones that turn a read failure into a *statement about a
named person*. `check-red-flags` said a student had gone quiet; these two
attach a **number** to that student and, in the digest's case, send it by
email. Chunking alone would have left both intact.

Row 9 records a distinction the migration deliberately preserved:
`onboarding_step_reached ?? 0` is left alone, because that is a NULL COLUMN on
a row that was read successfully — not an unavailable source. Conflating the
two is the confusion this workstream exists to remove, and a migration that
"fixed" it would have been widening scope while claiming to narrow it.

Row 5 is worth stating precisely rather than dramatising: `decision-engine`
was the *least* dangerous of the five, because `detectMissionChanged` needs
both sides non-null, `detectRecovery(null)` is null, and a null
`daysSinceLastLog` maps to `plan_ready` which the route skips. It still
violated the invariant — an infrastructure failure was indistinguishable from
business state — but it did so by going quiet, not by making a false claim.
Six population reads, no additional offenders found beyond them; the seventh
`.in()` in that file is a literal enum type-list and is correctly not
population-scaled.

Row 4 is the case that justifies enumerating side effects rather than auditing
reads. Chunking `daily_reports` would have looked sufficient; only tracing the
value to where it is *rendered* shows that the number in the message is derived
from a read that could be partial.

Row 3 is the case that shows chunking alone is not safety. `daily-reminder`
carried a correct comment about the PostgREST request-line limit and chunked
accordingly — and was still unsafe, in a way that is harder to see than no
chunking at all, because a partial aggregate looks like a complete one.

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
