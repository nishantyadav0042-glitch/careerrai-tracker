# Plan Engine — Consistency Validation Sheet

Developer-facing. Every number a student sees must trace back to ONE deterministic
formula on this sheet. No magic numbers; if a constant isn't here, it's a bug.

## 1. Topic hours (the base currency)

- Source of truth: `TOPIC_METADATA[topic].estimatedHours` (topics-constants.ts) —
  curated per topic, hours from zero to working competency (concept + practice +
  first revisions folded in). 46 exam topics.
- Totals: VARC 106h · DILR 92h · QA 199h · **total 397h** (benchmark for serious
  CAT prep: ~350–450h ✓).

## 2. Remaining work per topic

`remaining(topic) = estimatedHours × REMAINING_FRACTION[status]` (study-pace.ts)

| status      | fraction left | meaning                              |
|-------------|--------------:|--------------------------------------|
| not_started | 1.00          | everything ahead                     |
| learning    | 0.65          | concepts open; bulk of practice left |
| practicing  | 0.35          | needs volume + first revision        |
| revising    | 0.15          | retention work                       |
| exam_ready  | 0.05          | upkeep only                          |

≈ concept 35% / practice 50% / revision 15% — the standard planner split.

## 3. Remaining syllabus hours

`remainingSyllabusHours(rows) = Σ over ALL 46 topics of remaining(topic)`,
missing/unmapped topics default to not_started (never silently "done").

Count-based approximation (for callers holding counts, not statuses —
blueprint-builder.ts): per-unit constants are **derived** from the same model:
`AVG_UNIT_HOURS = totalSyllabusHours() / 46 ≈ 8.6h`, then × the fraction table.
They can never drift from the curated model again (this was the 230h-vs-397h bug).

## 4. Mock budget

A full CAT mock = **4h** (2h exam + 1.5–2h honest analysis), `MOCK_HOURS_EACH`.

`recommendedMockCount(remaining) = clamp(round(remaining / 33), 4, 15)`
(~1 full mock per ~33 syllabus hours ≈ every 1.5–2 weeks at typical pace;
floor 4 — even a nearly-done student needs a final mock block; cap 15.)

`remainingMockHours = count × 4`.

## 5. The daily-hours requirement (THE formula)

`requiredPerDay = (remainingSyllabusHours + remainingMockHours) / daysToTarget`
rounded to nearest 0.5h; recomputed fresh daily from actual coverage.
- Missed days ⇒ numerator unchanged, denominator shrinks ⇒ number rises (catch-up).
- Extra study ⇒ numerator falls faster ⇒ number falls (roll-over buffer).
- `> 12h/day` ⇒ status "unrealistic" (renegotiate the date, never pretend).

Consumers — ALL use this exact formula, same inputs:
1. Pre-signup finish-date chooser (`screen-finish-date.tsx`)
2. Post-signup date reconciliation (`student/layout.tsx` → PostSignupSequence)
3. Date reschedule API (`/api/student/post-signup`)
4. Home ring / today's plan size (`/api/routine/today` → paceHours)
5. Tracker pace strip (`student/tracker` → computeRequiredPace(mockHours))

Completed % is measured on SYLLABUS hours only (mock hours don't inflate mastery).

## 6. Daily plan internals

- Question pacing: **3 min/question** (`questionTarget`); foundation days split
  ⅓ concept / ⅔ practice within the weak-section task.
- Day shape: weak section ≈40% of minutes, other two sections split the rest,
  plus a phase-dependent closing task (mock analysis / sectional / recall,
  ~15%, min 15–20m).
- Archetype revision multiplier (`archetypeRevisionMultiplier`): repeater
  tightens every topic's revisionFrequencyDays (<1), working professional
  loosens (>1). Applied identically in the selector, mission engine, and
  revision-due checks.

## 7. Topic Selector (which topic, today)

Additive score; winner's contributors ARE the explanation shown to the student:
`score = coveragePoints (2–30) + weightage×3 (3–15) + revisionOverdue×3 (0–30)
       − unmetPrereq (18) + selfReportedWeak (12) + startWithCluster (22)
       + priorityStar (25, dormant UI) + postponedFromYesterday (40)`

Invariants:
- `postponed (40)` beats everything a fresh topic can muster ⇒ a swapped-out
  topic returns next day. Never delete, always postpone.
- `startWith (22)` < `not_started coverage (30)` gap to prereq penalty ⇒
  focus bias can never override an unmet prerequisite chain.

## 8. Integration chain (what updates what)

One source of truth: `topic_coverage` + `daily_routines` + `daily_reports`.

| Event                     | Must update (all read the same rows — nothing cached across days) |
|---------------------------|--------------------------------------------------------------------|
| Complete task + confidence | coverage status (`applyConfidenceSignal`) → remaining hours → ring, tomorrow's plan, revision-due, prep-memory, blueprint %, buddy dashboard views |
| Swap today's topic        | today's task only + `swapped_out` queue; coverage/hours UNCHANGED (a swap is not progress) |
| Change target date        | study_target_hours re-derived (formula 5) → ring, plan size, chooser all agree |
| Star / Start-with         | ordering bias only; totals and dates unchanged |
| Log a day                 | streak, reports, notifications state machine |

The 30s client cache on /api/routine/today is busted on every completion/swap.

## 9. Not yet modeled (accepted, on the roadmap)

- Per-topic 4-way decomposition (concept/practice/revision/test as separate
  stored numbers) — currently folded into estimatedHours + fraction table.
- Decreasing revision cost (rev1 30m → rev2 20m → rev3 15m).
- Deterministic per-student adaptation (repeated "need more time" ⇒ +20% that
  student's future estimates; faster ⇒ −10%).
- Completion-gated mock cadence (<40% sectionals only; 40–70% alternate;
  70%+ weekly; 90%+ twice weekly) — count exists (formula 4), cadence next.
- Hours→calendar surfacing ("syllabus finishes ~8 Oct; mocks begin ~14 Sep").
