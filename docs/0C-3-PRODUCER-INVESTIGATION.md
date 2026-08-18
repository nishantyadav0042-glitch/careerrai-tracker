# 0C.3 — Producer Investigation (read-only)

**18 Aug 2026. NO CODE. No file modified, nothing migrated, no rule created.**

Ordered before 0C.3a to answer one question: are the three producers genuinely duplicates,
and can `log-insight.ts` safely become the registry's first consumer?

---

# PART 1 — EXECUTIVE VERDICT

**0C.3a is NOT ready.** Not because the architecture is wrong — it is sound — but because
**the Fact Registry cannot reproduce `log-insight.ts`'s output, and the reason is my
error in 0C.2.**

> `log-insight.ts` counts topics with **`isOpened`** (learning and beyond).
> Every registry coverage fact counts with **`isCovered`** (practicing and beyond).

These are two different rungs of the same ladder. A student with a topic at `learning` is
**opened but not covered**. Migrating `log-insight.ts` onto the current registry would
change every number it displays — a semantic change disguised as a migration, which is
precisely what the migration contract forbids.

**The Constitution already anticipated this and I did not follow it.** Ruling S4:
*"'Covered' means isCovered (practicing+). 'Opened' means isOpened (learning+). They are
different bars and may never share a fact key."* I registered the covered family and then
nominated as first consumer a producer that speaks the opened family.

**What must happen first:** register three opened-family facts. This is an addition the
Constitution already permits, not a redesign.

**What must NOT happen yet:** any migration; any change to `log-insight.ts`'s output; any
retirement of `daily-insight.ts` (see Part 3 — it is not what it looks like).

---

# PART 2 — PRODUCER MAP

Runtime paths verified by reading the render/dispatch sites, not by imports.

| Producer | Calculates | Actual consumers (verified) | Semantic identity | Duplicate? | Registry fact? | Recommendation |
|---|---|---|---|---|---|---|
| **`log-insight.ts`** | section/whole-syllabus **opened** counts + %; untouched; revision-depth; logged-days consistency | `log-daily` response → `PlanRebuildPayoff.noticed`; also `check-in-gate` | "state of the map, right after a log" | **Partly** | ❌ opened-family missing | **Migrate — after the opened facts exist** |
| **`computePrescriptiveLine`** (`log-daily/route.ts:275`) | 6 behavioural rules: first-log, emotional chips, consistency (7 rows), section avoidance (row-count), mock gap, single-section run | same slot, ranked **above** log-insight | "behavioural noticing" | Overlaps on consistency only | ❌ (rules, not facts) | Split: facts → registry, thresholds → rules. **0C.3b** |
| **`daily-insight.ts`** | 6 kinds — see Part 3 | `InsightBubble` on Home (`tracker/page.tsx:587`) **and** `dispatch()` push via cron (229 sends/14d) | mixed — see Part 3 | **Partly** | Partly | **Split, do not retire.** 0C.3c |

Note the two producers feeding **one slot**: `computePrescriptiveLine` wins, `log-insight`
is its fallback. That is already a priority rule living in an `if`, not in a registry.

---

# PART 3 — DAILY-INSIGHT VERDICT: **C (mixture)**

Decided on semantics and consumers, not code similarity. Evidence per kind:

| # | Kind | What it actually computes | Registry overlap | Verdict |
|---|---|---|---|---|
| 1 | `recovery` | same topic marked **red** then later **green** in `routine_task_completions.confidence` | none — the registry has no confidence-signal fact | **UNIQUE** |
| 2 | `avoidance` | section served ≥3 tasks, <34% completed, 14d | deliberately excluded (Constitution B5 — an INTERPRETATION) | **UNIQUE as a rule**, needs facts it doesn't have |
| 3 | `high_weightage` | untouched topics with `weightage ≥ 4`, ranked by weightage | none — weightage excluded (S3) | **UNIQUE** |
| 4 | `revision` | `revisionOverdue && isCovered`, ranked by staleness | none — no revision-due fact | **UNIQUE** |
| 5 | `consistency` | `last5 ≥ 4` logged days | overlaps `logged_days_last_7` — **but see below** | **NEAR-DUPLICATE, different window** |
| 6 | `progress` | `finished = topicMemory.filter(isCovered).length`, `remaining = 46 − finished` | **exactly `syllabus_coverage_units`** and its complement | **TRUE DUPLICATE** |

