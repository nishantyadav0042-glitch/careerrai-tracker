# 0C.3d — Daily Report Semantics: read-only arbitration audit

**18 Aug 2026. NO CODE. Nothing fixed, nothing migrated, no fact registered,
no rule created, no consumer changed.**

Standing law, applied to every claim below:

> **NO CLAIM ABOUT PRODUCT BEHAVIOUR FROM CODE LOCATION ALONE.**
> **TRACE: PRODUCER → STORAGE → CONSUMER → SURFACE → REAL DATA.**

Applied to myself as well: one alarming number in my first pass was wrong
because I modelled a consumer from its name instead of reading it. It is
corrected in Part D and left visible, because that correction is the method
working.

---

# HEADLINE

The three rulings are correct and I found nothing that argues against them.

But the audit found something **larger than the three questions asked**, sitting
one layer below them:

> **The canonical write path manufactures wellbeing measurements on every
> single log, and multiple consumers — including AI briefings a paid human
> mentor reads — present them as the student's own.**

`upsert_log_and_streak`, the one RPC that writes `daily_reports`, hard-codes
`confidence = 4, stress = 2, overall_energy = 4, quality_focus = 3,
difficulty = 3, sleep_quality = 3` on **both** its INSERT and its UPDATE branch.
**282 of 320 rows (88%) carry that exact signature. `stress` has two distinct
values in the entire table.**

Consequences traced to surfaces:

- `buddy-briefing.ts:136,196` tells a mentor *"Avg confidence: 4/5, avg stress:
  2/5"* before a paid session. Neither number came from the student.
- `weekly-signal` renders *"stress steady at 2/5"* as a signal.
- **`analytics.ts:43` — `if (avgStress >= 4) redFlags.push('burnout risk')`.
  Stress is pinned at 2. The burnout red flag is structurally incapable of
  firing.** A safety check disabled by a constant.

This is not UNKNOWN→ZERO. It is UNKNOWN→**a specific flattering value**, which
is worse: a zero looks like missing data, a 4/5 looks like a measurement.

---

# A. CURRENT SEMANTIC MAP

## Schema (verified against the live database)

| Column | Type | Null? | Default | Can it express UNKNOWN? |
|---|---|---|---|---|
| `report_date` | `date` | NO | — | n/a — the identity |
| `study_duration` | `numeric` | **NOT NULL** | **`0`** | ❌ **no** |
| `topics_covered` | `text[]` | **NOT NULL** | **`'{}'`** | ❌ **no** |
| `mock_taken` | `boolean` | **NOT NULL** | `false` | ❌ no |
| `day_outcome` | `text` | YES | none | ✅ null = not asked |
| `plan_fit`, `blocker_reason`, `mood_emoji` | `text` | YES | none | ✅ |
| `confidence`,`stress`,`quality_focus`,`difficulty`,`sleep_quality`,`overall_energy` | `smallint` | **NOT NULL** | `3` | ❌ no |
| `emotional_chips` | `text[]` | YES | `'{}'` | partial |

`day_outcome` carries a CHECK: `studied | partial | not_studied | skipped`.
Unique key: `(student_id, report_date)`. One trigger: `updated_at` only.

**The schema is itself the UNKNOWN→ZERO converter.** The two columns the
rulings are about are `NOT NULL DEFAULT` empty. There is no value either column
can hold that means "we were not told".

## The eleven meanings currently in play

| Term | Definitions found | Where |
|---|---|---|
| "logged day" | a row exists | streak RPC, `logged_days_total` |
| "studied day" | `study_duration > 0` | consistency rule, `routine/today:312`, `lis-health:158`, `student-360:137` |
| "studied day" | `day_outcome = 'studied'` | check-in gate |
| "rest day" | `hours === 0 && sections.length === 0` | `log-daily:212` |
| "rest day" | `day_outcome = 'not_studied'` | check-in gate |
| "today" | `getLogDateString()` — 05:30 IST | canonical |
| "today" | `Date.now()` | `daysBetween`, `routine/today:308-309` |
| "last 7 days" | `report_date >= today − 6` | registry, several crons |
| "last 7 days" | `slice(0, 7)` of rows | `computePrescriptiveLine` ×2 |
| "last 7 days" | `.limit(14)` then `slice(0,7)` | same |
| "sections studied" | `topics_covered` as section names | 170 rows |
| "sections studied" | `topics_covered` as topic names | 23 rows |

