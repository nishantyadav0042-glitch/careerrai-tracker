# 0C.3e — Daily Report Data Integrity: audit-only report

**18 Aug 2026. NO CODE. Nothing fixed, migrated, retired, backfilled or
re-defaulted. No fact, no rule, no consumer change, no UX change.**

Standing law, applied to every claim: **trace producer → storage → consumer →
surface → real data.** Where a number below is a mechanism rather than an
observed harm, it says so.

---

# A. COMPLETE WRITER MAP

`daily_reports` has **one** SQL writer, **two** callers, and **two** side
paths. Nothing else in the codebase inserts or updates the table.

### A1. `upsert_log_and_streak` — the sole writer of the disputed fields

```sql
-- INSERT branch                          -- UPDATE branch (same values)
quality_focus = 3, difficulty = 3,        quality_focus = 3, difficulty = 3,
confidence = 4, stress = 2,               confidence = 4, stress = 2,
sleep_quality = 3, overall_energy = 4,    sleep_quality = 3, overall_energy = 4,
nutrition_exercise = FALSE                nutrition_exercise = FALSE
```

The function takes **no parameter** for any of these six. It asserts them on
**every write, including UPDATE** — so they overwrite whatever was there.

These are **not** the schema defaults being left alone. The schema defaults are
all `3`; the RPC writes `4`, `2`, `4`. The values were chosen, hard-coded, and
are re-asserted on every edit.

Also: the UPDATE branch sets `topics_covered = p_topics_covered`
**unconditionally** — it replaces, it does not merge.

| Field | Written by RPC from | Student-supplied? |
|---|---|---|
| `study_duration` | `p_study_duration` | ✅ via full sheet; ❌ derived via tick; ❌ hard-`0` via check-in |
| `topics_covered` | `p_topics_covered` | ✅ / ❌ / hard-`[]` |
| `mock_taken` | `p_mock_taken` | ✅ |
| `mood_emoji`, `notes`, `emotional_chips` | params | ✅ |
| **six wellbeing columns** | **hard-coded literals** | ❌ **never** |

### A2. `log-daily` (full sheet + check-in gate)

Calls the RPC, then issues a **separate, non-transactional** update for
`plan_fit`, `blocker_reason`, `confidence`, `day_outcome`:

```ts
void admin.from('daily_reports').update(reviewUpdate)…
  .then(({ error }) => { if (error) console.error(…) });
```

`void` + `.then` that only logs. **Not awaited, not in the RPC transaction, no
retry, no surfacing.** This is the only path by which `confidence` is ever real
and the only path by which `day_outcome` is ever set.

### A3. `complete-task` (ticking closes the day)

Reads the existing row, merges, calls the same RPC. `study_duration` is
`max(creditedHours(...), existing)` — **derived, never student-stated**.
`day_outcome` never written. Its own comment (`:186`) records that the RPC
overwrites, which is why it merges. `log-daily` does not merge.

### A4. `check-in-gate` — writer in effect

```ts
hours: 0, sections: [], log_date: yesterdayStr, day_outcome: finalOutcome
```
Its comment is correct — *"A check-in is not a study claim"* — and the storage
cannot carry that intent. `0` and `[]` are the bytes a real zero writes.

### A5. `LoggingModal:151` — a second producer of the same shape

The full sheet's "didn't study" path also submits `{hours: 0, sections: []}`.
And `day_outcome` from the sheet is **derived from task marks**
(`deriveOutcome()`), returning `null` when no tasks were marked — so **a full
log with real hours can carry `day_outcome = null`.**

### A6. `20260621_refresh_demo_dates.sql` — demo seed (topic-vocabulary rows)

---

# B. COMPLETE CONSUMER MAP

Classified per the ruling: **(1)** requires KNOWN student input · **(2)** can
operate on UNKNOWN · **(3)** must be retired or changed.

## B1. The six wellbeing columns

