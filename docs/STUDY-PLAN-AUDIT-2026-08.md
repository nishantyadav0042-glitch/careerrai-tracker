# Study Plan Audit — can CareerRai finish the syllabus?

**8 Aug 2026.** Zero-assumption audit of the core promise. Every number below
was produced by running the **shipped engine** — `generateRoutine`,
`chooseTopicForSection`, `applyConfidenceSignal`, `remainingSyllabusHours` —
against simulated students, day by day. Nothing here is estimated. The harness
is committed at `src/lib/study-plan-audit.test.ts` and re-runs in CI.

---

## Executive verdict

> **Can CareerRai genuinely claim "every student's study plan is personalized"?**
>
> **The daily plan is personalized. The syllabus journey is not — and does not
> complete.** The claim as written is not currently true.

The engine builds a well-reasoned, legible, honest **day**. It does not build a
**course**. It picks the best topic for today, every day, with no memory of what
the student still needs to be taught — so it converges on a small set of
high-weightage topics and repeats them indefinitely.

**Measured, on the shipped engine:**

| Test | Result |
|---|---|
| Topics taught in 365 days of perfect adherence | **13 of 46** |
| Topics never taught even once in a year | **33** |
| Syllabus hours still outstanding after that year | **276h of 397h** |
| Distinct VARC topics in a year | **2** |
| Day the whole syllabus is first covered | **never** |
| Best completion % the app can ever display | **85%** (95% with evidence) |

**Answer to the primary question — "if a student follows CareerRai exactly,
will they finish the syllabus by their target date?" — is NO for all ten
personas**, including the 12h/day student with 84 days and no job.

---

## 1. The mechanism (one inequality)

This is the whole bug, and it is four numbers.

`chooseTopicForSection` scores every candidate as
`coverage + weightage×8 + sequence + revision + bonuses`. After 40 days:

```
Percentages       revising (worked 3×)   cov= 8 + wt=40 + seq=14.5 = 62.5   ← chosen
Linear Equations  never opened           cov=20 + wt=32 + seq=10.0 = 62.0   ← skipped
```

**A topic the student has finished revising outranks a topic they have never
opened.** Weightage (8–40 points) dominates coverage (2–30 points), so a
high-weightage topic never leaves the top of the queue. Once the ~13
highest-weightage topics saturate, every subsequent day re-picks from that same
set. The other 33 topics can never win.

The selector has no term for *"this topic has never been taught."* Novelty was
deliberately de-prioritised on 16 Jul (a real student complained about being
given PNC before finishing Arithmetic) — the fix was correct in direction and
overshot: it removed the only force that walked the student through the
syllabus.

---

## 2. Persona results (all ten)

Simulated from 8 Aug to a 31 Oct target (84 days), perfect attendance, every
task marked fully done.

| # | Persona | Required/day vs committed | Topics taught | Remaining | App shows | Finishes? |
|---|---|---|---|---|---|---|
| A | Beginner, 8h/day | 5.5 vs 8 → *ahead* | 13/46 | 276h | 30% | ❌ |
| B | Working prof, 3h/day | 5.5 vs 3 → *behind* | 11/46 | 295h | 26% | ❌ |
| C | College, 6h, 30% done | 4.0 vs 6 → *ahead* | 10/46 | 225h | 43% | ❌ |
| D | Late starter, 60 days, 6h | 7.5 vs 6 → *behind* | 13/46 | 276h | 30% | ❌ |
| E | Strong QA, weak DILR+VARC, 5h | 3.5 vs 5 → *ahead* | 9/46 | 185h | 53% | ❌ |
| F | Revision student, 80% done, 5h | 1.5 vs 5 → *ahead* | **3/46** | 113h | 72% | ❌ (zero movement in 84 days) |
| G | Weekends only, 8h weekend | 5.5 vs 0.5 → *behind* | 8/46 | 315h | 21% | ❌ |
| H | Low time, 1.5h/day | 5.5 vs 1.5 → *behind* | 13/46 | 276h | 30% | ❌ |
| I | Aggressive, 12h/day | 5.5 vs 12 → *ahead* | 13/46 | 276h | 30% | ❌ |
| J | Repeater, 6h/day | 5.5 vs 6 → *ahead* | 13/46 | 276h | 30% | ❌ |

