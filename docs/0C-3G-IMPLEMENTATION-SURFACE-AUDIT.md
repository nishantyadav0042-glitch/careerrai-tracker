# 0C.3G — Implementation Surface Audit (read-only)

**18 Aug 2026. AUDIT ONLY. No code, no schema, no migration, no backfill, no
historical repair.**

> The Daily Evidence Contract (`0C-3G-DAILY-EVIDENCE-CONTRACT.md`, `8caae5d`)
> ruled *what* four facts mean. This document asks *what it would cost to make
> that true* — traced fresh against the current tree, not read off the
> contract's own consumer lists, per the standing discipline P0-2's three
> sweeps established: **the prior map can be correct and still incomplete.**

---

# HEADLINE FINDING

**J1 and J6 are semantically identical rulings — "two facts, don't merge them"
— but their implementation cost is not remotely the same.**

`day_outcome` has **6 files** touching it, one real consumer, and — this is
the finding that changes the sequencing — **its derived half never needs
storage at all.** `study_duration` has **30 files** touching it, and its
derived half has been silently *standing in for* the stated half for weeks,
which 30 consumers now depend on without knowing it.

**Recommended sequence: implement J1 and J7/J8 now. J6 needs its own
dedicated gate, shaped like P0-2.3b's ratio-classification gate, before a
single line changes.** J10's answer follows directly from tracing J1's cost,
below.

---

# A/B — `day_outcome`: writers and readers, fresh

| Role | File | Provenance (per contract) |
|---|---|---|
| write | `check-in-gate.tsx:92` | `self_reported_day_outcome` |
| write | `LoggingModal.tsx:163` (Rest toggle) | `self_reported_day_outcome` |
| write | `LoggingModal.tsx:213` (`deriveOutcome()`) | `observed_day_outcome` |
| write | `log-daily/route.ts:200` (fire-and-forget `reviewUpdate`) | forwards whichever of the above the client sent |
| read | `routine/today/route.ts:387,395` → `planReason` | the ONE real consumer |
| doc only | `metric-registry.ts:137` | no logic |

**Identical to the 0C.3G audit's map — zero drift since `8caae5d`, confirmed
by grep, not assumed.**

## C — how `deriveOutcome()` interacts with the two-fact model

It doesn't yet — it still writes into the single `day_outcome` column, which
is exactly the violation the contract names. The fix is narrow: change what
`deriveOutcome()`'s output is *labelled as* when sent, not what it computes.

## The finding that resolves J10 for this fact: `observed_day_outcome` never needs to be stored