| Consumer | Uses | Surface | Class |
|---|---|---|---|
| `analytics.computeSummary:26` `avgStress` | burnout red flag | mentor email + in-app | **3** |
| `analytics:27` `avgSleep` | sleep red flag | same | **3** |
| `analytics:33` `moodScore` | **20 of every student's 100-point score** | student profile, admin, digest | **3** |
| `analytics:64` `stressTrend` | trend arrow | admin | **3** |
| `buddy-briefing:136,196` | *"Avg confidence 4/5, avg stress 2/5"* | **paid mentor session brief** | **3** |
| `weekly-signal:14,17` | *"stress steady at 2/5"* | signal line | **3** |
| `chat/draft:60` | stress into an **LLM prompt** | AI reply | **3** |
| `feedback-draft:41` | confidence + stress into a draft | AI draft | **3** |
| `check-red-flags` cron | selects all four | **email to buddy** | **3** |
| `admin/students`, `admin/buddies/roster`, `weekly-digest` | red-flag badges | founder/admin | **3** |
| `student/profile/history-section` | score + band | **student-facing** | **3** |

**Every consumer of these six columns is class 3.** Not one can operate on
UNKNOWN, because not one was written to expect it — they all average a
`NOT NULL smallint`. There is no consumer that would be correct after a null.

**`confidence` is the dangerous one.** It has **5 distinct values** in
production — 290 of 320 rows are the RPC's `4`, the rest are real student input
arriving via the fire-and-forget update. **A mostly-fabricated column that is
sometimes real is worse than a uniformly fake one**: it looks plausible and
cannot be spotted by inspection.

## B2. `study_duration`

| Consumer | Assumption | Class |
|---|---|---|
| `computePrescriptiveLine:356` | `> 0` = studied | **3** |
| `routine/today:312` (Learning Velocity) | `<= 0` → skip | **3** |
| `routine/today:135` → `computeCapacity` | zeros filtered by the engine | **2** ✅ |
| `lis-health:158`, `student-360:137` | `<= 0` → skip | **3** |
| `plan-extension:29` | comment: *"Missing = 0"* | **3** |
| `weekly-diagnosis:96` | `+ (x ?? 0)` | **3** |
| `chat/draft:88`, `weekly-signal:74`, `feedback-draft:57`, `buddy-briefing:99` | `sum / rowCount` labelled **"avg hrs/day"** | **3** |
| `analytics:23` `avgStudy` → *"momentum dropping"* flag | mean over all rows | **3** |
| `student/tracker:258`, `history-section:103`, `debug` | display only | **2** ✅ |

## B3. `topics_covered`

| Consumer | Assumption | Class |
|---|---|---|
| `computePrescriptiveLine` rules 4, 6 | `[]` = studied no sections | **3** |
| `peer-cohort-data`, `mentor-doors` | section membership | **1** |
| `feedback-draft`, `weekly-signal`, `buddy-briefing` | listed into prompts | **1** |
| `history-section:103` | display | **2** ✅ |

## B4. `day_outcome`

| Consumer | Effect | Class |
|---|---|---|
| `routine/today:392` → `planReason(...)` | **the "why today's plan looks like this" line on Home** | **1** |
| `metric-registry:137` | coverage note | 2 |

**One real consumer, and it changes what the student is told about their plan.**
A failed fire-and-forget write silently degrades tomorrow's explanation.

## B5. Unaffected — verified

`logged_days_total`, `logged_days_last_7` and every coverage fact in the Fact
Registry read distinct dates or `topic_coverage` rows. **They touch none of
these five fields.** `upsert_log_and_streak`'s own streak computation is
`SELECT DISTINCT report_date` gaps-and-islands — correct by construction.
**0C.3a is not at risk.**

---

# C. STATES ACTUALLY REPRESENTABLE TODAY