**Student F is the sharpest failure.** An 80%-complete student with 84 days
receives three topics, repeated for twelve weeks, and ends exactly where they
started: 113h remaining, 72% shown, both unchanged. Their `revising` topics
can't advance (taps cap there) and their nine untouched topics never outrank
the high-weightage revising ones. The plan has literally nothing to give them.

**Students H and I are the most damaging pair.** 1.5h/day and 12h/day produce
**identical** syllabus outcomes — same 13 topics, same 276h remaining. An
eight-fold difference in effort buys nothing. Hours change how many questions
sit inside each task; they do not change what the student is taught.

---

## 3. Personalization audit — what actually moves the plan

| Input | Collected? | Genuinely changes the plan? |
|---|---|---|
| Weakest section | ✅ | ✅ **Yes** — gets 40% (55% lean) of the day and leads |
| Daily hours | ✅ | ⚠️ **Volume only** — question counts scale; topics and sequence are identical |
| Coverage status | ✅ | ⚠️ **Verb only** — changes "Learn X" → "Solve X"; too weak to change *which* topic |
| Working professional | ✅ | ✅ Real — lean weekdays (2 sections), weekend mock, looser revision cadence |
| Repeater | ✅ | ✅ Real — phase floor, tighter revision cadence, mock-analysis task |
| Coaching timetable (premium) | ✅ | ✅ **Strongest signal in the system** (+45) — the one input that reliably overrides the queue |
| Postponed/swapped topic | ✅ | ✅ Real (+50, the highest) |
| Priority stars, "start with" cluster | ✅ | ✅ Real (+25/+22) |
| Self-reported weak topic | ✅ | ⚠️ Weak (+12) — usually loses to weightage |
| **Target completion date** | ✅ | ❌ **No** — never enters `generateRoutine`. Two students with the same profile and target dates 60 days apart get the identical plan |
| **Days remaining / urgency** | ✅ | ❌ **No** — only the calendar month drives phase, not the student's own deadline |
| **Required pace (`requiredPerDay`)** | computed | ❌ **No** — displayed as a warning; never feeds the plan |
| **Mock budget (48h)** | computed | ❌ **No** — priced into the pace warning, never scheduled as work |
| **Strongest section** | ✅ | ⚠️ Cosmetic — only names the revision-phase recall task |
| **Target percentile** | ✅ | ❌ **Decorative** — read nowhere in the planner |
| **Mock scores / accuracy** | ✅ | ❌ Not an input to topic choice |
| **Missed days** | ✅ | ⚠️ Only moves the finish date weekly; today's plan is unchanged |

**Genuinely adaptive: ~45%.** Strong on *who you are* (archetype, weak
section, coaching sync). Absent on *where you are in time* (deadline, pace,
urgency) and *what you still haven't been taught*.

---

## 4. Mathematical findings

**4.1 — The completion ceiling is 85%, not 100%.** `REMAINING_FRACTION` never
reaches zero: `revising` leaves 15%, `exam_ready` leaves 5%. With every one of
the 46 topics maxed through the in-app loop, 60h of 397h remain and the ring
shows 85%. Even the evidence-earned ceiling shows 95%. **A student who does
everything perfectly can never see a finished syllabus.** The ring is
structurally incapable of closing.

**4.2 — Daily load exceeds the student's own hours by 15% whenever a fourth
task is added.** The three topic tasks take 40% + 30% + 30% = 100% of the day.
The phase-closing task (sectional mock / mock analysis / recall) is then added
*on top* at 15%.