`DailyTrackerApp.tsx:244-255` — the same submission that calls `deriveOutcome()`
client-side **also POSTs every ticked task individually to
`/api/routine/complete-task`**, one request per task ("Integrated flow: the
ticked plan topics become plan completions… one action, consistent
everywhere"). So the exact tick data `deriveOutcome()` reasons about
client-side **also lands, independently, in `routine_task_completions`** —
the same table P0-2's `countsAsFullyDone`/`fullyDoneTaskIds` already knows how
to read.

**`observed_day_outcome` for any date is therefore a pure function of
`routine_task_completions` + `daily_routines` for that date** — a
`DERIVED_FACT` in the Fact Registry's existing sense, computed fresh on read,
using the authority that already exists. It requires **no new column and no
new table.**

**One honest caveat, not glossed over.** 0C.3F1's attack A1 warned that a
non-persisted derived value can't answer *"why did CareerRai say X in
August?"* if the underlying data moves. `routine_task_completions` rows for a
closed day are not rewritten in practice (nobody retroactively ticks
yesterday), so the *data* is stable — but the *rule* (what counts as
"studied" from a set of ticks) could still change under a future ruling, and a
recomputed `observed_day_outcome` would then silently reinterpret history.
This is a smaller, more specific risk than A1's original framing, and it is
named here rather than assumed away.

---

# D/E — `study_duration`: writers and readers, fresh

**30 files**, more than triple `day_outcome`'s and `topics_covered`'s
combined. Full list, for the record: `admin/buddies/roster`,
`admin/leads/[id]`, `admin/students`, `api/chat/draft`,
`api/cron/check-red-flags`, `api/cron/weekly-digest`,
`api/cron/weekly-plan-reconcile`, `api/feedback-draft`, `api/logging/log-daily`,
`api/routine/complete-task`, `api/routine/today`, `api/weekly-signal`,
`buddy/trends`, `student/debug`, `student/profile/history-section`,
`student/tracker`, `buddy/cockpit`, `analytics.ts`, `buddy-briefing.ts`,
`buddy-case-data.ts`, `capacity-engine.ts`, `lis-health.ts`, `mentor-doors.ts`,
`os/peer-cohort-data.ts`, `plan-extension.ts`, `prep-gain.ts`, `student-360.ts`,
`student-dna.ts`, `study-credit.ts`, `weekly-diagnosis.ts`.

## H — `complete-task` mixes earned and stated duration, precisely

```ts
const earned = creditedHours({ generatedHours, plannedTasks: tasks.length, fullDone, halfDone, offPlanCount: 0 });
const mergedHours = Math.max(earned, existingLog?.study_duration ?? 0);
```
`offPlanCount` is **hard-coded to `0` at this, its only call site** —
confirmed by repository-wide grep, not one other producer of that parameter
exists. So `credited_study_duration`, exactly like `observed_day_outcome`, is
**already a pure function of persisted data**: `daily_routines.generated_hours`,
`daily_routines.tasks.length`, and `routine_task_completions.confidence` for
the day. **No new storage needed for the derived half here either.**

## The asymmetry J10 turns on

For `day_outcome`, the derived writer (`deriveOutcome()`) is *one of three*
writers into a column with *one* real reader. Stopping it from writing costs
almost nothing.

For `study_duration`, `complete-task`'s `mergedHours` **is the only value
that exists on a tick-only day** — a day with ticks but no typed hours, which
this project's own evidence (0C-3D/E/F1) has repeatedly shown is common.
**Thirty consumers currently read `study_duration` trusting it already means
"however many hours this day is worth, however we know that."** If the
derived write is simply removed to "purify" the column into
`self_reported_study_duration` only, every one of those thirty would go dark
on every tick-only day — not a relabelling, a real regression, and the exact
shape of harm this whole project exists to prevent.

**This is not a reason to abandon J6.** It is the reason J6 cannot be done as
a side effect of implementing J1. It needs its own gate: a consumer-by-consumer
classification of all 30 files — which ones need "the day's total hours,
however sourced" (and should therefore read `max(self_reported,
credited)` or an explicit merge, clearly labelled as a *derived summary*, not
either fact alone) versus which ones specifically need one fact or the other.
**This is the same shape of work P0-2.3b did for the plan-completion ratio**,
at roughly 6x the file count.

---

# F — `topics_covered`: writers and readers, fresh

**11 files**, unchanged from the contract's map. All 11 readers are
vocabulary-blind by construction (they flatten/count/filter strings without
caring which vocabulary produced them), so **none would break under J7's
tightened vocabulary** — several (`weekly-diagnosis.ts`) already assume
section names and would only become *more* correct.

## I — `log-daily`'s shrink violation, exact line

```sql
-- 20260812_log_daily_hours_accept_decimals.sql:73
UPDATE public.daily_reports SET
  ...
  topics_covered    = p_topics_covered,
