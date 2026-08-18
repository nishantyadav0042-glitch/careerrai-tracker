# 0C Step 1 — Read-Only Discovery: the canonicalisation inventory

**Date 18 Aug 2026. Status: DISCOVERY COMPLETE. IMPLEMENTATION HALTED PENDING FOUNDER
ARBITRATION.**

Per `docs/PHASE-0-INTEGRITY-SPEC.md` item 0C and the founder's instruction: *"If two
existing calculations disagree, do not silently reconcile them. STOP and surface the
conflict."*

They disagree. Extensively. This document is the inventory.

**Headline: the codebase contains 11 implementations of "syllabus coverage %", 15 of
"logged days", 5 of "section completion rate", 5 of "mocks taken", 4 definitions of
"last 7 days", 3 week-start rules, and 6 formulas for "consistency %".** Two of these
disagreements produce provably wrong output in production today, verified by live query.

---

## VERIFIED-IN-PRODUCTION DEFECTS (not theoretical)

### V1. A percentage that exceeds 100% — **4 students affected today**

`src/lib/prep-memory-data.ts:136-148`:
```ts
const inMotionTopics = new Set(
  (coverageRows ?? []).filter((r) => r.status !== 'not_started').map((r) => r.topic)
).size;                                    // ← numerator counts ALL 53 rows
const totalTopics = Object.keys(TOPIC_METADATA).length;   // ← denominator is 46
knowledge: Math.round((inMotionTopics / totalTopics) * 100),
```

`topic_coverage` holds **53 rows per student** (46 syllabus + 7 habit-track units:
Sectional Tests, Full Length Mocks, Mock Analysis, Error Log, Daily Editorials, Business
& Economy Reading, Long-form Reading). `TOPIC_METADATA` holds **46**. Numerator and
denominator come from different sets. There is no clamp.

**Live query, 18 Aug:** `min_rows = 53, max_rows = 54` across 416 students;
**4 students have numerator > denominator; maximum knowledge value = 111%.**

`studentState.knowledge` feeds `signal-engine`, `/admin/leads/[id]`, the decision engine
and buddy surfaces. This is a Law-5 violation shipping now.

### V2. The database and the app disagree about what day it is, 2.5 hours every night

App authority (`src/lib/study-day.ts:33-34`): rollover **05:30 IST** since 14 Aug.

Production DB default, verified by query on `information_schema`:
```
topic_evidence.logged_for DEFAULT = ((now() AT TIME ZONE 'Asia/Kolkata') - '03:00:00'::interval)::date
```
That is the **03:00 IST** boundary — the pre-14-Aug rule. The migration that set it
(`supabase/migrations/20260725_topic_evidence_day_boundary.sql:20-22`) states in its own
header that it exists to match `getLogDateString()`, and argues *"a safety net that
disagrees with the system it backs is worse than none."* It now disagrees.

**Divergence window: 03:00–05:29 IST.** A direct insert in that window is dated *today*
by the DB and *yesterday* by every app read.

---

## A. Existing implementations discovered (the inventory)

### A.1 "Syllabus coverage %" — **11 implementations, 3 incompatible bases**

| Basis | Implementations | Example |
|---|---|---|
| **Topic count** | `tracker/page.tsx:168` (Home ring), `student-brief.ts:85` (sales), `sales-conversion.ts:85` | `(46 − remaining)/46` |
| **Weightage sum** | `prep-insight-engine.ts:447-448` (per-section), `:673-676` (whole) | `Σweight(covered)/Σweight(all)` — prints *"VARC 62% covered"* next to a count-based number |
| **Hours** | `study-pace.ts:160`, `full-plan.ts:381`, `buddy-case-data.ts:68`, `evidence.ts:339` | `(397h − remaining)/397h` |
| **Opened (lower bar)** | `log-insight.ts:122`, `:138` (mine, 17 Aug) | `opened/total`, `isOpened` not `isCovered` |