| Student | Committed | Planned | Overshoot |
|---|---|---|---|
| Beginner 8h (foundation, 3 tasks) | 480m | 480m | 0% ✅ |
| Low-time 1.5h (foundation, 3 tasks) | 90m | 90m | 0% ✅ |
| Repeater 6h (4 tasks) | 360m | 414m | **+15%** |
| Mocks-stage 5h (4 tasks) | 300m | 345m | **+15%** |

Every repeater and every intensive/revision-phase student is handed 15% more
than they signed up for, every day. Against the founder's own rule — the
student owns their hours — this quietly breaks it.

**4.3 — The 48h mock budget is priced but never scheduled.** `remainingMockHours`
adds 48h to `requiredPerDay` (raising it from ~4.2 to 5.5 for Student A), so
students are told to study for mocks that the plan never actually gives them.
The daily plan's "sectional mock" task is 15% of a day, unpriced against that
budget.

**4.4 — The weekly date-extension engine is correct.** The one piece of
completion math that holds up. A fully missed week costs exactly 7 days at
every hours setting (1.5h → 10.5h deficit ÷ 1.5 = 7d; 12h → 84h ÷ 12 = 7d);
studying half costs 4 days; the exam wall clamps correctly; join-date is
honoured. No defects found.

**4.5 — `requiredPerDay` and the plan disagree, permanently.** Student A is
told "5.5h/day required, you're committed to 8 — you're AHEAD" while the plan
they follow will never finish the syllabus. Both numbers are computed
honestly; they are simply about different things, and nothing reconciles them.

---

## 5. Critical issues, ranked by student impact

**CRITICAL — 1. The plan never covers the syllabus.** 13 of 46 topics in a
year; 33 never taught. Every persona fails. *Impact: the core promise is
false. A student following us perfectly walks into CAT having never been shown
Para Jumbles, Logarithms, Progressions, Venn/Sets or Binary Logic.*

**CRITICAL — 2. Hours are decorative for syllabus progress.** 1.5h and 12h
produce identical coverage. *Impact: the single most-asked question at signup
("how many hours can you give?") changes nothing that matters. A 12h student
is being wasted; a 1.5h student is being misled.*

**CRITICAL — 3. The ring can never reach 100%.** Structural 15% floor.
*Impact: no student ever experiences completion. The one moment the whole
product is built toward cannot occur.*

**HIGH — 4. The target completion date does not enter the planner.** 60 days
left and 300 days left produce the same day. *Impact: Student D (60 days) is
given a beginner's leisurely first-pass plan and told they're only "behind" in
a warning banner.*

**HIGH — 5. Revision-stage students get nothing.** Student F: 3 topics in 84
days, zero movement. *Impact: exactly the students closest to paying — advanced,
serious, near the exam — get the emptiest experience.*

**HIGH — 6. Daily load exceeds committed hours by 15% for 4-task days.**
*Impact: silently breaks the founder's own "hours are the student's" rule.*

**MEDIUM — 7. The 48h mock budget is charged but never delivered.**

**MEDIUM — 8. `requiredPerDay` says "ahead" while the plan cannot finish.**
*Impact: the app's most confident number is the one most likely to be wrong.*

**LOW — 9. `targetPercentile` is collected and never used.**

---

## 6. Edge cases

| Scenario | Behaviour | Verdict |
|---|---|---|
| Misses 5 days | Deficit → date moves ~3–4 days, Sunday warning with arithmetic | ✅ Correct |
| Misses 20 days | ~3 weekly extensions, clamped at exam date | ✅ Correct |
| Changes hours | `setDailyHours` (one writer), plan rebuilds same day | ✅ Correct |
| Changes target date | Pace recomputes; **daily plan does not change** | ⚠️ Half-working |
| Weakest section changes | Next plan re-weights immediately | ✅ Correct |
| Completes topics faster | Status advances → remaining drops → pace eases | ✅ Correct |
| Stops a month, returns | Date extended weekly; plan resumes; no punishment | ✅ Correct |
| Logs a partial day | `blue` caps topic at `practicing` (35% left) forever | ⚠️ Ceiling |
| Studies 365 days perfectly | 13 topics, 276h remaining | ❌ **Broken** |