```

Unconditional replace, confirmed at the SQL level. `complete-task` already
does the correct thing (`[...new Set([...existing, ...routineSections])]`,
line 244) before calling the same RPC — so **the fix is not new logic, it is
making `log-daily` do what `complete-task` already does**, either by fetching
and merging before the call (a pure application-code change) or by changing
the RPC's own `UPDATE` to union arrays (a stored-procedure change, which is a
migration file, not a table-schema change — named precisely so "no migration"
is honoured literally, not just in spirit).

---

# G — J10, answered

> *"What is the evidence model's shape, now that J1 and J6 are ruled?"*

**Simpler than any of 0C.3F1's three proposed shapes (O1 per-field source
column / O2 provenance JSON / O3 separate event table).** For the two derived
facts traced here, **the Fact Registry's own architecture already is the
provenance mechanism** — a fact's `canonicalSource` field states which table
answers it. `self_reported_day_outcome` declares a source reading
`daily_reports.day_outcome`; `observed_day_outcome` declares a source reading
`routine_task_completions` + `daily_routines`. **Two fact keys, two
`canonicalSource` values, zero new columns.** The provenance ambiguity O1 was
designed to solve — one column, unclear which kind of write last touched it —
structurally cannot recur once the derived reader stops sharing the stated
writer's column.

**This does not fully answer J10 for `study_duration`.** Until the 30-consumer
classification happens, it is not yet known whether `credited_study_duration`
needs its own storage (because some consumer needs the day's committed,
point-in-time credited value even after later ticks would recompute it
differently) or can also be purely derived like `observed_day_outcome`. **Open,
correctly, pending the J6 gate.**

---

# J — Schema/storage vs. pure code, classified

| Change | Needs schema? | Needs migration file? | Needs neither? |
|---|---|---|---|
| `deriveOutcome()` stops writing `day_outcome` | — | — | ✅ pure code |
| Register `observed_day_outcome` as a Fact Registry `DERIVED_FACT` | — | — | ✅ pure code, additive |
| `log-daily` no-shrinks `topics_covered` (route-level merge) | — | — | ✅ pure code |
| `log-daily` no-shrinks `topics_covered` (RPC-level union) | — | ⚠️ redefines the stored procedure | — |
| Constrain `topics_covered` writes to the 5-item vocabulary | — | — | ✅ pure code (a validation guard) |
| Register `credited_study_duration` as an *additive* new fact, `study_duration` unchanged | — | — | ✅ pure code, additive, zero consumer risk |
| Narrow `study_duration` itself to mean self-reported only | — | possibly, depending on the J6 gate's answer | blocked on that gate |

**Nothing on the left two columns is proposed for this gate.** Everything
that is safe to do requires neither.

---

# K — Is J12 independently shippable?

**Yes, confirmed, unchanged from prior audits.** Both `advanceCoverage` call
sites (`complete-task/route.ts:119,170`) are `await`ed with no propagation of
`console.error`'d failures to the response. Fixing this touches only the
coverage-advance error path; it shares no file, no table and no ruling with
J1/J6/J7/J8. Nothing found in this sweep changes that assessment.

---

# L — SMALLEST SAFE IMPLEMENTATION SEQUENCE

| Gate | Scope | Blocked by | Consumer risk |
|---|---|---|---|
| **G1** | J1 — `deriveOutcome()` stops writing `day_outcome`; register `observed_day_outcome` | nothing | ~6 files, 1 real consumer, traced in full above |
| **G2** | J7 + J8 — vocabulary guard + no-shrink merge on `topics_covered` | nothing | 11 files, all vocabulary-blind, none at risk |
| **G3** | J12 — surface a failed coverage advance | nothing | isolated, single file |
| **G4** | J6 — the 30-consumer classification for `study_duration`, THEN implementation | nothing, but is real work, comparable in size to P0-2.3b | **must not be attempted as part of G1** |
| **G5** | J10's remaining half (storage shape for `credited_study_duration`) | **G4's classification** | depends entirely on what G4 finds |

**G1, G2 and G3 are independent of each other and of G4/G5.** None require a
ruling not already locked. None require schema or migration. Each is a
single-purpose gate in the style this project has used throughout — failing
tests first, fresh production verification, full suite, one commit.

**G4 is not smaller than it looks.** It is thirty files, not six, and — per
the finding in Part H — a naive removal of `complete-task`'s derived write
would regress every tick-only-day consumer. It needs the same rigor P0-2.3b
gave the plan-completion ratio: read every one of the 30, classify what
question each is actually asking, and only then decide what changes.

---

**STOP.** No code. No schema. No migration. No backfill. No historical
repair. This document maps cost; it authorises nothing.