Within the hours family, three mutually exclusive choices about effort-scaling:
- `study-pace.ts:159-160` — denominator **unscaled** (397h), numerator **scaled** by the
  repeater effort multiplier. **A repeater at 90th percentile who has studied nothing
  reads ~45% complete on day zero.**
- `full-plan.ts:381` — denominator **scaled**. Opposite choice.
- `buddy-case-data.ts:68-70` — effort forced to 1 on both sides so it cancels; its
  comment claims parity with the Home ring, which is **false** (Home is count-based).

### A.2 The syllabus total itself — **5 competing numbers**

| Constant | Value | Contents | Where |
|---|---|---|---|
| `KNOWLEDGE_GRAPH` flattened | **53** | 46 syllabus + 7 habit | `topics-constants.ts:68` |
| `TOPIC_METADATA` keys | **46** | syllabus only | `topics-constants.ts:149` |
| `EXAM_UNIT_COUNT` | **46** | hardcoded literal | `blueprint-builder.ts:120` |
| `ONBOARDING_CORE_GRAPH` | **45** | QA=22, not 28 | `topics-constants.ts:107` |
| `topic_coverage` row count | **53** per student | runtime | production |

**Good news:** the topic *lists* have one authority — `topics-constants.ts`. `day-topics.ts`,
`coverage-validate.ts` and `timetable.ts` all derive from it. No cloned lists.

**Consequence already shipping:** `screen-topic-coverage.tsx:312` sends
`coverage_total: matrix.length` = **53** into `remainingPrepHours` (`blueprint-builder.ts:136`),
which prices each unit at `397h/46 ≈ 8.6h`. A fresh student is quoted **53 × 8.6 ≈ 456h**
against a 397h syllabus — **~15% over** — and the finish-date options they choose from are
computed from that. The next morning Home prices the same syllabus at 397h.

Onboarding also **displays** 45 units but **saves** 53, defaulting the 8 unshown units to
`not_started` — while the code comment at `:302` states *"Every unit was explicitly
tapped; there are no defaulted rows."* That comment is wrong.

### A.3 "Logged days" — **15 implementations**

The four that matter most, all claiming "of 7 days":

| Producer | Source | Window | Counts | Rest day? |
|---|---|---|---|---|
| `buddy-briefing.ts:97` (+2 byte-identical clones) | `daily_reports` | `gte(today−7)` = **8 days** | **rows** | yes |
| `log-daily/route.ts:345` | `daily_reports` | **7 most recent rows, no date filter** | rows w/ `study_duration > 0` | **no** |
| `log-daily/route.ts:203` (mine) | `daily_reports` | `today−6` = **7 days** | distinct dates | yes |
| `peer-cohort-data.ts:98` | `daily_reports` | `now−7d` = **8 days** | distinct dates | yes |

They differ on **all four axes**. A student who logged 8 consecutive days including one
rest day is told **"8/7 days logged"** by the mentor briefing and **"6/7 study days"** by
their own log response.

`prep-memory-data.ts:114` computes the same-named `loggedDaysLast7` from
`routine_task_completions` — a **different table** entirely.

`analytics.ts:31` — `consistency = (reports.length / period) * 25` — is fed a
**row-limited** set by `buddy/students/[id]/page.tsx:169`, so it **saturates at 100% for
any student with ≥7 logs ever**, regardless of when. The same function is fed a
date-filtered set by 4 other callers, where it is honest. One function, two incompatible
input contracts, both live.

### A.4 "Consistency %" — **6 formulas**

`logDays30/30` · `last30.daysStudied/30` · `activeDays/(21×0.7)` · `activeDays14/14×30` ·
`reports.length/period×25` · `effectiveDays/windowDaysElapsed×35`

Two of them (`student-dna.consistency`, `prep-memory.studentState.consistency`) are both
`days/30×100` but read **different tables**, and appear on different screens for the same
student.

### A.5 "Section avoidance" — **5 implementations, 4 incompatible thresholds**