Recovery and honesty are genuinely good. Progression is what's missing.

---

## 7. Would a CAT mentor approve today's plan?

**Day 1 for Student A (8h, beginner):** *Learn Percentages + solve 12 (192m) ·
Read + solve 3 RC passages (144m) · Learn Arrangements + 3 sets (144m).*

A mentor would approve this day: three sections, weak section leading,
sensible openers, executable targets, honest unit choices (sets for DILR,
passages for RC), volume caps that protect motivation. **The day is genuinely
good.**

They would reject the **month**: the same three topics recurring, no new
material, no syllabus march, no mock schedule, no revision cycle tied to
forgetting curves. And they would reject the **year** outright — 33 untaught
topics is not a preparation plan.

---

## 8. Product view — would a student trust this?

Week 1 feels excellent: personal, specific, explained ("Arithmetic — the
biggest area in Quant (~40%)"), achievable. Week 3 is where it breaks: the
student notices Percentages again, and the honest reasons start reading as
excuses. By week 6 an attentive student knows they haven't been taught
anything new — and the ring stuck at 30% confirms it. **The product's own
transparency is what will expose the defect**, which is a good property of the
design and a fast path to churn given the defect exists.

Where 100,000 students would complain first, in order: *"why the same topics
again"* → *"my percentage isn't moving"* → *"I've studied 3 months and the app
says 30%"* → *"why does it say I'm ahead when I haven't finished the
syllabus"*.

---

## 9. Personalization score

| Dimension | Score | Basis |
|---|---|---|
| Input quality | **90** | Rich, well-collected, honest onboarding |
| Daily plan quality | **80** | A genuinely good day; mentor-approvable |
| Planning (syllabus → schedule) | **15** | No schedule exists; greedy per-day argmax |
| Execution (does it finish?) | **5** | 0 of 10 personas finish |
| Adaptation | **50** | Archetype/coaching strong; time/pace absent |
| Recovery | **85** | Date extension is correct and humane |
| Realism | **60** | Volumes realistic; 15% overshoot; mocks unscheduled |
| Student trust | **45** | Excellent week 1, breaks by week 3 |
| **Overall** | **43 / 100** | Strong daily coach, absent course planner |

---

## 10. Founder recommendation — one sprint

Fix the queue, not the day. The day is good.

**1. Add a "never taught" term to the selector (½ day, highest ROI).** A
first-contact bonus large enough to beat a finished high-weightage topic — the
gap to close is 0.5 points today (62.5 vs 62.0), so ~+25 for a topic with no
coverage row, decaying once touched. This single change is the difference
between 13 topics and 46.

**2. Make the deadline drive the queue (2 days).** Pass `requiredPerDay` and
`daysLeft` into `generateRoutine`. When remaining topics ÷ days left demands
faster movement, advance to a new topic instead of re-picking a revised one.
This is what makes hours finally matter — and makes Students H and I diverge.

**3. Close the ceiling (½ day).** Let `exam_ready` mean 0 remaining hours, or
display completion against reachable maximum. A ring that cannot reach 100% is
a promise the product cannot keep.

**4. Stop the 15% overshoot (1 hour).** Take the closing task's share out of
the three topic tasks rather than adding it on top.

**5. Schedule the mocks you're charging for (1 day).** If 48h of mocks are in
`requiredPerDay`, put mock days in the plan.

Do 1 and 4 today — together they are under a day of work and they change the
outcome for every student on the platform. Items 2, 3 and 5 make the promise
fully true.

**What NOT to do:** don't rewrite the routine engine, don't add an LLM to
topic choice, don't touch the daily-hours ownership rule or the date-extension
engine. Those are working, and two of them are the best-designed parts of the
system.

---

*Harness: `src/lib/study-plan-audit.test.ts` — 7 assertions encoding the
numbers above, running in CI. When the planner is fixed these tests fail by
design; update them in the fixing commit so the diff shows the improvement.*