| Column | Type | Can hold UNKNOWN? |
|---|---|---|
| `study_duration` | `numeric NOT NULL DEFAULT 0` | ❌ |
| `topics_covered` | `text[] NOT NULL DEFAULT '{}'` | ❌ |
| six wellbeing columns | `smallint NOT NULL DEFAULT 3` | ❌ |
| `day_outcome` | `text NULL`, CHECK-constrained | ✅ |

| Target state | Representable? | Via |
|---|---|---|
| `NOT_STUDIED` | ✅ | `day_outcome='not_studied'` |
| `STUDIED_WITH_DURATION` | ⚠️ partly | `study_duration > 0` — but cannot say whether the number was typed or derived |
| `STUDIED_UNKNOWN_DURATION` | ⚠️ **fragile** | only while `day_outcome` survives a non-transactional write |
| `REST` | ❌ | collides with `NOT_RECORDED` — the same 9 rows |
| `NOT_RECORDED` | ❌ | collides with `REST` |

**The schema is the UNKNOWN→ZERO converter.** No TypeScript-side rule can fix
that, which is why the ruling *"do not encode this through magic values"* is
the right one — `0 = UNKNOWN` in code would move the ambiguity, not remove it.

---

# D. PROPOSED CANONICAL STATES

Proposal for arbitration only.

### D1. Duration — three states, and provenance is part of the state

```
DURATION_NOT_COLLECTED   no duration was ever asked (every check-in row)
DURATION_STATED          the student typed a number on the full sheet
DURATION_DERIVED         creditedHours computed it from ticked plan tasks
```
`0` remains legal and means **a stated zero**. The distinction that must exist
is *collected vs not*, and *stated vs derived* — 62 rows currently carry one
while looking like the other.

### D2. Sections — three states

```
SECTIONS_NOT_COLLECTED   the surface never asked (check-in)
SECTIONS_NONE            asked, student named none
SECTIONS_LISTED          asked, student named some
```

### D3. Wellbeing — two states

```
WELLBEING_NOT_COLLECTED  the RPC's current behaviour, honestly labelled
WELLBEING_STATED         the student moved the control
```

### D4. Day outcome — unchanged in meaning, changed in durability (see H)

**Smallest representation that achieves this without magic values:** make the
affected columns nullable and stop writing invented values, plus one small
provenance marker for duration. **I am not proposing the migration** — the
column-by-column choice is a founder decision and needs its own gate, because
`NOT NULL DEFAULT` removal touches 64 reader files.

---

# E. AFFECTED SURFACES

| Surface | What it shows | Who sees it |
|---|---|---|
| Red-flag email + in-app | *"⚠️ Red flag: {name}"* + first flag | **buddy (human mentor)** |
| Mentor briefing | *"Avg confidence 4/5, avg stress 2/5"* | **buddy, before a paid session** |
| Student profile history | overall score + band (*On track* / *Needs intervention*) | **the student** |
| Home plan narration | *"why today looks like this"* via `day_outcome` | **the student** |
| Post-log line | prescriptive rules 3–6 | **the student** |
| Weekly signal | *"stress steady at 2/5"* | student/mentor |
| AI chat + feedback drafts | avg hours, stress into prompts | student/mentor |
| Founder weekly digest | scores, bands, red flags | founder |
| Admin students / roster | red-flag badges, trends | founder/admin |

---

# F. EXACT PRODUCTION IMPACT

320 rows · 135 students · 12 Jul – 18 Aug.

| Measurement | Value |
|---|---|
| rows with the exact RPC wellbeing signature | **282 / 320 (88%)** |
| distinct `stress` values in the whole table | **2** |
| distinct `sleep_quality` values | **2** |
| `moodScore` contribution to every student's 100-point score | **a constant 20/25** |
| `day_outcome='studied'` with 0 hours | **38** |
| `day_outcome='studied'` with no sections | **30** |
| students with ≥1 affirmed-zero row in 21d | **35 of 89 (39%)** |
| students past the capacity behaviour-gate | 10 — of which **6** on <5 real study days |
| **red-flag alerts actually sent** | **64**, to **4 buddies**, 21 Jul – 17 Aug |
| — *"Avg study below 3 hrs/day"* | **50** |
| — *"Fewer than 4 reports this week"* | **14** |
| — burnout / sleep flags | **0, ever** |