| Rule | Threshold | Window | Key |
|---|---|---|---|
| `buddy-briefing.ts:88` | served ≥3 & ratio <0.34 | 14d | `date:task_id` |
| `daily-insight.ts:104` | served ≥3 & ratio <0.34 | 14d, **includes today** | `task_id` only |
| `mentor-doors.ts:163` | served ≥2, **no ratio floor** | 14d | `date:task_id` |
| `weekly-diagnosis.ts:67` | planned ≥2 & completed **=0** | 8d IST | `date` |
| `log-daily/route.ts:352` | ≥3 consecutive **rows** without the section | **row count** | `topics_covered` |

The same student can be "avoiding DILR" in the mentor opener and not avoiding anything in
the buddy briefing.

### A.6 Mock facts — **5 producers of "mocks taken", 4 thresholds for "percentile dropped"**

"Mocks taken": lifetime count of `mock_debriefs` · a 30-day count surfaced as lifetime
(`prep-memory.ts:85` → `admin/leads/[id]:352`) · `.limit(5)` · `.limit(20)` · a 21-day
count of `daily_reports.mock_taken` (**a different table**, which disagrees with
`mock_debriefs` by design — "mock pending analysis").

"Percentile dropped" fires at a delta of **2** (`mock-debrief/route.ts:33`), **5**
(`signal-engine.ts:51`), **5** (buddy page), and **0** (`mocks-section.tsx:86`).

"Weakest section from mocks" has **two live rankers** with different age windows (45d vs
∞), completeness rules (3 sections vs 2) and gaps (3 vs 5) — and `buddy-case-data.ts` runs
**both** and ships both to one screen.

`trends-section.tsx:43` and `buddy-case-data.ts:44` both `.order('taken_on', ascending:
true).limit(N)` — fetching the **oldest** N mocks — then treat the last element as
"latest". Past N mocks the chart silently freezes.

### A.7 Temporal semantics — **4 "last 7 days", 3 week starts, 5 "today"**

The authority (`study-day.ts:38`, 05:30 IST) is adopted by 42 files. **Crucially, 05:30
IST ≡ 00:00 UTC**, so ~30 hand-rolled `new Date().toISOString().slice(0,10)` sites are
*accidentally* correct — load-bearing on a coincidence nobody declared.