---

# B. WRITER-BY-WRITER

There are **four** writers. Only one touches the fields under arbitration.

### B1. `upsert_log_and_streak` — the sole writer of the disputed fields

Called by exactly two routes. Its INSERT and UPDATE branches both write:

```sql
quality_focus = 3, difficulty = 3, confidence = 4, stress = 2,
sleep_quality = 3, overall_energy = 4, nutrition_exercise = FALSE
```

**These are not schema defaults being left alone. They are values the function
asserts on every write, including UPDATE — so they overwrite whatever was
there.** The function takes no parameter for any of them.

Also note: the UPDATE branch sets `topics_covered = p_topics_covered`
unconditionally. It **replaces**, it does not merge.

### B2. `log-daily` (full log sheet)

| Field | Value |
|---|---|
| `study_duration` | `body.hours` — the student's own number ✅ |
| `topics_covered` | `body.sections` — section vocabulary ✅ |
| `mock_taken` | `body.sections.includes('Mock')` |
| `day_outcome` | **a separate, fire-and-forget UPDATE after the RPC** |

**The `day_outcome` write is not in the RPC transaction.** It is
`void admin.from(...).update(...)` with a `.then()` that only logs. If it fails,
the row exists with `day_outcome = null` and nobody is told. **The discriminator
the entire five-state model depends on is the one field written without a
transaction.**

### B3. `complete-task` (ticking closes the day)

| Field | Value |
|---|---|
| `study_duration` | `max(creditedHours(...), existing)` — **derived, never student-stated** |
| `topics_covered` | union of existing and plan sections; `General` → `Revision` |
| `day_outcome` | never written |

Its own comment (line 186) records that the RPC *"OVERWRITES
study_duration/topics_covered/mock_taken"*, which is why it reads-then-merges.
`log-daily` does not merge — so a full log submitted after ticking **erases the
tick's section evidence** for any section the sheet omits.

### B4. `20260621_refresh_demo_dates.sql` — demo seed

Writes topic-name-style `topics_covered`. Source of 42 of the 23-row
topic-vocabulary anomaly (demo account `Arjun Sharma`, `is_demo = true`).

### B5. `check-in-gate` — a writer in effect, via B2

Not a database writer, but it determines what B2 writes, and it is the origin of
the ambiguity:

```ts
hours: 0,           // hard-coded
sections: [],       // hard-coded
log_date: yesterdayStr,
day_outcome: finalOutcome,
```

Its own comment is explicit and correct: *"A check-in is not a study claim."*
**The intent is right and the storage cannot carry it.** `0` and `[]` are the
same bytes a real zero would write.

---

# C. READER-BY-READER

64 files reference `daily_reports`. Classified by what they assume.

### C1. Readers that convert missing measurement into a measured zero

| Reader | Line | Assumption | Surface |
|---|---|---|---|
| `computePrescriptiveLine` | `:356` | `study_duration > 0` = studied | post-log line |
| `routine/today` | `:312` | `<= 0` → skip (Learning Velocity) | Home |
| `lis-health` | `:158` | same | founder dashboard |
| `student-360` | `:137` | same | admin |
| `plan-extension` | `:29` | comment says *"Missing = 0"* | plan |
| `weekly-diagnosis` | `:96` | `+ (study_duration ?? 0)` | weekly |

### C2. Readers that divide by row count and call it a daily average

`chat/draft:88`, `weekly-signal:74`, `feedback-draft:57`, `buddy-briefing:99`
all compute `sum(study_duration) / logs.length` and label it **"avg hrs/day"**.
Every check-in row contributes `0` to the numerator and `1` to the denominator.

**These four feed LLM prompts.** `chat/draft:93` renders
*"Last 7 days: N/7 days logged, avg X hrs/day"* into a prompt. A wrong average
becomes an AI sentence a student or mentor reads.

