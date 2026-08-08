# The Five Jobs — what we have, what we fix, what we build

**8 Aug 2026. Plan only — nothing here is built yet.**
**Working rule from today: everything ships to the feature branch first.
Main gets nothing until the founder says so.**

## The heart (founder, verbatim)

> The strongest products do five jobs: **reduce choice, reduce setup, reduce
> remembering, reduce shame, or reduce the cost of restarting.**

That is the whole goal. Every stage below exists to do one of these jobs for
a real student. A feature that does none of them does not get built —
whatever else it promises.

The moat it serves: **Memory × Initiative × Judgment** — we know the student,
we reach the student, and we know what NOT to ask of them today.

## The words rule (applies to every stage)

App copy uses words a student understands in 0.1 seconds. The test: would a
21-year-old say this sentence to a friend?

| Never show | Show instead |
|---|---|
| "Syllabus completion horizon" | "Kab tak khatam hoga" / "Finish date" |
| "Coverage matrix" | "Kitna ho gaya" |
| "Reconciliation" | "Week ka hisaab" |
| "Revision cadence overdue" | "11 din ho gaye — 20 min dekh lo" |
| "Plan regenerated" | "Kal ka plan ready hai" |
| "You are BEHIND" | "Finish date 2 din aage gaya. Aaj se wapas." |

One idea per line. Max ~8 words. No feature is done until its copy passes
this table.

---

## The scoreboard (what "working" means)

One number per stage, all serving one metric: **do students come back?**
Baseline today: 77 ever logged · 48 logged exactly once · 31 gone after one
log · top product-caused blocker = "plan too heavy".

---

# What we already have, job by job

| Job | Have today | Honest grade |
|---|---|---|
| **Reduce choice** | Daily plan (3 tasks), "Do this next" card, topic selector with reasons | B — good day, but plan repeats topics (audit) and two surfaces compete for "the one thing" |
| **Reduce setup** | Timetable upload photo/PDF/Excel (now FREE), scorecard photo parser, 30-sec signup | B+ — the wow exists but is below the fold; first-run asks questions instead of taking their sheet |
| **Reduce remembering** | Revision-due scoring, coverage statuses, mock log + debrief, streaks history | C — pieces exist, but nothing says "Percentages, 11 din pehle — aaj 20 min". Mock → next-week loop is manual |
| **Reduce shame** | Honest "didn't study" log, rest days, Momentum Shields, weekly (not daily) date warning | C− — the *log* is shame-free, the *response* isn't: a zero gets silence, oversized plans stand as proof of failure, 11–15h fantasy hours are accepted at signup |
| **Reduce restart cost** | Reactivation notification copy (companion), never-delete-always-postpone | D — notifications exist, but there is no comeback moment in the app, no human routed, no "kuch nahi toota" screen. Our data: after a bad day students went looking for a person and hit a wall |

Reading the column: **shame and restart are the bleeding wounds; setup is the
unclaimed win; remembering is half-built; choice is the healthiest.** The
stages follow that order.

---

# STAGE 1 — Stop the shame (the bleeding wound)

*Job: reduce shame. Metric: % of zero/low-log students who open the app the
next day (today: ~0 of 6).*

1. **The bad-day floor replaces fantasy hours.** Onboarding stops asking "how
   many hours will you study?" and asks: *"Bura din ho toh kitna pakka kar
   loge?"* (15 min / 30 min / 1 hr / 2 hr). The daily plan is built at the
   floor. Finish it and more is right there ("Aur karna hai?"). Plan to the
   floor, allow the ceiling — fixes the 12.5h-chose/5h-did students AND the
   4h-chose/6h-did students with one design.
2. **The zero-day response.** A zero or tiny log flips tomorrow's screen:
   *"Hota hai. Kal sirf 15 minute — ek RC, bas. Game on hai."* One task.
   No plan wall, no red, no arithmetic.
3. **Route to a human on the bad day.** The buddy door after a bad log is
   never blank for free students — one real message from a real name (Shreya
   or founder, templated, personal). Our churn data: Akash, Shivpujan and
   Kushagra all went looking for a person there and found a lock.
4. **Fix the 15% overshoot.** The closing task's minutes come out of the
   three topic tasks, not on top (audit finding — one-hour fix).
5. **Copy sweep of every guilt surface** against the words table.

*Existing pieces reused: log modal (already honest), shields, plan-freshness.
Nothing new invented — this stage mostly deletes and softens.*