**Two defects found inside kinds 5 and 6:**

**5 — a 6-day window labelled "5".** `Date.now() − 5×86_400_000` sliced to a date, then
`d >= that` — inclusive on both ends, so the window is `today−5 … today` = **six calendar
days**, and the student is told *"N of the last 5 days studied."* Same off-by-one family as
the 8-day `last 7` producers in `0C-DISCOVERY.md`.

**6 — UNKNOWN silently becomes a claim.** `computeTopicMemory` defaults a topic with no
row to `'not_started'` (`prep-memory.ts:330`). So for the **47 students with no coverage
rows at all**, kind 6 renders *"0 topics done, 46 to go"* — presenting absence of evidence
as a measured zero. This is risk N from the architecture review, live in production today.

**Conclusion: retiring `daily-insight.ts` would delete four genuinely unique semantic
producers to remove one duplicate.** Kind 6 is the duplicate. Kind 5 is a near-duplicate
with a wrong window. Kinds 1, 3, 4 exist nowhere else and are the most interesting claims
the product currently makes.

---

# PART 4 — LOG-INSIGHT MIGRATION PLAN

**Not safe yet.** The mapping, output by output:

| log-insight output | Formula today | Registry fact | Same meaning? |
|---|---|---|---|
| *"Just N QA topics left untouched"* | `!isOpened` count in section | `section_topics_remaining` (`!isCovered`) | ❌ **NO** — different rung |
| *"Every VARC topic is opened…"* | `untouched === 0` via `isOpened` | — | ❌ no opened fact |
| *"…N at revision depth"* | `isAtRevisionDepth` count | — | ❌ no depth fact |
| *"QA: 12 of 28 topics opened — 43%"* | `isOpened` / section total | `section_coverage_units` (`isCovered`) | ❌ **NO** |
| *"Across the syllabus: N of 46 opened"* | `isOpened` / 46 | `syllabus_coverage_pct` (`isCovered`) | ❌ **NO** |
| *"Rest day counted — N of the last 7 days"* | distinct dates, 7-day window | `logged_days_last_7` | ✅ **YES** — identical |
| *"…N logged days on record"* | total distinct dates | — | ❌ no lifetime fact |
| empty coverage → falls through to day-count | `tally.total === 0` rungs skipped | registry returns UNKNOWN | ✅ **compatible** — both decline |

**One of eight maps cleanly.** The rest need facts that do not exist.

**Required before 0C.3a — three additions, all permitted by Constitution S4:**
- `syllabus_opened_units` — topics at `isOpened`, universe 46
- `section_opened_units` — same, section-parameterised
- `section_untouched_units` — `!isOpened` within a section

Plus, for the two remaining lines, a decision: `section_at_depth_units`
(`isAtRevisionDepth`) and `logged_days_total`. Both are clean; neither is currently
registered because in 0C.2.1 I judged them to have no Phase-1 consumer. **They do — this
one.**

**Migration boundary, when it happens:** `log-insight.ts` keeps its five rungs, its
ordering, its copy, its rest-day branch and its fallback chain. Only the *counting* moves.
The function signature keeps taking rows; the route keeps fetching. Nothing else changes.

**Acceptance:** for a sample of real students, old and new produce **byte-identical
strings**. Any divergence stops the migration — the fact definition is not adjusted to
make the old output reappear.

---

# PART 5 — ARCHITECTURE ATTACK

Attacks attempted against the review's proposals. **Three succeed.**

### ✅ Survives
- **Non-persisted L1/L2** vs double tap, refresh, retry, concurrent request, multi-device,
  offline replay: pure functions of current state return identical answers. Nothing to
  duplicate.
- **Event / claim / insight / delivery identities** vs dedup, suppression, supersession,
  invalidation, multi-surface: no counterexample found.
- **SILENCE as an outcome**: rules decline explicitly instead of degrading.

### ❌ Attacks that succeed