### C3. Readers of the manufactured wellbeing values

| Reader | What it says | Truth |
|---|---|---|
| `buddy-briefing:136` | *"Avg confidence: 4/5, avg stress: 2/5"* | RPC constants |
| `buddy-briefing:196` | *"Avg stress: 2/5"* in the mentor brief | RPC constants |
| `weekly-signal:14,17` | *"Stress trending up… (avg 2/5)"* | cannot trend; 2 distinct values exist |
| `analytics.ts:43` | `avgStress >= 4` → *"burnout risk"* | **can never fire** |
| `check-red-flags` cron | selects `confidence, stress, sleep_quality, overall_energy` | all constants |

### C4. Readers that are correct

- `logged_days_total` / `logged_days_last_7` (Fact Registry) — count distinct
  dates, make no claim about hours. **Unaffected by every defect in this
  document.** The 0C.3a migration is not at risk.
- `upsert_log_and_streak`'s own streak computation — `SELECT DISTINCT
  report_date`, gaps-and-islands. Correct by construction.
- `capacity-engine` — see the correction below.

---

# D. PRODUCTION EVIDENCE

320 rows, 135 students, 12 Jul – 18 Aug.

| Measurement | Value |
|---|---|
| rows carrying the exact RPC wellbeing signature | **282 / 320 (88%)** |
| distinct values of `stress` in the whole table | **2** |
| rows with `day_outcome` set (check-in shaped) | 186 |
| `day_outcome='studied'` **with 0 hours** | **38** |
| `day_outcome='studied'` **with no sections** | **30** |
| `day_outcome='partial'` with 0 hours | 24 |
| `day_outcome='not_studied'` (all 0h, all no sections) | 54 |
| students with ≥1 "affirmed studied, 0 hours" row in 21d | **35 of 89 (39%)** |
| 7 most recent rows spanning >7 calendar days (of 6 eligible students) | **4**; avg 12.2 days, **worst 29** |
| `topics_covered` topic-vocabulary rows | 23 — demo + one superseded app-review account only |
| `mock_taken = true` without `Mock` in sections | **9 of 26 (35%)** |
| rows rewritten after creation | 71 |
| contradictory rows (`not_studied` + hours > 0) | **0** — latent, not yet occurred |

## ⚠️ CORRECTION TO MY OWN FIRST PASS

My first query modelled the capacity engine as `sum(hours) / rows` and reported
that check-in zeros crush planned capacity from 2.94 h/day to 0.97 h/day.

**That is wrong.** `computeCapacity` filters `h > 0` and takes the **median of
productive days**. Zero rows do not enter the median at all. I inferred a
consumer's behaviour from its inputs instead of reading it — the exact mistake
this law exists to prevent.

**The real defect is the opposite shape and smaller:** zero rows inflate
`loggedDays`, which is the gate `loggedDays >= 5` that switches the engine from
*"trust what they told us"* to *"trust behaviour"*.

| | |
|---|---|
| students past the behaviour gate | 10 |
| of those, with **fewer than 5** real study days | **6** |
| of those, with **fewer than 3** real study days | **5** |
| crossed the gate **only** because of affirmed-zero rows | **6** |

So six students have their plan sized from behaviour inferred on 2–4 real data
points, because non-measurements were counted as days. Real, worth fixing, and
**not** the 3× crush I first reported.

---

# E. CONTRADICTIONS

| # | Contradiction | Status |
|---|---|---|
| E1 | RPC asserts `confidence=4, stress=2, energy=4` on every write; consumers present them as the student's | **live, 88% of rows** |
| E2 | Burnout red flag requires `avgStress >= 4`; RPC pins stress at 2 | **live — check disabled** |
| E3 | `study_duration=0` means both "measured zero" and "not asked" | **live, 62 affirmed rows** |
| E4 | `topics_covered=[]` means "studied nothing", "not asked", and "check-in" | **live, 127 rows** |
| E5 | `day_outcome` is the only discriminator, and is written fire-and-forget outside the RPC transaction | **live risk, 0 observed** |
| E6 | `log-daily` replaces `topics_covered`; `complete-task` merges it | **live** — a sheet can erase tick evidence |
| E7 | `day_outcome='not_studied'` could survive a later full log with hours | **latent**, 71 rewrites make it reachable |
| E8 | `topics_covered` holds two vocabularies with no constraint | 23 rows, non-real accounts |
| E9 | `mock_taken` and the `Mock` section disagree | **9 of 26 rows** |
| E10 | Four "last 7 days" definitions; two "today" definitions | **live** |
| E11 | `daysBetween` uses `Date.now()` in a file that imports `getLogDateString` | **live** |

---

# F. PROPOSED CANONICAL SEMANTICS

Stated as a proposal for arbitration, not as a design to build.

### F1. The row is an EVIDENCE record, not a state table

A `daily_reports` row means: **"on CareerRai day D, this student told us
something."** It does not mean "here is the complete truth of day D". Same
answer I expect for `topic_coverage`, and the two should be ruled together.

### F2. Duration

| State | Condition |
|---|---|
| `KNOWN` | the student supplied a number through the full sheet |
| `DERIVED` | `complete-task` computed it from `creditedHours` |
| `UNKNOWN` | no duration was ever collected (every check-in row) |

A fact answering *"how many hours"* returns UNKNOWN for the third. **No fact may
sum a DERIVED value together with a KNOWN one without saying so** — they are
different evidence, and 62 rows carry one while looking like the other.

### F3. Section coverage

`topics_covered = []` is **UNKNOWN**, never "studied nothing". It may support
*"no section-level detail was recorded"* — and per the founder's own ruling that
should stay an internal evidence state, not a student-facing line.

### F4. Windows

`last_7_days` = the seven canonical CareerRai days `[today−6 … today]`,
inclusive, from `getLogDateString()`. **Never rows.** One helper, one
definition, `Date.now()` banned in any windowed producer — the rule the Fact
Registry already enforces on itself and nothing else obeys.

### F5. Wellbeing

`confidence`, `stress`, `sleep_quality`, `overall_energy`, `quality_focus`,
`difficulty` are **UNKNOWN unless the student supplied them**. The RPC must stop
asserting them. Until then, **no consumer may present them as measurements** —
which today means `buddy-briefing`, `weekly-signal`, `analytics` and
`check-red-flags` are all rendering fabricated numbers.

---

# G. CAN THE SCHEMA SUPPORT THE FIVE-STATE MODEL?

The founder's model:
`NOT_RECORDED · STUDIED_UNKNOWN_DURATION · STUDIED_KNOWN_DURATION ·
NOT_STUDIED · REST`

## Answer: **partially — and the missing part is the one that matters.**

| State | Derivable today? | From what |
|---|---|---|
| `NOT_STUDIED` | ✅ | `day_outcome='not_studied'` |
| `STUDIED_KNOWN_DURATION` | ✅ | `study_duration > 0` |
| `STUDIED_UNKNOWN_DURATION` | ⚠️ **only while `day_outcome` survives** | `day_outcome IN ('studied','partial') AND study_duration = 0` |
| `REST` | ❌ **not distinguishable** | collides with `NOT_RECORDED` |
| `NOT_RECORDED` | ❌ **not distinguishable** | collides with `REST` |

**Three findings, adversarially:**

**G1. The discriminator is not durable.** `STUDIED_UNKNOWN_DURATION` exists only
because `day_outcome` is set — by a fire-and-forget UPDATE outside the RPC
transaction. One failed write and the row silently degrades into `REST`. The
model's most important state rests on the least reliable write in the file.

**G2. `REST` and `NOT_RECORDED` are the same 9 rows.** `day_outcome IS NULL AND
study_duration = 0 AND topics_covered = '{}'` — 9 rows — is either an honest
rest-day full log or an abandoned submit. Nothing distinguishes them. If the
model needs them apart, the schema cannot do it.

**G3. `STUDIED_KNOWN_DURATION` conflates two evidence kinds.** A student-typed
4h and a `creditedHours`-derived 4h are the same number in the same column. If
the model is meant to express *what we know and how we know it*, it needs
`duration_source`, not just a duration.

**I am not proposing a migration.** The honest report is: the model is
conceptually right, the storage supports three of five states, and the two it
cannot express are exactly the ones the current defects live in.

---

# H. TESTS / GUARDS REQUIRED

None written. Listed so the ruling can be complete; listing is not requesting.

1. No producer may read `study_duration` without declaring how it treats 0.
2. No producer may read `topics_covered` length as a count of sections studied.
3. Any fact whose meaning says "7 days" computes a 7-calendar-day window.
4. `Date.now()` banned in any module that computes a CareerRai day.
5. `daily_reports` writers may not assert a wellbeing value they were not given.
6. `topics_covered` entries must all come from one declared vocabulary.
7. `mock_taken` and the `Mock` section must agree, or one must be retired.
8. `day_outcome` must be written in the same transaction as the row.

---

# I. IMPACT ON EXISTING STUDENTS

| Population | Affected by | Severity |
|---|---|---|
| **All 135 students with logs** | wellbeing values presented as theirs (88% of rows) | **P0 trust** |
| **Any student a mentor briefs** | *"avg stress 2/5, confidence 4/5"* before a paid session | **P0 trust** |
| **All students** | burnout red flag cannot fire | **P0 safety** |
| 35 of 89 recently active | ≥1 "affirmed studied, 0 hours" row | P1 |
| 6 students | plan sized from behaviour inferred on <5 real study days | P1 |
| 6 of 6 eligible | row-window rules mislabelled as calendar weeks | P1 |
| 9 students | avoidance rule readable from empty `topics_covered` | P1 |
| 0 students | contradictory `day_outcome` rows | latent |

**No student is harmed by the 0C.3a migration.** Every fact it consumes counts
distinct dates or coverage rows; none reads `study_duration`, `topics_covered`
or any wellbeing column.

# J. IMPACT ON EXISTING INSIGHTS

| Producer | Depends on disputed semantics? |
|---|---|
| `log-insight.ts` (migrated) | ❌ no — safe |
| `computePrescriptiveLine` rule 1 | ❌ no — safe |
| rules 3, 4, 5, 6 | ✅ **all four** — confirmed blocked |
| rule 2 (chips) | ❌ no — blocked by a gate, not by semantics |
| `daily-insight` kinds 1, 3, 4, 6 | ❌ no — read `topic_coverage` / completions |
| `daily-insight` kind 5 (consistency) | ✅ counts log dates — **safe**, its defect is the window, already fixed |
| `buddy-briefing`, `weekly-signal`, `chat/draft`, `feedback-draft` | ✅ **all four render fabricated wellbeing and row-count averages** |

**The AI-drafting surfaces are more affected than the insight engine.**

---

# K. OPEN DECISIONS REQUIRING FOUNDER APPROVAL

| # | Decision | My recommendation |
|---|---|---|
| **K1** | The RPC's hard-coded wellbeing block | **Stop asserting it.** Highest-severity finding; it fabricates evidence a human mentor acts on. Needs its own gate ahead of everything else. |
| **K2** | The disabled burnout red flag | Ruling needed on whether it was ever meant to fire. It has not, ever. |
| **K3** | `REST` vs `NOT_RECORDED` | Cannot be distinguished. Either accept the merge, or the schema changes. |
| **K4** | `day_outcome` written outside the transaction | Must move inside if the five-state model is to be trusted. |
| **K5** | Duration provenance — student-typed vs `creditedHours` | Same column today. Decide whether the difference matters before any hours-based claim. |
| **K6** | `topics_covered` vocabulary | Declare one, constrain the writer. Historical demo rows can stay. |
| **K7** | `mock_taken` vs `Mock` section | One canonical answer to "did they take a mock". Blocks rule 5. |
| **K8** | Does a check-in count toward the streak? | It does today — a `not_studied` check-in extends the streak, because the streak counts rows. Not a defect I am asserting; a semantic the founder should confirm is intended. |

---

**STOP.** No code. No migration. No fact. No rule. No consumer change.
0C.3b remains blocked; 0C.3c not started.