# STAGE 2 — Win the first hour (reduce setup)

*Job: reduce setup. Metric: day-2 return of new signups (today: 48 of 77
logged once and stopped).*

1. **First-run leads with the sheet.** "Coaching mein ho?" → yes → *"Timetable
   bhejo — photo bhi chalega. 30 second."* The aligned plan IS the first
   screen, before hours, before the tour. The wow we just made free moves
   from below the fold to minute one.
2. **Scorecard on day 1.** "Mock diya hai kabhi?" → photo → we already parse
   it (`parse-scorecard`) → *"Teen cheezein dikh rahi hain."* Second wow,
   zero typing.
3. **Self-study students** skip both, get the plan directly — no dead ends.

*Existing pieces reused: timetable upload, scorecard parser, first-run rail.
This is re-sequencing, not new machinery.*

# STAGE 3 — Remember for them (reduce remembering)

*Job: reduce remembering. Metric: revision tasks completed per active
student-week.*

1. **The memory line.** One line on the plan, plain words: *"Percentages —
   11 din pehle kiya tha. 20 min aaj, warna nikal jayega."* The revision-due
   engine already computes this; nobody ever says it to the student.
2. **Mock → next week, automatically.** Scorecard upload adjusts the coming
   week's plan (weak section share up, one line explaining why). Closes the
   loop that is manual today.
3. **Evening 20-second reality capture.** *"Aaj coaching mein kya hua?"* —
   topic chips, two taps, done. Feeds the same alignment path the timetable
   uses (`timetable-apply`). This is the Coaching Companion in its smallest
   possible form — no APIs, no integrations.

# STAGE 4 — One clear next thing (reduce choice)

*Job: reduce choice. Metric: plan-task completion rate.*

1. **One "ab yeh karo" surface.** Today the routine card and the next-action
   card compete. One wins; the other folds into it.
2. **The planner fixes from the audit** — never-taught bonus, deadline-aware
   march — land here, *behind* the shame/setup fixes, because nobody in our
   churn data survived long enough to be failed by topic sequencing.
3. **Judgment rule (the founder's third term):** the plan may ask for LESS
   than the floor when the pattern says so — after 3 heavy days, after a
   mock, after a comeback. "Aaj sirf 5 questions" is intelligence, not
   weakness. Judgment = knowing what NOT to ask.

# STAGE 5 — Make coming back free (reduce restart cost)

*Job: reduce the cost of restarting. Metric: % of 3-day-silent students who
return within 7 days (today, of 37 silent: 0).*

1. **The comeback screen.** Open after N silent days → *"Kuch nahi toota.
   Week adjust kar diya. Aaj: 15 minute."* Never a backlog, never a red date
   on arrival.
2. **Silence protocol.** Day 2 silent → one notification that knows them
   ("Percentages pada tha — 2 min ka revision?"). Day 4 → a human message,
   not a push. Day 7 → we stop pushing and the Buddy list flags them.
   Silence is the emergency; it outranks every conversion.
3. **Patterns said out loud (Memory → noticing).** *"Har Sunday Quant skip
   hota hai — Sunday ko VARC rakh dein?"* One pattern, one sentence, one
   tap. This is where "the app remembers me" becomes felt.
4. **Preparation history (identity).** The student's whole journey on one
   screen — days shown up, topics touched, mocks, comebacks. Theirs, proud,
   impossible to recreate elsewhere. (GitHub graph, for prep.)

---

## What we will NOT build (standing list)

Content · lectures · question banks · doubt chatbot · leaderboards ·
public comparison · any second thing to maintain · any notification without
new information about *them* · any feature that adds a decision.

## Sequencing logic, in one paragraph

Stage 1 before everything because shame is measurably killing day-2 (six of
six zero-loggers gone). Stage 2 next because setup is our cheapest unclaimed
win — the machinery exists, only the order is wrong. Stage 3–4 deepen the
product for students who now survive week one. Stage 5 runs partly in
parallel from Stage 1 (the human routing is shared) and is where the moat —
memory, initiative, judgment — becomes something a student can feel. Each
stage is small, ships whole, and is judged by one retention number, not by
feature count.

## The standing test (print this)

Before building anything, one question:
**"Kaunsa decision hataya?"** — which decision did this remove?
If the answer is none: it reduces no choice, no setup, no remembering, no
shame, no restart cost — and it does not get built.
