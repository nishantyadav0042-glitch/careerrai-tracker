# CareerRai — everything a student gets today, and what's planned next

**8 Aug 2026.** Written for an outside reviewer (Gemini) with no access to
our code or data. Everything below is live in production at careerrai.in
unless marked *(planned)*.

**Context:** CareerRai is a daily CAT-prep companion app (CAT 2026 = 29 Nov).
~257 students signed up, 77 ever logged a study day, 48 of those logged
exactly once, 0 paying customers yet. Mission: make a student's life easier
every single day — we don't help students study harder, we remove what makes
studying harder. Internal checklist: reduce choice, reduce setup, reduce
remembering, reduce shame, reduce restart cost, reduce uncertainty.

---

# PART A — What is built and live today

## 1. Getting in

**A1. Signup** — phone number + OTP (no password day 1). A short form:
exam year, target colleges, target percentile, daily hours, coaching yes/no,
repeater yes/no, main struggles, and a tap-through of which topics they've
already covered.
**A2. Instant insight** — right after the form, one screen of personalised
math: your remaining syllabus in hours vs your days left.
**A3. Install flow** — it's a web app (PWA): guided "Add to Home Screen"
(Chrome/Safari), including a trap-catcher for Instagram/WhatsApp in-app
browsers. Play Store listing is in review.
**A4. First-run journey** — notification permission → short app tour →
buddy (mentor) introduction → first log prompt.
*Data note: the biggest drop is right here — most students never log a
second day.*

## 2. The daily loop (free)

**A5. Today's plan** — 3 tasks a day, built from the student's own setup:
weakest section gets the biggest share and leads; each task is a concrete
target ("Solve 12 Percentages questions", "3 RC passages"), with a one-line
reason ("Your coaching teaches this today", "Last practised 11 days ago").
Working professionals get 2 lean tasks on weekdays, full spread on weekends.
Repeaters get a daily mock-analysis task.
*Data note: an audit proved the plan repeats ~13 high-value topics and never
marches through the full syllabus; fix designed, not yet built.*
**A6. Swap a topic** — don't like today's topic? Swap it for another in the
same section; the swapped-out one is promised back tomorrow (never deleted).
**A7. Emergency mode** — "only have 30 minutes?" collapses the day to the
single most important task.
**A8. Daily log** — 30-second check-in: hours, what you studied, one mood
emoji, optional "plan was too much/too little/right", optional reason you
couldn't study (office/family/health...). Honest options: "didn't study
today" and rest day both exist and are never punished. 0-hour logs allowed.
Ticking plan tasks and logging are one integrated flow.
**A9. Confidence taps** — when ticking a task: 🟢 got it / 🔵 getting there /
🟡 tried / 🔴 struggled. These move the topic's status (struggling drops it
back; "exam ready" can never be earned by taps alone — see A13).
**A10. Streak + streak saves** — daily streak that never resets to zero:
a missed day first spends a "save" (earned every 21 days, max 3), after that
the streak drops by 1 per missed day instead of dying. Milestones, flame
states, streak-restore when we owed someone one.

## 3. Knowing where you stand (free)