The genuinely divergent class is **IST-calendar midnight**
(`toLocaleDateString('en-CA', {timeZone:'Asia/Kolkata'})`), used by ~30 modules including
`weekly-diagnosis`, `study-companion` (which self-documents it as *"KNOWN SECOND
DEFINITION OF TODAY — tracked, not accepted"*), and `admin/leads/[id]`. It differs from
the authority **00:00–05:29 IST, every day**.

Week starts: **Monday IST** (`weekly-plan-reconcile:40`), **Monday IST via different day
boundary** (`activation-funnel:160`), **Sunday server-local/UTC** (`weekly-signal:56`). On
any Sunday, W1 and W3 describe disjoint spans.

`weekly-diagnosis.ts` can print **"Studied 8 of 7 days"**, and its volatility mean covers
7 days while its hours total covers 8.

`mission-queue.ts` contains **three** different "today" definitions in one 250-line module.

---

## B–C. Facts proposed, and facts deliberately NOT created

**Not proposed until arbitration:** every fact above whose definition is contested. The
registry cannot register a fact whose value the codebase disputes.

**Proposed as safe to register now** (single authority already exists, verified):

| fact_key | Source | Denominator authority | Notes |
|---|---|---|---|
| `syllabus_topic_total` | `topics-constants.ts` | itself (46, core sections) | replaces the 5 competing totals |
| `section_topic_total` | `topics-constants.ts` | itself (VARC 9 / DILR 9 / QA 28) | |
| `live_streak` | `streak_data` via `liveStreak()` | n/a | **already in `metric-registry.ts`** |
| `study_day_today` | `study-day.ts` | n/a | the one temporal primitive |

Everything else waits.

---

## D. Conflicts requiring founder decision

Ordered by blast radius. **None of these may be silently reconciled.**

| # | Conflict | Decision needed | Risk if wrong |
|---|---|---|---|
| **D1** | **53 vs 46** as "total topics" | Do habit tracks (MOCKS/READING) count as syllabus? | Every coverage % in the product |
| **D2** | `coverage_total = 53` priced at 46-basis hours | Fix the input, or the model? | Finish dates quoted ~15% high to every new student |
| **D3** | Coverage % basis: count / weightage / hours | Pick one *per named fact*; they answer different questions | 11 implementations collapse or stay |
| **D4** | Hours denominator effort-scaled? | `study-pace` vs `full-plan` disagree | Repeaters see two different completion numbers |
| **D5** | "Logged days": rows vs distinct dates; 7 vs 8 days; rest days count? | One rule | 15 producers, mentor vs student contradiction |
| **D6** | Section avoidance thresholds | One rule | 5 producers, contradictory findings |
| **D7** | "Mocks taken": which table, what window | One rule | 5 producers |
| **D8** | Day boundary: fix `topic_evidence` DB default to 05:30 IST | Migration (branch-only under freeze) | 2.5h/night DB-vs-app divergence |
| **D9** | IST-midnight modules → authority | Migrate ~30 modules, or accept? | 5.5h/day divergence |
| **D10** | Three "CareerRai noticed" producers (reported earlier) | Which is canonical | Duplicate/contradictory student-facing lines |

---

## E–H. Contract, producers, denominators, temporal semantics

Deferred to implementation, which is blocked on D1–D10. The contract shape from
`PHASE-0-INTEGRITY-SPEC.md` §0C stands; what it cannot yet do is name values for
`expectedDenominator` or `effective window` while those are disputed.

## I–J. Tests before / after, full suite

No implementation attempted, therefore no new tests. Suite unchanged at **1,836 passed /
1 skipped** (verified after the 0B commit).

## K. Contract inconsistencies found

1. **`safeRatio`'s `expectedDenominator` is unimplementable today** for coverage facts —
   the expected value is exactly what D1/D3 dispute.
2. **0C's "one producer per fact" assumes facts are identifiable.** In practice the same
   *name* (`daysLogged`, `coveragePct`, `consistency`, `mocksTaken`) denotes different
   quantities in different modules. The registry needs a **disambiguation pass** before a
   dedup pass: name → question → source, and only then one producer.
3. **`daily_reports.topics_covered` does not contain topics.** It contains *sections*
   (`log-daily/route.ts:127`). Any registry entry keyed on that name must say so, or the
   next reader will make the same mistake.

## L. Decisions requiring founder approval

**D1–D10 above.** Additionally, two items are production defects that can be fixed
independently of the registry and arguably should be, since they are wrong today:

- **V1** — the >100% `knowledge` percentage (4 students affected). One-line clamp is the
  wrong fix; the right fix is choosing D1 and applying it to numerator and denominator
  together.
- **V2** — the `topic_evidence.logged_for` DB default still on the 03:00 IST rule.
  A one-line migration, but it changes a DB default and therefore needs authorisation
  under the store freeze.

---

## Recommendation on how to proceed

The founder's instinct that 0C is the most important phase is confirmed by what it found.
But 0C as originally scoped — *"register the facts"* — cannot start, because the codebase
does not agree on what the facts are.

Suggested sequencing, for approval:

1. **0C.0 — Arbitration.** Founder rules on D1–D10. Each ruling recorded in the spec with
   its rationale. No code.
2. **0C.1 — The two verified defects (V1, V2)**, fixed under the rulings from 0C.0, each
   with a failing test first.
3. **0C.2 — Register the smallest trustworthy set**: the four safe facts above plus
   whichever the rulings unblock. Not all 40 quantities — the smallest set from which the
   Insight Engine can derive everything else, exactly as the 0C brief demands.
4. **0C.3 — Migrate consumers one at a time**, each with a test proving the number did not
   change (or, where a ruling changes it, proving it changed the way the ruling says).

The alternative — registering facts while ten definitional disputes remain open — would
produce a registry that is authoritative in name and arbitrary in content. That is worse
than no registry, because it would launder the disagreement behind a contract.
