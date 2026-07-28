# Investigation: every log a notification has ever produced

**Question that started it:** not "how many notifications?" but *"why have only
a handful of notifications ever produced a log?"*

**Method:** inspect every one individually. There are seven. They contain
almost all the signal we have about push.

---

## The seven

| Type | Date | IST | Account age | Context | Minutes tap→log |
|---|---|---|---|---|---|
| `companion_spark` | 15 Jul | 11:12 | 2 d | standalone | **1** |
| `companion_progress` | 17 Jul | 20:41 | 5 d | standalone | **3** |
| `companion_progress` | 22 Jul | 22:26 | 10 d | standalone | **2** |
| `inactive_recovery` | 24 Jul | 20:03 | 5 d | standalone | **1** |
| `companion_kickoff` | 25 Jul | 08:10 | 1 d | standalone | **1** |
| `companion_progress` | 25 Jul | 20:32 | 11 d | standalone | **3** |
| `companion_kickoff` | 28 Jul | 08:18 | 6 d | standalone | **0** |

---

## Finding 1 — every single one came from the installed app · VERIFIED

**7 of 7 are `push_context = 'standalone'`.** Not one came from a browser.

Tested against exposure, because 7/7 is only interesting if standalone is not
everything:

| Context | Pushes delivered | Share |
|---|---|---|
| standalone | 2,749 | **52.6%** |
| (null, pre-instrumentation) | 2,063 | 39.5% |
| **browser** | **412** | **7.9%** |

**DERIVED:** if context were irrelevant, the chance of 7 out of 7 landing on
standalone at a 52.6% base rate is `0.526^7 ≈ 1.1%`.

**412 browser pushes have been delivered. They have produced zero logs, ever.**

**Consequence:** push value appears to be conditional on the app being
installed. That reframes the install prompt from a growth nicety into the
precondition for push working at all.

## Finding 2 — the effect is immediate or absent · VERIFIED

Every log landed **0–3 minutes** after the tap. Median: 1 minute.

This also settles the attribution question, which is a modelling choice rather
than a fact and therefore had to be tested:

| Window | Logs attributed |
|---|---|
| 15 min | **7** |
| 30 min | **7** |
| 2 h | **7** |
| 6 h | **7** |
| 24 h | 14 |

**The answer does not move at all between 15 minutes and 6 hours.** It only
doubles at 24 hours, and a 24-hour window mostly captures logs the student
would have filed anyway. The 2-hour window used everywhere else in this
codebase is therefore not load-bearing — any choice in that range gives the
same answer.

## Finding 3 — my hypothesis about who they were was wrong · VERIFIED

I expected day-1 users. Account ages at the moment of the tap:
**1, 2, 5, 5, 6, 10, 11 days.** Median 5.

Notification-driven logging is not an onboarding artefact. It happens
throughout the first two weeks.

## Finding 4 — two time clusters · VERIFIED

Morning **08:10, 08:18** · Evening **20:03, 20:32, 20:41, 22:26** · one at 11:12.

Six of seven sit in two narrow bands: ~08:15 and ~20:00–22:30.

## Finding 5 — I cut the best notification this morning · VERIFIED

Ranking by taps (what I used at 06:00 today) versus by logs (the actual goal):

| Slot | Pushed | Tapped | **Logs** | Kept at 06:00? |
|---|---|---|---|---|
| `companion_progress` (20:30) | 502 | 4 | **3** | ❌ **dropped** |
| `companion_kickoff` (08:00) | 621 | 6 | **2** | ✅ kept |
| `companion_spark` (11:00) | 627 | 7 | **1** | ✅ kept |
| `companion_wind` (18:30) | 569 | 3 | **0** | ✅ **kept** |
| `companion_log` (21:30) | 291 | 1 | **0** | ✅ kept |

**I kept `wind`, which has produced zero logs, and dropped `progress`, which
has produced more logs than any other notification in the system.** I ranked on
tap rate and spacing — exactly the mistake I was warned about, shipped to
production hours before being warned.

**Corrected:** `wind` (18:30) replaced by `progress` (20:30). The evening slot
now sits in the band where six of seven logs actually happened.

---

## The experiment, specified

Not "compare 4 vs 6 vs 8". That is a wish, not a plan.

**Name:** Push context is the precondition
**HYPOTHESIS:** pushes to installed apps produce logs; browser pushes do not.
**Population:** all students with a live subscription and `push_context` set (n ≈ 64 today — **underpowered, see below**)
**Randomisation:** none — this is observational. Context is not assignable.
**Primary metric:** logs within 15 min of tap, per 1,000 delivered, split by context
**Guardrail:** none needed; no change to what students receive
**Duration:** until 30 outcome events accumulate (`notification_outcomes()` flips `confident` at 30)
**Decision rule:** if browser pushes remain at zero logs past 1,000 deliveries, stop sending to browser context entirely and spend the trust budget on install instead.

**Name:** Evening slot placement
**HYPOTHESIS:** 20:30 outperforms 18:30 for log completion.
**Population:** all reachable students
**Randomisation:** per student, stable hash of student id
**Groups:** A = 18:30 · B = 20:30 · C = 21:30
**Duration:** 21 days
**Primary:** logs completed per student per day
**Secondary:** 7-day return rate
**Guardrails:** push disables, uninstalls, `push_died_at` rate

---

## Is the sample representative? · **NO — and this limits everything above**

The 64 students with live subscriptions are **not** a random sample of 246.
They are the students who installed the app **and** granted permission **and**
kept the subscription alive. Every one of those is a selection filter
correlated with engagement.

**So Finding 1 is confounded.** "Standalone pushes produce logs" may partly be
"students who install are students who log". The observational design cannot
separate the two, and no randomised design can either, because you cannot
randomly assign someone to have installed the app.

**What would resolve it:** compare log rates between installed and non-installed
students on days when *no notification was sent at all*. If installed students
log more even with no push, the effect is the student, not the channel.

### The query was run. The confound is real, and it is large. · VERIFIED

Student-days in the last 13 days on which **no push was sent at all**:

| | Student-days | Logged | Log rate |
|---|---|---|---|
| App installed | 1,400 | 21 | **1.50%** |
| Not installed | 1,174 | 2 | **0.17%** |

**Installed students log 8.8x more often than non-installed students on days
when we send them nothing whatsoever.**

So Finding 1 is largely confounded, and the honest reading inverts it:
notifications are not what makes installed students log. **Installing is.**
The push channel is riding a signal it did not create.

**DERIVED, and this is the number that should decide the roadmap:** push has
produced 7 logs in roughly 3 weeks (~0.33/day). Moving the 93 not-yet-installed
students to the installed log rate would add roughly
`93 x (0.0150 - 0.0017) ≈ 1.2 logs/day` — **about four times what the entire
notification system has ever delivered**, and it compounds because an install
persists while a notification does not.

---

## The next question

This investigation started with "how many notifications?" and ended somewhere
better:

> How many notifications? → No measurable difference between 3 and 4.
> → Why do so few produce logs? → Every one came from an installed app.
> → Is the install the cause, or a correlate? → **A correlate. Installed
>   students log 8.8x more with no push at all.**
> → **So why does installing change behaviour that much, and what is the
>   cheapest way to move a student across that line?**

That is the next question, and it is not a notification question. The
notification work is finished for now: 4 slots, the right 4, measured by logs.
The install is where the leverage is, and nothing in three weeks of
notification analysis would have found that — only inspecting seven rows one at
a time did.