### The honest result on the 50 alerts

I recomputed all 50 against their own 7-day windows:

| | |
|---|---|
| alerts whose window contained affirmed-zero rows | **19** |
| alerts that would **not** have fired if those rows were excluded | **0** |
| alerts for students with **zero** productive days in the window | **45** |

**The contamination is real in mechanism and has caused no observed false alarm
to date** — those students had no study hours either way. This is a
future-correctness fix, not a present-harm fix, and I am not going to describe
it as the latter.

*(Window boundaries in the recompute are approximate to the day; 27 of 50 still
evaluate as firing on today's data, the rest sit on windows since altered.)*

### Correction carried forward

My first pass reported check-in zeros crushing planned capacity 2.94h → 0.97h.
**Wrong** — `computeCapacity` filters `h > 0` and takes a median, so zeros never
enter it. I inferred a consumer from its inputs instead of reading it. The real
defect is smaller and opposite in shape: zeros inflate `loggedDays`, the gate
that switches the engine to "trust behaviour" (6 students).

---

# G. K2 — BURNOUT RULE DETERMINATION

**Ruling requested: RETIRE the burnout and sleep flags. Do not resurrect.**

Evidence:

| Question | Answer |
|---|---|
| Was it an intended product requirement? | Yes — it sits in `computeSummary`'s original red-flag set alongside four others, with a real delivery path. |
| Where is it surfaced? | `check-red-flags` cron → in-app notification **and email** to the buddy; badges in admin; first flag becomes the notification body. |
| Is an action attached? | **Yes** — a human mentor is emailed. |
| Has any student ever been the subject of one? | **No. Zero burnout alerts in the product's history.** |
| Why not? | `avgStress >= 4`; the RPC pins `stress = 2`. The threshold is unreachable **by construction**, not by luck. |
| Same for sleep? | Yes — `avgSleep < 3`, RPC pins `sleep_quality = 3`. `3 < 3` is false. **Also structurally dead.** |
| Did something replace it? | **No.** The emotional chips are the only live wellbeing signal, and 82% of those never reach their rule either (separate document). |

**Determination:** these are not dormant rules waiting to be enabled — they are
rules whose input is a constant. Restoring them means first making stress and
sleep real, which means collecting them, which the product does not do. **Retire
them; do not change the thresholds.** A retired rule is honest; a rule that
looks alive and cannot fire is a false assurance to the founder that burnout is
being watched.

**Note, separately:** the other three flags DO fire (64 alerts). Two of them —
*"Avg study below 3 hrs/day"* and *"Fewer than 4 reports this week"* — are built
on the row-count and zero-hours ambiguities. They are not dead; they are
approximately right for the wrong reason.

---

# H. TRANSACTION BOUNDARY FOR `day_outcome`

**Today:**

```
1. RPC upsert_log_and_streak   ← atomic: daily_reports + streak_data
2. void .update({day_outcome}) ← fire-and-forget, not awaited, not retried
3. response returned            ← returns 200 whether or not (2) landed
```

The route returns success on step 3. A student sees "logged", the row exists,
and the outcome may simply be absent. **No error reaches the student, the
founder, or `recordSacredFailure`.**

Three consequences, traced:

- **H1.** `STUDIED_UNKNOWN_DURATION` silently degrades to the `REST` /
  `NOT_RECORDED` collision.
- **H2.** `planReason` loses `dayOutcome` → Home falls back to generic
  narration. Silent, student-visible.
- **H3.** `confidence` rides the same write. When it fails, the RPC's `4`
  stands — **a failed write leaves a fabricated value in place of a real one.**

**Smallest safe change (proposal, not implementation):** move `day_outcome`
(and `plan_fit`, `blocker_reason`, `confidence`) into `upsert_log_and_streak` as
parameters, so one student action commits one complete state. The RPC already
owns the row; adding nullable parameters does not change its transaction
contract. **Not to be implemented until the state model in D is ruled** —
otherwise the transaction would faithfully commit semantics we have not agreed.

Latent contradiction, **0 occurrences today, 71 rows rewritten after creation so
the path is live:** the RPC UPDATE does not touch `day_outcome`, so a stale
`not_studied` from a check-in can survive a later full log carrying real hours.

---

# I. CANONICAL TIME SEMANTICS

### There is already one canonical definition, and it is good

`src/lib/study-day.ts` — `studyDayString()`, re-exported as
`getLogDateString()`. Rollover **05:30 IST**, which is **exactly 00:00 UTC**.

That equality is why ~73 `Date.now()`-derived day strings across the codebase
**currently agree with it by coincidence**. The module's own comment says so.
It is a coincidence, not an invariant: move the rollover and 73 call sites
silently disagree.

### Proposed canonical definitions

| Term | Proposed | Today |
|---|---|---|
| **today** | `getLogDateString()`, always | 1 canonical + ~73 accidental agreements + `istDay()` in `activation-funnel` |
| **last 7 days** | `[today−6 … today]`, inclusive, canonical days | 4 definitions; two are `slice(0,7)` of rows |
| **logged day** | a CareerRai day with ≥1 `daily_reports` row | already consistent ✅ |
| **studied day** | ⚠️ **cannot be defined until D1 is ruled** | `study_duration > 0` in 6 places |

**`studied day` is the one that cannot be settled here.** Every candidate
definition depends on whether a check-in "studied" with no duration counts —
which is exactly ruling D1. I am not proposing one.

---

# J. SAFE MIGRATION SEQUENCE

Proposal. Each step states old semantic → new semantic → students affected.

| # | Step | Old → New | Students | Why it is safe |
|---|---|---|---|---|
| **J1** | Stop the RPC asserting six wellbeing values | invented `4/2/4/3/3/3` → not written | all future rows | No reader changes yet; new rows carry the schema default instead of a chosen lie. **Does not fix reading — see J2.** |
| **J2** | Retire the burnout + sleep flags (G) | dead rules → removed | 0 (never fired) | Removing something that has never fired cannot change any student's experience. |
| **J3** | Stop presenting wellbeing as measurement | *"avg stress 2/5"* → omitted | every briefed student | Removing a fabricated sentence needs no new data. |
| **J4** | Rule the state model (D) | — | 0 | Decision, no code. |
| **J5** | Make `day_outcome` transactional (H) | fire-and-forget → committed | future rows | Only after J4. |
| **J6** | Canonical windows (I) | 4 defs → 1 | rules 3–6 consumers | Only after `studied day` is ruled. |
| **J7** | Then, and only then, 0C.3b | — | — | — |

**J1 alone does not make anything true.** It stops manufacturing new fabrications;
282 existing rows keep theirs. **Historical backfill is not proposed** — it would
require inventing the values that were never collected, which is the same defect
in reverse. My recommendation is to leave history as-is and mark it.

**J1 and J3 are separable and J3 is the one that protects a human.** A mentor
reading *"avg stress 2/5"* before a paid session is the sharpest live harm here,
and it is fixed by deleting a sentence — no schema change, no migration.

---

# K. RISKS AND ATTACK CASES

Attacks attempted against the proposed direction. **Four succeed.**

### ❌ Attacks that succeed

**K-A1 — J1 makes the lie quieter, not absent.** Stopping the RPC leaves the
`NOT NULL DEFAULT 3` columns. New rows will read `3/5` everywhere instead of
`4` and `2` — still a fabricated measurement, just a more plausible one.
**J1 without J3 arguably makes detection harder.** They must ship together, or
J3 first.

**K-A2 — dropping `NOT NULL` is a 64-file blast radius.** Every consumer
averages a number. `avg([null, 4])` in TypeScript is `NaN`, and `NaN >= 4` is
false — so a nullable column would silently disable the remaining red flags too,
by a different mechanism. **The nullable migration cannot be done without the
consumer sweep in B first.**

**K-A3 — `confidence` cannot be cleanly separated.** 30 rows carry real student
confidence and 290 carry the RPC's `4`, and **nothing in the row distinguishes
them** — no source column, and `4` is a legal student answer. Historical
confidence is **unrecoverable**. Any future claim about confidence trends must
begin after the fix date.

**K-A4 — the retirement in J2 removes the only burnout watch that exists.**
Even though it never fired, deleting it means CareerRai formally has *no*
burnout detection. That is honest and it is also a product regression in
appearance. The founder should retire it **and** record that wellbeing detection
is now an open product gap, rather than let the deletion imply it was solved.

### ✅ Survives

- **0C.3a isolation.** Every registry fact reads distinct dates or
  `topic_coverage`. I tried to construct a path from these five fields into
  `log-insight` and could not: it consumes eight facts, none of which touch
  them.
- **Streak integrity.** `SELECT DISTINCT report_date` — unaffected by every
  defect here.
- **The check-in gate's design.** Its intent (*"a check-in is not a study
  claim"*) is correct and should be preserved, not reverted. The bug is the
  storage, not the feature.

### Attack cases for the future engine

| Case | What would break |
|---|---|
| Student check-ins "studied" 7 days running | *"0/7 study days last week"* — silent, confident, wrong |
| Student edits an old log | RPC UPDATE re-asserts `stress=2`, wiping a real value |
| Full log after ticking | `topics_covered` replaced, tick evidence erased |
| Rollover moves off 05:30 IST | ~73 day-string call sites silently disagree |
| Wellbeing made real later | `stressTrend` computed across the fix boundary compares real to fabricated |

---

# L. GO / NO-GO

## 🔴 NO-GO on 0C.3b. Confirmed and unchanged.

## Recommended verdicts, per item

| Item | Verdict | Note |
|---|---|---|
| **J3 — stop presenting wellbeing as measurement** | 🟢 **GO first** | Deletes fabricated sentences from a mentor brief. No schema change, no migration, no student-visible number changes that were ever true. |
| **J2 — retire burnout + sleep flags** | 🟢 GO | Never fired. Retirement cannot affect any student. Pair with an explicit note that wellbeing detection is now an open gap (K-A4). |
| **J1 — stop the RPC asserting wellbeing** | 🟡 GO **only with J3** | Alone it swaps one fabricated value for another (K-A1). |
| **K4 / J5 — transactional `day_outcome`** | 🟡 HOLD | Right change, wrong order. Needs D ruled first, or we atomically commit semantics we have not agreed. |
| **D — state model** | 🔵 **DECISION, no code** | Three of five states representable. `REST`/`NOT_RECORDED` need schema. |
| **Nullable-column migration** | 🔴 **NO-GO** | 64-file blast radius; `NaN` would silently disable the surviving flags (K-A2). Consumer sweep must land first. |
| **Historical backfill** | 🔴 **NO-GO** | Would invent values never collected. Recommend leaving history marked, not rewritten. |
| **Distress chip** | separate | `docs/DISTRESS-CHIP-UX-ISSUE.md` — investigated only, not started. |

## The one thing I would do first

**J3.** Not because it is the biggest finding, but because it is the only one
where a real person acts on a fabricated number today: a mentor is told
*"avg confidence 4/5, avg stress 2/5"* before a paid session, and neither
number came from the student. It is fixed by removing a sentence.

Everything else is future correctness, and future correctness can wait for the
ruling it needs.

---

**STOP.** No code. No migration. No fact. No rule. No consumer change.
0C.3b remains blocked pending review of this report.
