# The self-prep student's plan: today to CAT day — research before building

Founder, 8 Aug: the one-month plan is for coaching students only. A student
preparing through our app should get a plan from **today to CAT day**, built
properly and consistent A to Z, with a button to see the whole thing — today,
and a month from now. Revision must be part of it, and **one complete mock
every week, without any second thought.** But research first: when does a
normal CAT aspirant on a six-to-seven-month run start revision, and when do
they start mocks?

No code was written for this document.

---

## 0. Scope, confirmed in the code first

The month plan is already coaching-only. All four call sites are gated:

```
api/routine/today:200   plan_source === 'coaching'
lib/routine-plan:271    plan_source === 'coaching'
api/timetable/route     only reached by uploading a sheet
cron/timetable-horizon  only iterates student_timetables rows
```

256 of our 258 students read `plan_source = 'careerrai'`. **This document is
about those 256.**

## 0.1 The runway, today

```
CAT 2026        Sunday 29 November   (last Sunday of November)
Today           8 August
Runway          113 days · 16.1 weeks
```

---

## PART 1 — What the outside world actually says

Six sources, and they agree more than they disagree.

### Mocks: when to start

| Source | Start | Ramp |
|---|---|---|
| MBAUniverse / CATKing | 3–4 months out | increase as exam nears |
| Cracku (6-month plan) | 1–2 per **month** at 6–5 months out | 1 per **week** from 4–2 months out |
| iQuanta / IMS (last-2-months) | — | **2 per week through October**, **3 per week in November** |

**We are 3.7 months out. Every source puts us past the start line already** —
weekly is the floor from here, not the ambition.

### Mocks: how many

- Experts/toppers: **20–40** full-length mocks
- Careers360 / Collegedunia: *"nobody who cracked a top IIM did it on fewer
  than 20; most serious 99%ilers were in the **40–70** range"*
- Career Launcher sells 30 + 15 countdown mocks; IMS sells 40 SimCATs

### Mocks: the analysis is the work

Consistent across every source, and it is the number most students get wrong:

> *"Spend at least twice the exam duration reviewing your performance."*
> Toppers report **4 hours of analysis per 2-hour mock**.
> *"The analysis of one mock is worth more than attempting three without review."*

**Our model already prices a mock at 4 hours** (`MOCK_HOURS_EACH = 4`, 2h exam
+ ~2h analysis). That was right and matches the research exactly.

### Revision: when

- Six-month plans split **2 months concepts / 2 months practice / 2 months
  revision + self-testing**
- *"Start revision at least 2 months before the exam"*
- Spaced repetition at **Day 1, 3, 7, 14**
- Retrieval practice (testing yourself) beats re-reading — this is the
  strongest claim in the literature and the most ignored in practice
- **No new topics in the last month.** November = mocks, revision, and
  strengthening what is already strong

---

## PART 2 — What we already have, and it is more than I expected

### Revision: we have a real engine, and it is better than a calendar

`TOPIC_METADATA` carries `revisionFrequencyDays` for **all 46 topics**:

```
3 days: 1 topic    6 days: 20 topics    8 days: 3
4 days: 2          7 days: 13          10 days: 1
5 days: 6
```

`prep-memory` marks a topic overdue when
`daysSinceLastTouched > revisionFrequencyDays × archetypeRevisionMultiplier`
(**0.7 repeater**, **1.4 working professional**).

That is genuine per-topic spaced repetition, tuned per student — **stronger
than the Day 1/3/7/14 fixed ladder the coaching blogs recommend**, because it
keys off when the student actually last touched the topic rather than a
generic schedule. Nothing here needs rebuilding. It needs **surfacing**: today
a student cannot see what is due, only feel it through topic ordering.

### Phases: broadly already right

`getPhase()` gives foundation → **intensive (Sep–Oct)** → **revision (Nov, to
exam day)**, and `revisionSeason` turns on 1 September. That matches the
research's two-month revision window almost exactly.

### Mocks: this is where we are wrong

```ts
recommendedMockCount(remaining) = clamp(round(remaining / 33), 4, 15)
```

**A count, with no calendar, capped at 15.**

Three separate problems:

1. **The cap is far too low.** 15 against a research floor of 20 and a 99%ile
   range of 40–70. A student following us to the letter would arrive at CAT
   having taken fewer mocks than anyone who has ever cracked a top IIM.
2. **There is no schedule.** Nothing anywhere says "your next mock is Sunday
   the 16th". The only mock timing in the engine is a weekday/weekend rule for
   working professionals.
3. **It scales with syllabus left, which is backwards near the exam.** As
   remaining hours fall, the recommended mock count falls — exactly when the
   research says mocks should be ramping to 3 a week.

---

## PART 3 — The arithmetic nobody has done yet

This is the part I think matters most, and it is uncomfortable.

Mocks on the research ramp (1/wk now, 2/wk in October, 3/wk in November) over
our 16.1 weeks:

```
  7.6 weeks × 1  +  4.4 weeks × 2  +  4.1 weeks × 3   =  29 mocks
  29 mocks × 4h                                       = 116 hours
  397h syllabus + 116h mocks                          = 513 hours
  513 hours ÷ 113 days                                = 4.5 h/day, every day, no rest
```