**A11. What's-done map ("Blueprint")** — all 46 CAT topics, each marked
not-started / learning / practicing / revising / exam-ready. Student can
star up to 5 priority topics and choose a starting cluster ("start with
Arithmetic").
**A12. Finish date + pace** — remaining syllabus in hours, % complete, and
the honest core rule: **your daily hours are yours and never touched; if you
fall behind, your finish date moves instead** — once a week (Sunday), with
the arithmetic shown ("you studied 12 of 28 hours; finish date moved 4
days"). The date can never move past exam day.
*Data note: audit proved the % ring can never reach 100% (max 85%); fix
designed, not built.*
**A13. Evidence ("exam ready")** — a topic only becomes "exam ready" by
logged practice: enough questions at enough accuracy across difficulties.
Self-belief can't earn it; work can.
**A14. Mock logging + scorecard photo** — log a mock with section scores, or
photograph the scorecard and we read it automatically. A short debrief
afterwards.
*Gap: the mock currently doesn't change next week's plan automatically.*
**A15. Today's one thing (daily insight)** — one personalised line a day
about their prep.
**A16. Study history** — past logs and days shown up.

## 4. Coaching students (free — unlocked this week)

**A17. Timetable upload** — photo, PDF, Excel or CSV of the coaching's
timetable → we read it (AI), student confirms → the daily plan follows what
their class teaches, day by day. Handles daily sheets + weekly sheets in one
workbook. Was premium until 8 Aug; now free for everyone (quota: 6/hour,
15/day).
**A18. Class-progress tracker ("coaching mirror")** — if the coaching gave
quotas/targets, progress against them.
**A19. Next-timetable reminder** — when the uploaded timetable is about to
run out, one push asking for the next sheet.

## 5. Community (free)

**A20. Daily Pick** — one student-submitted tip + one practice question per
section each day; students vote "would this help another aspirant?" No vote
counts shown (no herding), no leaderboards, max 1 submission/day. Top Pick:
most votes tops the slot for exactly one day; nothing is ever judged or
dropped.
**A21. Daily challenge** — one quick question with an explanation and
community stats after answering.

## 6. Notifications (free)

**A22. Study companion** — up to 6 small daily slots (morning plan, evening
log reminder, etc.), budgeted and deduped so it never spams. Different
copy for new students (activation) vs gone-quiet students (reactivation).
**A23. Weekly Sunday message** — the week's honest arithmetic (see A12).

## 7. The mentor — "Buddy" (paid: ₹999/1mo · ₹2,499/3mo · ₹2,999 till CAT · ₹4,499/6mo)

**A24. A real IIM-alumni mentor**, personally assigned.
**A25. 1:1 chat** — anytime, both directions, with file sharing (photos,
PDFs, Excel).
**A26. Video sessions** — scheduled Google Meet calls; after each: one
strength, one weakness, 3–4 small assignments.
**A27. Weekly review** — written from the student's real logged week.
**A28. Buddy-curated timetable** — the mentor edits/corrects the student's
uploaded coaching timetable; the daily plan follows the corrected version.
**A29. Payment** — in-app via Razorpay; premium activates automatically.

## 8. Admin/ops (not student-facing, listed for completeness)

Founder dashboards (leads, sales queue, streak-breakers, daily-pick stats),
AI calling agent for new signups (Expedify "Riya"), WhatsApp outreach
tooling. Not part of this review.

---

# PART B — The five planned stages (designed, NOT built)

**Stage 1 — Stop the shame.** Onboarding asks "on a bad day, what's the
minimum you can still do?" (15/30/60/120 min) and builds the plan at that
floor — finish it and more is offered. A zero day gets a kind one-task
tomorrow ("Happens. Tomorrow just 15 minutes — one RC.") instead of silence.
After a bad log, the mentor door shows a real human message instead of a
paywall. Fix: 4-task days currently overshoot chosen hours by 15%. A daily
"am I okay?" line, only ever said when provable ("You're on track" / "Do
today's 3 tasks and you're back on track").

**Stage 2 — Win the first hour.** First-run leads with "In coaching? Send
your timetable — a photo works. 30 seconds." The aligned plan becomes the
first screen. Ever taken a mock? Photo → instant 3 takeaways. Self-study
students skip straight to the plan.

**Stage 3 — Remember for them.** A plain memory line on the plan ("Last done
11 days ago — 20 min today or it slips away"). Mock upload auto-adjusts next
week's plan with one line of why. A 20-second evening "what did coaching
cover today?" (topic chips, two taps) that re-aligns tomorrow.

**Stage 4 — One clear next thing.** Merge the two competing "do this next"
surfaces into one. Fix the planner's proven flaws (it repeats topics; make
it march through the syllabus, deadline-aware). Judgment rule: after 3 heavy
days or a mock, the plan may ask for LESS than the floor.

**Stage 5 — Make coming back free.** A comeback screen after silent days
("Nothing broke. Your week is adjusted. Today: 15 minutes."). Silence
protocol: day 2 → one personal notification; day 4 → a human message; day
7 → stop pushing, flag to mentor. Patterns said out loud ("You skip Quant
every Sunday — swap Sundays to VARC?"). A "your preparation history" screen
— the whole journey, like a GitHub graph for prep.

Also planned as rules, not features: streak stays daily but the week becomes
a visible scoreboard (5/7 days, fresh every Monday); a bad-day-floor log
keeps the streak fully; after a break, lead with "Best: 23 days", never the
loss. All app words in simple English readable in 0.1 seconds ("Momentum
Shield" → "Streak save").

---

# PART C — Questions for the reviewer (Gemini)

Judge everything above against ONE mission: **make a CAT student's life
easier every day** (less choice, less setup, less remembering, less shame,
cheaper restarts, less uncertainty). We fiercely avoid: content/lectures,
doubt-solving chatbots, leaderboards, anything the student must maintain.

For each item A1–A29 and Stage 1–5, answer:

1. **KEEP / SIMPLIFY / MERGE / REMOVE / POSTPONE** — one word.
2. One sentence why, from the student's point of view (a stressed 21-year-old
   in August, ~110 days before CAT, probably enrolled in a coaching).
3. Which items add work or thinking for the student rather than removing it?
   Be ruthless — feature-count is our enemy.
4. Which single 3 items would you bet drive day-2/day-7 retention hardest?
5. Which items would you cut entirely even though they work, because they
   dilute focus?
6. Anything obviously missing that removes daily work for a coaching-enrolled
   student? (Not content. Not a chatbot.)
7. Sanity-check the stage ORDER (shame → first hour → memory → choice →
   comeback). Would you reorder, and why?

Known data to weigh: churn is concentrated on day 1–2 (48 of 77 logged
once); the top product-caused complaint is "plan too heavy"; students who
logged a bad day went looking for a human mentor and hit a paywall; life
reasons (office/family/health) outnumber product reasons ~2:1 in blockers.
