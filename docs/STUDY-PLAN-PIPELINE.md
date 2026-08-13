# How a student's study plan is built — A to Z

**Written 13 Aug 2026 for the founder's audit.** Every claim below is read
from the live code, with the file named so you (or anyone) can verify it.
This is the complete pipeline: every input, every rule, every priority order,
and where each signal can and cannot reach.

The one-line architecture: **one engine for every student, coefficients per
archetype** — never a separate codebase per student type
(`src/lib/routine-engine.ts`).

---

## A. The inputs — everything the plan can ever know

| Input | Where it comes from | Where it's stored |
|---|---|---|
| Daily hours (weekday + weekend) | Student sets at onboarding / reschedule. **Never changed by us** (founder rule, 6 Aug) | `profiles.hours_available`, `weekend_hours_available` via `lib/daily-hours.ts` |
| Syllabus finish date | Student sets; renegotiated only BY them via Reschedule | `profiles.syllabus_target_date` |
| Archetype | Onboarding: working professional? repeater? | `profiles.is_working_professional`, `is_repeater` |
| Coverage grid (53 rows × status) | Blueprint Builder at onboarding; weekly review; task ticks | `topic_coverage` (status: not_started → learning → practicing → revising → exam_ready) |
| Weakest/strongest section | See section C — a 5-link chain | derived per request |
| Current stage | One tap: "just starting / already practicing / mock-testing" | `profiles.current_stage` |
| Biggest blocker | One tap at onboarding, required | `profiles.biggest_blocker` |
| Coaching timetable | Uploaded photo → parsed blocks | `student_timetables` |
| What actually happened | Daily ticks, half/full portions, busy days, off-plan logs | `daily_reports`, `routine_task_completions` |
| **Mock results** | Score sheet in the daily log | `mock_debriefs` (per-section percentiles, error buckets) |
| Baseline mock (if any) | Onboarding | `profiles.baseline_varc/dilr/qa` |

### A.1 The topic counts, settled (audit, 13 Aug)

Three different numbers are all correct, for three different things — this is
the answer to "43 or 46 or 53?":

| Number | What it is |
|---|---|
| **46** | **Syllabus topics the planner can schedule** — QA 28 + VARC 9 + DILR 9. This is `TOPIC_METADATA`, and the coverage ring is computed over exactly these. |
| **53** | Coverage rows seeded per student — the 46 above **plus 7 habit rows** (MOCKS: Sectional Tests, Full Length Mocks, Mock Analysis, Error Log; READING: Daily Editorials, Business & Economy Reading, Long-form Reading). Tracked, never scheduled as topics. |
| **45** | Units actually tapped during onboarding — QA is trimmed to its 22 highest-value topics there; the other 6 stay markable in the Analysis matrix. Un-asked topics default to `not_started`. |

Verified against the live database, not assumed. `topic-taxonomy.guard.test.ts`
pins all three counts plus the consistency rules (no duplicates, no orphans, no
dangling or cyclic prerequisites, every syllabus topic seeded and plannable).

## B. The phase — what season of prep it is

`getPhase()` in `routine-engine.ts:119`. Calendar first: **November = revision,
Sep–Oct = intensive, everything before = foundation.** Then two advance-only
overrides — the phase can be pulled FORWARD, never pushed back:
- `current_stage` (a student already mock-testing in July is treated as
  intensive, not foundation)
- repeaters have a phase floor (they never restart at foundation)

## C. The focus — which section leads every single day

The weakest-section chain, in priority order (`api/routine/today/route.ts`):

1. **Measured mock performance** *(added 13 Aug — this was your audit
   finding, it was missing)*: the most recent `mock_debriefs` row that is
   **complete** (all 3 sections), **recent** (≤45 days), and **decisive**
   (weakest trails the next section by ≥3 percentile points). Evidence beats
   memory. `lib/mock-informed-focus.ts`.
2. Self-reported weakest section (legacy accounts that answered the old tap)
3. Onboarding baseline mock scores (lowest of the three)
4. Derived from the Coverage grid (most red/untouched)
5. Deterministic default: DILR

**Never silent**: when link 1 decides, the plan card shows *"Built from your
mock — Your last mock (VARC 89 · DILR 99 · QA 99) — VARC needs the work"*.
The line renders only from the first plan generated AFTER the mock was
entered — it never claims credit on a plan frozen before the score existed.

## D. The day's shape — how hours become blocks

`dayShape()` in `routine-engine.ts:357`. In order:

1. **Total = the student's own hours.** No pace-demand, no capacity shrink,
   no volume factor — all three layers were removed (founder, 6 Aug: "don't
   change the hours on your own"). Falling behind moves the FINISH DATE via
   the weekly reconcile cron, never the day's size.
2. **Small-day law**: ≤45 min → ONE task (weak section only); ≤75 min → two.
   One finishable task is a won day; three tasks in 30 minutes is three ways
   to feel behind. Small days never get mocks or closers — a 30-minute
   student cannot sit a 2-hour mock, and shrinking the mock would schedule
   a lie.
3. **Working-professional lean weekday**: weak section + ONE other (not all
   three); the full spread and the real mock wait for the weekend.
4. **Closer carve-out**: intensive/revision phases (and repeater-foundation)
   end the day with a closing task (sectional mock / mock analysis / rapid
   recall) worth ~15% of the day, **carved out of** the budget, never added
   on top (audit finding A-5, fixed 8 Aug).
5. **Weak section leads** with 40% of topic time (55% on lean/small days);
   the priority task absorbs rounding so planned time = committed time,
   exactly.
6. Caps: no topic block over 120 min (Abhishek, 11 Aug); max 3 blocks/section.

## E. The calendar — mocks and revision as first-class blocks

`exam-calendar.ts`: one full mock per week (2h sit) + next-day analysis
block (1h), from 1 Aug of the exam year; revision season from 1 Sep. These
land as tasks in the plan itself ("Full mock — exam conditions"), and only on
days big enough to hold them (see D.2). The mock task carries the
**"Add mock score"** button; once the debrief exists it shows
**"✓ 99%ile saved →"** linking to the mock history.

## F. Which topic, inside each section

`topic-selector.ts` + `day-topics.ts` — additive scoring, never a hard rule:

- **Coverage status**: in-progress (learning/practicing) topics lead; new
  topics enter by weightage; exam_ready topics return only via revision-due
- **Weightage** (syllabus emphasis within its section) × 8 — the primary
  driver for untouched topics
- **Unmet prerequisite**: −18 (deprioritised, never excluded — Percentages
  before Profit & Loss)
- **Revision-due**: each touched topic has a cadence; overdue ones resurface.
  Cadence × archetype: repeaters 0.7× (relearn/forget faster), working
  professionals 1.4× (scarcer time, slower staleness)
- **Confidence taps** (the 🟢🔵🟡🔴 after each task): green advances the
  topic's status, blue advances but caps below revision-ready, yellow holds,
  red regresses — so tomorrow's selection feels yesterday's tap
- **Coaching timetable**: today's class topics get a steady bias (+45), so
  the app plans WITH the coaching, not against it
- **Student's swap**: any topic can be swapped for a same-section alternative;
  the displaced topic auto-returns tomorrow (never deleted, always postponed)

## G. What yesterday does to today

`buildHistory()` (14-day lookback) + `plan-reason.ts`:
- Unfinished topics from yesterday lead today ("Geometry first — it didn't
  get finished yesterday" — rendered only when TRUE)
- Missed days: the plan silently adjusts, the card says "your plan has
  already adjusted — only today matters" (never guilt)
- Busy day / didn't study: an honest recorded outcome, not a broken streak
  hack; feeds `day_outcome` which the because-line reads
- Repeated "too much" calibration taps and low completion are **observed**
  (surfaced to coaches) but no longer resize the plan automatically

## H. Where mock scores now flow (the connection you asked for)

One mock entry (3 hours + percentiles) now reaches:
1. **The plan's focus** — section C link 1 (new today)
2. **The plan card's why-line** — "Built from your mock …" (new today)
3. **Mock task's saved-proof chip** — "✓ 99%ile saved →" (new today)
4. **Mock summary/history** — `/student/analysis?tab=mocks` (existing):
   every debrief with section percentiles, error buckets, trend
5. **Pending-analysis nudge** — a mock logged without a debrief triggers
   "analyse your mock" in the Mission (existing)
6. **Buddy escalation** — a percentile drop alerts the buddy pipeline
   (existing, `mock_drop_alerts`)

## Known honest limits (audit these too)

- The plan regenerates **daily at first open**, not mid-day: a mock entered
  tonight steers tomorrow's plan, not today's frozen one. Deliberate — see C.
- A mock with only 1–2 section percentiles filled steers nothing (can't rank
  what wasn't measured). The sheet should nudge for all three.
- Focus never flips on a near-tie (<3 %ile gap) — stability beats
  reactivity; a plan that changes focus every mock teaches students to
  ignore the focus.
- Error buckets (silly/time/panic/conceptual) are stored and shown but do
  NOT yet steer topic selection — a real future lever: "time" errors could
  bias toward timed sectionals, "conceptual" toward relearning blocks.