| Their self-study hours | Days needed | Verdict |
|---|---|---|
| 3 h/day | 171 | **misses CAT by 58 days** |
| 4 h/day | 128 | **misses by 15 days** |
| 5 h/day | 103 | fits |
| 6 h/day | 86 | fits, 28 days spare |
| 8 h/day | 64 | comfortable |

**A first-attempt self-prep student starting today at 4 hours a day cannot
finish the full syllabus AND the mock schedule before CAT.** That is not a
reason to hide the number. It is the single most valuable thing we can tell
them on day one, while there is still time to do something about it — raise
hours, cut scope, or move to CAT 2027.

Two things soften it, and both are real:
- Most students are not starting from zero — coverage status cuts the 397h
- A repeater at 88th percentile faces 258h, not 397h → **fits at 4h/day**

Which is exactly why the plan screen must compute this **per student**, not
print a generic calendar.

---

## PART 4 — What I propose to build

### 4.1 The plan, today to CAT day

Not a fixed 46-topic list — a **date-anchored schedule** built from the same
engines that already run the day, so the long view and tomorrow morning can
never disagree:

```
  today ──────────── 1 Nov ─────── 29 Nov
  │   BUILD          │  REVISION    │  MOCKS + STRONG AREAS
  │   new topics     │  no new      │  no new material
  │   weekly mock    │  2 mocks/wk  │  3 mocks/wk
```

Phase boundaries come from `getPhase()` (already Sep/Oct intensive, Nov
revision), so no new opinion is introduced.

### 4.2 The button — "My plan to CAT day"

A calendar the student can scroll:

- **Today** — the real plan they already see on Home
- **This week** — day by day, with the mock slot visible
- **Week by week to CAT** — topics scheduled, revision days marked, one mock
  slot per week minimum
- **A verdict at the top**, computed not decorated: *"At 4h/day you finish the
  syllabus 15 days after CAT. At 5h you finish 10 days before."*

`buildWeekPlan` already lays topics into days honestly (capacity-filled,
prerequisite-aware, effort-scaled). Extending it from 7 days to the full
runway is the smallest honest version of this.

### 4.3 Mocks: the weekly slot, ramping

Your rule — one complete mock every week, no second thought — becomes the
**floor**, and the research adds a ramp above it:

| Period | Mocks/week | Source |
|---|---|---|
| Now → 30 Sep | **1** | your rule; Cracku's 4–2-month band |
| October | **2** | iQuanta, IMS |
| November | **3** | iQuanta, IMS |

Total ≈ 29, landing inside the 20–40 expert band. Each priced at 4 hours, and
**the analysis half is scheduled as its own task the next day** — because
every source says the analysis is where the improvement is, and an unscheduled
4-hour job does not happen.

`recommendedMockCount`'s cap of 15 gets replaced by this calendar.

### 4.4 Revision: surface what we already compute

No new engine. Show `revisionOverdue` as a real queue, put spaced-revision days
on the calendar, and enforce the research's one hard rule: **from 1 November,
no new topics are scheduled** — only revision, mocks, and strengthening.

---

## The three decisions

1. **The mock ramp.** I propose weekly now → 2/week in October → 3/week in
   November (≈29 total). Your instruction was weekly minimum; the ramp goes
   above it near the exam. Approve, or hold it flat at one a week?

2. **When the plan says a date is impossible.** A 4h/day first-timer starting
   today misses CAT by 15 days on the arithmetic above. Do we (a) show it
   plainly on the plan screen with the two fixes next to it — raise hours or
   cut scope — or (b) silently cut low-weightage topics until it fits and show
   a plan that works? I strongly recommend (a); (b) is how a planner starts
   lying.

3. **Mock analysis as a scheduled task.** Every source says analysis > volume.
   Do we schedule the 2-hour analysis block the day after each mock, as its own
   task? It makes the plan visibly heavier, and it is the single highest-value
   thing in the research.

---

## Sources

- [MBAUniverse — CAT 2026 preparation](https://www.mbauniverse.com/cat/preparation)
- [MBAUniverse — 10 CAT toppers on using mock tests](https://www.mbauniverse.com/article/id/7136)
- [Cracku — CAT 6-month preparation strategy](https://cracku.in/cat-6-months-preparation-strategy-2025/)
- [iQuanta — CAT 2-month strategy](https://www.iquanta.in/blog/cat-2-months-strategy/)
- [iQuanta — how to analyse CAT mocks](https://www.iquanta.in/blog/how-to-analyze-cat-mocks/)
- [IMS — preparing for CAT in 2 months](https://www.imsindia.com/blog/cat/preparing-for-cat-exam-in-2-months/)
- [Collegedunia — how toppers take 40+ mocks](https://collegedunia.com/news/e-242-cat-2025-mock-test-strategy)
- [Careers360 — how toppers prepared for CAT](https://bschool.careers360.com/articles/how-toppers-prepared-for-cat)
- [Career Launcher — CAT test series](https://www.careerlauncher.com/cat-mba/testseries/)
- [IMS — CAT test series (SimCAT)](https://www.imsindia.com/programs/cat/test-series/)