**A1 — Non-persistence breaks *historical auditability*.** The review claims deliveries in
`student_events` preserve measurement. They preserve *that* something was shown, not
*what*. If a student asks in October *"why did CareerRai say 24% in August?"*, and L1 was
never stored, the answer must be recomputed from **today's** coverage — which has moved.
**The claim is unreconstructable.** Options: store the rendered claim on the delivery event
(cheap, append-only, no lifecycle), or accept that L1 history is not auditable. This needs
a decision; it is not free.

**A2 — Non-persistence cannot express cooldown at L2.** The review assigns cooldown to L3+
only. But L2 progress (*"+3 topics this week"*) will repeat every day the week's number is
unchanged. Without stored state there is no way to know it was already said. Either L2
gains state (contradicting the rule) or L2 must be *recomputable-idempotent* — i.e. only
shown when the underlying number **changed since the last log**, which requires… the
previous value. **The rule as stated is incomplete.**

**A3 — Tap/full-log: the combined insight can still contradict a tap.** The review argues
they cannot contradict because neither is stored. False. Taps read state mid-interaction;
the combined reads final state. Tap 1 may truthfully say *"3 QA topics left"*; after two
more ticks the combined truthfully says *"1 QA topic left"*. Both true, **visibly
inconsistent within one interaction**. Not a correctness bug — a trust bug, and the
founder's Law 5 (tap and combined must never contradict) is violated. **Mitigation
required:** the combined must either restate at a different granularity (day-level, not
topic-count) or explicitly supersede with *"after today: 1 left"*.

---

# PART 6 — REQUIRED GUARDS

Beyond the 24 already specified:

25. **Opened vs covered may never share a producer** — a fact keyed `*_opened_*` must use
    `isOpened`; `*_coverage_*` must use `isCovered`. Source-level.
26. **No producer may default a missing row to a status** — the `?? 'not_started'` pattern
    that turns UNKNOWN into a claim (`prep-memory.ts:330`) must be impossible inside
    `facts/`.
27. **Window labels must match window arithmetic** — a fact whose meaning says "5 days"
    must compute a 5-day window. Catches both the 6-labelled-5 and 8-labelled-7 families.
28. **Migration parity** — during any producer migration, a test asserts old and new
    outputs are byte-identical over a fixture corpus.

---

# PART 7 — RISKS

| # | Risk | Class |
|---|---|---|
| 1 | `daily-insight` kind 6 shows *"0 topics done"* to 47 students with no evidence | **P0** — presents absence as measurement |
| 2 | Migrating log-insight onto covered-family facts would silently change every displayed number | **P0** — averted by this investigation |
| 3 | `daily-insight` kind 5's 6-day window labelled "5 days" | **P1** |
| 4 | Two producers feed one slot with priority encoded in an `if` | **P1** |
| 5 | A1 — L1 claims unreconstructable after the fact | **P1** |
| 6 | A2 — L2 cooldown unexpressible without state | **P1** |
| 7 | A3 — tap/combined visibly inconsistent within one interaction | **P1** |
| 8 | Delivery telemetry growth at 1M students | **P2** |
| 9 | Weightage, revision-due, confidence-signal facts unregistered (blocks kinds 1/3/4) | **P3** |

---

# PART 8 — FINAL GATE

## 🟡 YELLOW

The architecture is sound. The blocker is a **registry gap I created**, plus three attacks
that need rulings.

**Required before 0C.3a:**
1. Approve three opened-family facts (`syllabus_opened_units`, `section_opened_units`,
   `section_untouched_units`) plus `section_at_depth_units` and `logged_days_total`.
   Constitution S4 already requires them to be separate keys.
2. Rule on **A1**: store the rendered claim on the delivery event, or accept that L1
   history is not auditable.
3. Rule on **A2**: does L2 gain state, or is it shown only on change?
4. Rule on **A3**: how the combined insight avoids visibly contradicting a tap.

**Not blocking 0C.3a, but needs a decision soon:** `daily-insight.ts` is **split, not
retired** — kind 6 migrates, kind 5 gets its window fixed, kinds 1/3/4 stay and eventually
need their own facts.

---

**STOP.** No code written. No file modified. 0C.3a not started.
