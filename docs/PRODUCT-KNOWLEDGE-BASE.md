# CareerRai — Product Knowledge Base

**Purpose of this document.** Built at the founder's request (17 Aug 2026) as a complete,
mechanism-level map of every feature in the product — not marketing copy, not a feature
list, but *how each thing actually works today*, verified against the live code. It exists
so the founder can sit with it, think like a co-founder, and answer three questions for
himself: what should we add, what should we cut, and how do we build a real community —
**specifically for the one audience this company has decided to serve: students doing pure
self-study, and repeater students who took coaching in year one but are self-studying (or
close to it) in year two and beyond.**

Every section below ends, where relevant, with a short **"For the self-study/repeater
lens"** note — not a conclusion, a prompt for what to look at.

---

## 0. The target audience, stated once so the rest of this document can assume it

Two overlapping groups, one product:

1. **Never-coached self-studiers.** Either can't afford coaching or have chosen not to
   take it. They need the plan, the structure, and the accountability a coaching institute
   would otherwise provide.
2. **Repeaters, year 2+.** Took coaching once, didn't clear, and — per the founder's own
   thesis, evidenced across NEET (40–50% repeaters), JEE (30–40%), CAT (35–50%), UPSC
   (~90% of eventual clearers needed more than one attempt) — are very unlikely to pay for
   coaching a second time. They already know the syllabus. What they're missing is
   structure, honest diagnosis of what went wrong, and — for the moments that need it — a
   real human who's been through the exact same thing.

Nothing in this document should be read as "CareerRai serves everyone." It's built,
deliberately, for these two groups. Where a feature clearly serves someone else (coached
students, for instance — `ScreenCoachingPlan` exists), that's noted as a minority path, not
the center of gravity.

---

## 1. Onboarding — two separate doors, and a real gap between them

**There are two different onboarding codepaths, not one.** This matters because a student
can go through either, and they are not equivalent.

- **`/start`** — the pre-auth marketing funnel (`src/app/start/page.tsx`). Builds a topic
  coverage matrix *before* an account exists, shows an "Instant Insight" screen using that
  matrix, then creates the account and marks onboarding complete server-side. A student who
  signs up here **never sees the `OnboardingModal` flow below at all.**
- **`OnboardingModal`** — the fallback "Blueprint Builder" gate, for anyone who reaches the
  app without going through `/start` (e.g. signs up straight at `/login`).

### The `OnboardingModal` screen sequence

| # | Screen | What it asks | Always shown? |
|---|---|---|---|
| 1 | Need Check | "Do you feel you need a proper study plan and tracking system?" — pure commitment device, both answers continue | Always |
| 2 | Ambition Date | When do you want to finish the syllabus? 3 pre-computed dates (6/10/14 weeks, labeled Fast/Balanced/Steady) or custom | Always |
| 3 | Dream Colleges | Pick up to 3 from 15 fixed options — emotional fuel only, not read by any planning code | Always |
| 4 | Exam Context | First attempt? Category, exam target, attempt year, target percentile. **If repeater: two mandatory follow-ups** — last year's percentile, did you have a buddy/guide last year | Always (repeater sub-questions conditional) |
| 5 | About You | Name, mobile, college, working-professional toggle, **coaching enrolled? (mandatory tri-state, never defaulted)** | Always |
| 6 | Reality Check | 3 rhetorical "do you actually know your coverage" questions — sets up relief for the next screen, nothing downstream reads the answers | Always |
| 7 | **Weakest Section** | "Which section costs you the most marks?" One tap: VARC/DILR/QA, or "Not sure yet." **This is called, in the code's own comments, "the highest-leverage input in the product"** — an audit found 24% of students (78/326) fell through every fallback to a hardcoded default because this tap was skipped or unanswered upstream. | Always |
| 8 | Topic Coverage | Full per-topic self-declaration across all ~46 CAT topics, one step per cluster, 4-state tap (haven't started / learning / practicing / revision started). `exam_ready` is never self-declarable. | Always |
| — | *Instant Insight* | **Structurally never renders on this path** — see gap note below | Conditional (broken) |
| 9 | Finish Date | The ambition date from screen 2, *repriced* against actual declared coverage ("You chose 17 Sept — that needs ≈5.5h/day"). 3 fixed hour-tiers (4h/6h/8h) plus custom, each showing the resulting date. | Always |
| 9a | Coaching Plan | "Does your coaching give you a timetable?" Photo upload. | **Only if coaching-enrolled = true.** A self-study student never sees this screen. |
| 9b | Repeater Buddy Pitch | Reassurance/upsell using the two repeater answers from screen 4. Pitches the buddy. No new data written. | **Only if repeater = true.** |
| 10 | Meet Buddy | Shows a pool of real mentor profiles, honestly framed as "not yet assigned to you" | Always |
| 11 | Path Choice | Loss-aversion "two futures" card, one CTA | Always |
| 12 | Build Animation | Scripted ~6.6s fake-progress sequence — the real Blueprint was already written to the DB screen-by-screen; this is theatre over a real result, not a wait for one | Always |
| 13 | Blueprint Reveal | The payoff — fetches and renders the real, computed Blueprint (see §2) | Always |
| 14 | Log Tour | Practices the actual tap-to-log gesture on 3 illustrative (fake, labeled-as-fake) tasks. Writes nothing. Never gates completion (a prior cohort onboarded 19/19 and only 4 ever logged a real day — this screen exists because of that). | Always, appended last regardless of what's conditionally inserted |

**A real gap worth knowing about:** the code comments claim the Instant Insight screen
fires "on both doors, immediately after the coverage taps." In `OnboardingModal` it does
not — the coverage screen's callback that would populate the data it needs is never wired
up on this path, only on `/start`. A student who reaches onboarding through `OnboardingModal`
goes straight from the coverage grid to the finish-date screen. Worth deciding whether to
fix the wiring or the comment.

**Draft/resume:** the whole flow mirrors to `localStorage`, versioned and user-scoped —
closing the tab and reopening resumes at the same screen with the same answers. Every
screen's answer is written to the database immediately on advancing, not batched at the
end.

**Skip logic:** there is no global skip. Only the final Log Tour screen is explicitly
skippable at any point — a prior incident where something blocked onboarding completion
killed a whole cohort's activation, and that's now a named rule in the code comments.

### What happens right after onboarding completes

Not Home. A second sequence (`PostSignupSequence`) runs first: an install-first screen
(shows the real generated plan as social proof before asking to install), push-notification
permission ask, a **second run of the Log Tour** (because it turned out to be unreachable
from the `/start` path, so it was duplicated to guarantee every student sees it once), and a
WhatsApp opt-in. Only after this completes does Home render. The student's actual first
real study Mission is not generated during onboarding at all — it's generated fresh the
first time Home loads.

### Self-study vs. repeater — is it a real branch, or just copy?

**Genuinely a different flow, not just different words:**
1. Two extra mandatory questions for repeaters (last year's percentile, had a buddy).
2. An entire extra screen only repeaters see.
3. **Different math**, not just different copy — see §2's "Effort multiplier."
4. Revision is flagged overdue sooner for repeaters (tighter cadence multiplier).
5. Buddy-pitch copy is repeater-specific.

**What is not different:** the coverage grid, the finish-date hour tiers offered, and
whether the coaching-plan screen appears (that's gated purely on coaching-enrolled status,
completely orthogonal to repeater status).

**For the self-study/repeater lens:** the repeater branch is real and substantive — this is
one of the strongest, most evidence-backed pieces of the whole product for your stated
audience. The weak spot: a *never-coached self-studier* gets exactly the same onboarding as
anyone else, with no equivalent moment that says "here's what self-study specifically needs
that coaching would have given you." Repeaters get a dedicated pitch screen; self-studiers
don't get an equivalent one naming their specific situation.

---

## 2. The study plan engine — how a plan is actually built, in full

This is the core of the product and the section the founder most wanted detailed. There is
**no single "study-plan.ts" file** — the planner is deliberately split into a WHICH-topics
authority and a HOW-the-day-splits authority, and a guard test in the codebase fails the
build if any code tries to build a second, competing planner. Two internal reference docs
already exist and are worth reading directly: `docs/plan-engine-formulas.md` (every formula,
stated once) and `docs/CODEMAP.md` §3 (the architecture and the incidents that shaped it).

### 2.1 The authority

- **`topic-selector.ts`** decides *which topics*, for a given section, today.
- **`routine-engine.ts`** decides *how the day's minutes split* across sections and blocks.
- **`day-topics.ts`** turns a student's live coverage data into candidates for the selector.
- **`plan-day.ts`** is the single assembly function both real-time writers (the live app and
  the 6am cron) call — before this existed, the two writers hand-assembled a day separately
  and drifted out of sync with each other (a real, named incident).

### 2.2 How the weak section is chosen

One function, `resolveFocusSections()`, used by every writer in the app, with a strict
priority chain:

```
a recent, complete, decisive mock
  → the student's own self-reported weakest section
    → a baseline-diagnostic estimate
      → whichever section has the least coverage progress relative to its size
        → DILR (hard default, "DILR is where CAT is most often lost")
```

This exists because two different writers used to resolve this differently and silently
diverge — a real "split-brain" bug.

### 2.3 How hours become a concrete day

The student's own committed hours (weekday vs. weekend, set at onboarding or later) are
**never derived from a date or from behavior** — they're read directly. From there:

- **Small day** (≤75 min): weak section only if ≤45 min; weak + one other if ≤75 min.
- **Lean weekday** (working professional, weekday, non-revision phase, under 6h/day): narrows
  to weak section + one other, alternating which non-weak section rotates in, so no section
  is permanently starved.
- **Above 6h/day: every archetype gets all three sections, every day.** This is a hard rule
  — it exists because the lean-weekday logic used to silently starve QA to weekends-only
  even for a working professional with 8 hours a day, leaving 9 QA topics never opened for
  real students.
- A **"closer" task** (mock analysis, sectional, rapid recall) is reserved first, sized 15–20%
  of the day, coming *out of* the budget, not added on top.
- The weak section takes 40–55% of what's left; the rest splits across the other sections.
- Each section's minutes convert to a block count, capped at 3 blocks and 120 minutes per
  topic — this directly fixed a real case where an 11-hour/day student was getting exactly 3
  tasks total (4.5 hours on one chapter), because block count didn't used to scale with
  hours.

### 2.4 The Topic Selector — how one specific topic wins the slot

A pure, additive, fully-explainable score (the winning positive contributors literally
become the "Why?" line shown to the student — never a black box):

```
score = coverage-status points (learning=30 > not_started=22 > practicing=12 > revising=8 > exam_ready=2)
      + syllabus weightage × 8          (the dominant driver — CAT mark-weight)
      − 18 if a prerequisite is itself unstarted
      + revision-overdue points          (scaled by archetype, doubles from 1 Sept)
      + 12 if self-reported as a tough topic at onboarding
      + 25 if the student starred it as a priority
      + 22 if the student chose it as a starting focus
      + 50 if it was postponed/swapped out yesterday   ← the single highest weight
      + 45 if the coaching timetable teaches it today
      + up to 28 for syllabus-pace urgency
      − up to 40 as a cooldown against repeating a topic too soon
```

The coverage-status ordering (`learning` scores higher than `not_started`) encodes a real
philosophy shift after direct feedback from a student who'd done Arithmetic and Geometry
and expected Algebra next, but got a brand-new topic instead: **finish what you started
before opening something new.** The "postponed" bonus (+50) is the single highest score in
the system, on purpose — a broken promise to the student costs more trust than a missed
sync ever would.

### 2.5 The coverage state machine — how a topic actually advances

Ladder: `not_started → learning → practicing → revising → exam_ready`. **Three genuinely
different advancement paths, deliberately layered by how trustworthy the signal is:**

1. **Explicit self-report** (onboarding grid) — the weakest signal. Can only ever reach
   `revising`, never `exam_ready`.
2. **Confidence taps** (green/blue/yellow/red on a ticked task) — green advances one level,
   capped at `revising`; blue advances one level, capped at `practicing`; yellow only moves
   an untouched topic to `learning`; red is real regression, dropping a topic back to
   `learning`. This is capped deliberately — the code cites research (Mabe & West 1982; Zell
   & Krizan 1999) that self-assessment correlates with real ability at only about r≈0.29. A
   tap is evidence of effort and feeling, never of ability.
3. **Measured evidence — the only path to `exam_ready`.** Six required rungs: concept
   coverage, and accuracy-gated volume at easy (75%)/medium (65%)/hard (55%) difficulty,
   plus a recency-gated revision check and an exam-conditions "tested" check (a timed
   question cleared, or the topic appeared in a real mock the student has logged practice
   against within 30 days). All six are required — not "most of them" — a vacuous-true bug
   was explicitly guarded against here.

Evidence can only ever *promote* a declared status, never demote it — with the single
exception that `exam_ready` is reachable only through this evidence path, enforced three
different ways in the code (a named constant, the merge function, and a database trigger).

### 2.6 The "lifetime gate" — syllabus clock vs. memory clock

This is the real mechanism behind the "46/46" guarantee (every topic gets opened before the
exam) and is the answer to "how do we not just repeat revision forever and never touch new
topics."

Before this existed, first-contact (new topics) and revision competed inside *one* score,
and the guarantee that all 46 topics eventually got opened was only as strong as whatever
weight happened to be tuned that week — it broke for some students and held for others with
no structural reason why, and even a 90-day runway once left 7 topics completely unopened
for a real student.

Now, a day's blocks are **split between two independent clocks before any ranking
happens**:
- **Syllabus clock** — marches through unopened scope. Gets at least one block a day per
  section while anything remains unopened, more if the remaining-topics-to-days ratio
  demands it.
- **Memory clock** — revision of already-open topics. Gets whatever the syllabus clock
  doesn't need, and goes silent only while the syllabus clock genuinely needs everything.

Inside the last 14 days before a student's own target date, if the runway per unopened
topic drops to 3 days or less, revision is forced to yield regardless of how the smooth
average looks — this specifically fixed a real failure mode where the very last unopened
topic sat behind a gentle-looking average pace and revision kept winning the slot forever
("45/46 forever"). A repeat cooldown (3–6 days, growing under pressure) stops the same
topic being served every other day even while untouched — a real case had "Percentages"
served 7 times in 12 days before this existed.

### 2.7 What forces a same-day rebuild — and what doesn't

Today's plan is generated once and frozen. Exactly **two** things can force a same-day
rebuild, and both are gated on the student having ticked nothing yet today (completed work
is never wiped):

1. The student moved their own daily-hours slider.
2. Yesterday's check-in was submitted *after* today's plan already generated — the plan
   literally couldn't have known about it yet.

Notably: **falling behind pace, on its own, no longer forces a rebuild.** That used to tear
a plan down mid-morning purely because the calendar advanced a day, even if the student had
done nothing wrong yet.

### 2.8 What actually happens when a student falls behind or gets ahead — the weekly reconciler

This is the real answer to "how does the plan not shrink into uselessness for a student
who's behind." **The daily hours never move.** Once a week (Sunday evening), a reconciler
compares expected vs. actual logged hours for that week. A deficit converts into extra days
added to the target finish date — priced at the student's own daily rate — capped so the
date can never move past the actual exam day. If the student overshoots instead, nothing
special happens mechanically, but because the required daily pace is recomputed fresh every
day from real remaining coverage, extra study naturally lowers tomorrow's required pace
without ever touching the hours commitment or the date directly.

This is a deliberate, stated reversal of the old behavior (which used to shrink the plan
itself to match logged behavior and nag daily): **"keep the daily hours the same, warn about
the date weekly, never ask the student to take action themselves."**

### 2.9 Mock tests feeding back into the plan

A mock only earns the right to override the weakest-section chain if it's **complete** (all
three section percentiles present), **recent** (within 45 days), and **decisive** (at least
a 3-point gap between weakest and next section — a 1-point gap is noise and would flip focus
every mock). When it qualifies, the override is never silent — the reason ("Your last mock:
VARC 89 · DILR 99 · QA 99 — VARC needs the work") is shown directly on the plan.

Mock cadence is fixed by the exam calendar: Sunday always, plus Wednesday from October — the
founder explicitly rejected 3/week as leaving no room to actually act on what a mock's
analysis found.

### 2.10 Finish projection (done / ahead / tight / critical / stalled)

Weekly pace is a **trailing 3-week rate of topics actually first-touched via a logged study
session** — never a lifetime average, never a guess, never a manual status flip. Projected
finish date compared against the exam date and a 3.5-week buffer before it determines the
status shown. One mechanical consequence worth knowing: **every first-time student's
Blueprint literally shows "stalled" on day zero**, because nothing has been logged yet to
compute a pace from. This isn't a bug — it resolves the moment the student logs their first
real day.

### 2.11 The repeater vs. first-timer difference — concrete, not cosmetic

This directly answers the founder's own question about whether repeater status changes the
algorithm or just the words around it. **It changes the algorithm, on at least four
independent axes:**

1. **Effort multiplier on remaining hours** — the biggest one. A repeater's estimated
   remaining syllabus hours are multiplied down based on last year's percentile: ≥90th →
   0.55×, ≥80th → 0.65×, ≥70th → 0.80×, below 70th → 0.90×. A repeater who answers "yes,
   repeater" but skips the percentile question gets a flat 0.80× — deliberately the middle
   band, not the most generous one, because guessing generously would quietly promise a
   date they can't actually hit. **A repeater who scored 88th percentile last year is quoted
   roughly half the hours a first-timer is quoted for the identical syllabus** — this changes
   the actual required-pace number and the feasibility verdict, not just the wording around
   it.
2. **Revision cadence** tightens for repeaters (×0.7 — flagged overdue sooner, on the theory
   that a second-attempt student relearns and forgets faster under pressure) vs. loosens for
   working professionals (×1.4).
3. **Phase floor** — a repeater with no explicit stage answer is floored at "intensive," not
   defaulted to "foundation," on the reasoning that they've already been through one full
   cycle.
4. **The daily closing task** — a repeater's closer is always mock analysis / re-opening
   their last mock, regardless of day length, versus a lighter sectional for others.

**What is explicitly NOT used in the planning algorithm:** whether the student had a buddy
last year. That field exists and is captured, but it only feeds the human buddy's briefing
context — it never touches `routine-engine.ts`, `topic-selector.ts`, or the pace math. Only
*last year's percentile* reshapes the actual hours arithmetic; "did you have help" is
relationship context, not planning input.

**For the self-study/repeater lens:** this is the single most evidence-grounded,
differentiated piece of the entire product for your stated audience. It's real, it's not
marketing, and it's arguably under-surfaced — a repeater is quoted a genuinely different,
lower hours number, but it's not clear anywhere in the product that this is *because* of
their repeater status specifically, as opposed to just being "their number." Making that
causal link visible ("you need fewer hours than a first-timer because you've done this
before") could itself be a retention/trust lever worth testing.

---

## 3. Daily logging, streaks, and the habit loop

### 3.1 What a student can actually log

Two different surfaces write to the same underlying record, and they mean different things.

**The full log sheet**, deliberately reduced (10 Aug redesign) to three inputs, not a richer
set an older version had:
1. **Today's plan** — the actual plan tasks for the day, each tapped Not done / Half / Done.
   Sections studied are *derived* from which tasks were marked, not typed — there's no
   free-text "what did you study" field anymore.
2. **Did you take a mock today?** Yes/No, with inline percentile fields if yes.
3. **Rest day toggle** — clears any plan marks, and the copy is explicit: *"Taking today off.
   It still counts as showing up — your streak stays alive."*

At least one of the three must be true to submit — nothing can be logged empty. Hours are
now **computed** (a fraction of the day's plan-generated hours, proportional to how many
tasks were marked full vs. half), not typed by the student.

**The check-in gate** — shown once per app open, only when yesterday has no entry. One
question, four buttons: Studied / Studied a bit / Didn't study / Rest-away, with a
follow-up "what got in the way" picker for the middle two options (10 reasons: office,
college, plan too heavy, didn't know what to study, lost motivation, health, family, travel,
mock ran long, other). This is a reflection, not a study claim — it submits with zero hours.

A student can only ever log today or yesterday — nothing older is accepted.

**Emotional mood chips exist end-to-end in the backend but aren't currently asked anywhere
in the UI** — a still-wired but presently orphaned channel, worth either resurrecting or
removing.

### 3.2 The streak rule — changed 10 Aug, and this matters

**The streak counts consecutive *logged* days, full stop — not consecutive study days.**
Any row in the daily-reports table keeps it alive, study or rest. It is explicitly not
gated on actual study duration anymore. A rest-day log counts. A single half-tap on one
task counts. The only thing that breaks a streak is zero rows for a calendar day — not
opening the app to log at all.

The underlying computation is a full recompute on every write (not an increment-in-place)
— it re-derives the current run from every logged date the student has, which makes it
robust to backdated fills from the check-in gate rejoining a broken-looking run correctly.

### 3.3 Momentum Shields

Cap of 3. Earned via a 21-logged-day counter, separate from the streak itself — every new
logged day (not an edit) advances it; hitting 21 while under the cap adds a shield and
resets the counter; hitting 21 while already at 3 still resets the counter but the shield is
lost, not banked.

Spending a shield is **manual, one tap — "Snapchat-style," explicitly not automatic.** A
fully missed day breaks the visible streak; the student must tap "Restore," which requires
holding at least one shield, bridges the gap by re-anchoring the streak's date pointer (it
does not insert fake logged-day rows), and costs exactly one shield. This does not run
itself in the background — the student has to choose to spend it.

### 3.4 Milestones

Confirmed exact numbers: **7, 15, and 30 days.** (Not 7/15/30/21 — 21 belongs to the shield
system's earning threshold, not the milestone messages.) Milestone copy always outranks the
random "keep going" bonus line on the same log — they're mutually exclusive.

The "plan rebuild" celebration shown after logging is honest about what it represents: the
progress-bar fill is deliberately paced theatre, but the plan content it reveals underneath
is real. The copy used to overclaim that a check-in itself "rebuilds" or "reorders" the
plan — it was corrected because a plain check-in about yesterday doesn't actually regenerate
today's task list (see §2.7); it only shows a causal "why" line when the underlying engine
produced one that's provably true.

### 3.5 Recovery — two entirely separate systems share the word "recovery"

**(a) The habit-recovery system — this is the one that matters for the loop.**

*Reactive*, at the moment a student logs again after a gap: if the gap is ≥2 days with a
prior streak greater than zero, it's classified a "comeback," logged, and the buddy gets a
notification framed explicitly without guilt — *"back after N days — a good moment to reach
out, no guilt."*

*Proactive*, cron-driven, while the student is still quiet — no buddy involved at this
stage. Every student sits in exactly one state based on days since their last log: active
(0–1 days), slipping (2–6), inactive (7–13), dark (14+). Slipping/inactive/dark students are
explicitly excluded from ordinary product nudges (a "your revision is due" push to someone
five days quiet ignores reality) and instead receive only a four-tier recovery ladder at
exactly days 2, 4, 7, and 14, with copy that never blames the gap:
- Day 2: *"Your routine is still waiting — the gap doesn't matter."*
- Day 4: *"Start again from today — the missed days are ignored."*
- Day 7: *"Today's routine is rebuilt — a week away changes the plan."*
- Day 14 (the final automated touch): *"Your CAT routine has been rebuilt."* After this,
  only a human — sales or admin — takes over.

A separate, gentler path exists for same-day misses specifically: a morning reminder to
anyone who opened the app yesterday but didn't log, deep-linking straight to a
yesterday-backfill — explicitly framed in the code as *"we are not trying to break streaks,
we want maximum daily logs for maximum days,"* not a guilt mechanism.

**(b) Push-subscription recovery — unrelated to study habits, don't conflate it.** This is
about dead browser push subscriptions specifically (a hard platform limitation — a dead
subscription can only be revived by the student reopening the app), surfaced to admins via a
daily digest. Shares the word "recovery," nothing else.

**For the self-study/repeater lens:** the whole habit-loop system is genuinely well-built and
psychologically careful — no guilt framing anywhere, rest days protected, manual shield
control. The honest gap, from the live numbers checked this session: **very few students are
actually reaching the point where any of this matters.** Under 3% of the base logs on a
given day, and only one student in the entire base currently holds a streak past 7 days.
This machinery is proven-good in design; it hasn't yet proven itself in outcomes at your
current scale, and that gap — not a missing feature — is probably the highest-leverage thing
to study next.

---

## 4. Community and social features

### 4.1 Daily Pick — two systems sharing one name

**The rotation engine** decides which *kind* of card a student sees each day, from five
kinds (question, mirror-of-their-own-data, community vote, peer comparison, open
reflection), weighted but overridden entirely by a scheduled curated question whenever one
exists for the day. Selection is deterministic per student per day (hashed, not random —
refreshing never re-rolls it), with a rule against repeating the same kind three days
running.

Curated questions are **founder-approved, pre-written batches** — not student-submitted.
Each carries its own time target (default 90 seconds, calibrated per section, with the rule
that a prepared student should need 60–80% of it — "hard enough to feel the rush"). The
timer starts on open (reading time counts) and never blocks an answer — a hard cutoff would
turn a daily habit into something failable. **The timer itself is the share mechanic** — the
forwarded WhatsApp text is framed as a dare ("I solved this in Ns — can you beat me?"), on
the explicit principle that people forward a challenge, never an ad.

**The community-pipeline promotion engine** is separate — it decides which single
*student-submitted* tip or question holds the "Today's Pick" slot.

### 4.2 Contributor system — submission, voting, reward

One submission per student per day, no exceptions — described in the code as "the BeReal
rule: the limit creates quality." Two content types only: a short tip or a photographed
question. No comments, no open feed, no real names shown (a random first name is attached).
Automated safety screening happens before anything goes live; **educational quality is never
human-moderated pre-publication** — the community decides quality entirely through voting.

Ranking uses a Wilson lower-bound score, not raw vote count, so a handful of enthusiastic
votes can't beat a large, consistently-well-received item. One item holds the top slot for
exactly one day; the shelf never runs dry — once everything has had a turn, the oldest
recycles back in.

**The reward, and this is worth knowing precisely:** top 10 contributors each month (ranked
on net helpful votes, with a floor of 5 votes so one friend can't win it) get **free Buddy
access for a month.** There is no public leaderboard — a student only ever sees their own
rank, privately, and only once they clear the eligibility floor. The stated design law,
repeated across multiple files in the codebase, is that a visible participant count or vote
count at this stage would read as evidence the room is small, not as social proof.

### 4.3 Peer Pulse — the "you are not alone" engine, and its most important design rule

Three distinct outputs:
1. Whole-base facts ("N students studied today").
2. Cohort comparisons against real matched peers — a ladder that walks from a tight match
   (same repeater status + prep phase + weak section) to a broad one (everyone) until it
   finds at least 5 real peers, returning nothing at all if even the broadest rung can't
   clear that floor.
3. Self-vs-observed — what a student said they'd do versus what they actually did. This
   needs no peer base at all and is framed as "the plan is wrong," never "you are lazy."

**The rule that matters most here:** any statistic that could reveal how small the total
active base is stays completely hidden until **250 students are active that same day.**
This is a deliberate product rule, not a technical limitation — the founder's own correction
is preserved in the code: *"9 students studied today" at ~319 signups reads as evidence the
app is small, not social proof — nobody wants to be the first customer in an empty shop.*
The governing principle, verbatim: *"Never use numbers to prove CareerRai is POPULAR. Only
use numbers to prove CareerRai is USEFUL."*

**For the self-study/repeater lens:** at current real activity levels (well under 250
students logging on any given day), the entire population-proof layer of Peer Pulse is
mechanically dark right now — it exists, it's well-designed, and it is not yet visible to
anyone. Only the self-vs-observed and (where 5 real peers exist) cohort comparisons can be
live today.

### 4.4 Moderation

Real and server-side, not cosmetic — confirmed as a Play Store UGC compliance requirement,
not just a nicety. A report button offers 4 reasons; at 3 distinct reports on one item, it's
automatically pulled from every voting pool and lands in a manual founder review queue —
automated protection, human final call. Blocking, once set, silences a pair of users in both
directions.

### 4.5 WhatsApp — what's live, and what's built but dormant

**What's actually live:** a WhatsApp *Group* invite (admin-only posting), promising exactly
"2 messages a day," weighted by how reachable a given student already is through other
channels — a student with no app install and no push notification gets the strongest,
most-necessary version of this ask, because for them it may be the only channel that
reaches them at all.

**What's built but not wired up:** a more general WhatsApp/Instagram/Telegram Channel
abstraction, with a full API for prompting, joining, and recording engagement — but with
zero call sites in the current UI. The event names for it exist in the analytics system but
are never actually fired anywhere. This reads as designed-ahead-of-need, not broken.

**There is no peer-to-peer referral program anywhere in the codebase.** No referral code, no
invite-a-friend bonus, no tracked relationship between a referrer and a referred student.
The only reward tied to sharing behavior at all is the contributor-of-the-month Buddy prize,
which rewards content quality, not bringing in new users.

### 4.6 Buddy check-in — the accountability layer that's invisible to the student

A cron identifies students who've missed 2+ consecutive log days (but not so many that it's
past the point of a check-in and needs a real call instead), picks the strongest available
real signal about why (a broken streak, silence after a mock, a blocker the student
literally typed in a past log, a cold priority section), and **drafts** — never sends — a
message in the mentor's own voice, built from that student's real data. The mentor sees this
as a card on their own dashboard with a "why this surfaced" explanation, and one tap sends it
from their own real identity into the real chat thread. The reasoning for draft-not-autosend
is stated plainly in the code: a message from a mentor's account that the mentor has never
seen is a trap — the student replies, nobody answers, and the promise that a real human is
watching becomes a lie. **The student never sees any trace of the mechanism** — from their
side, it's just a message that arrived from someone they already know.

### 4.7 No leaderboard, anywhere, by design

Searched explicitly — the only hits are code comments actively rejecting the idea, in three
separate places. Content is ranked; people are never ranked publicly. The closest thing —
private contributor standing — is deliberately ordinal-only and never shown as a public
board with names.

**For the self-study/repeater lens:** the whole community layer is built around one
consistent, disciplined principle — never let a number reveal how small the room currently
is. That's the right instinct at this stage, but it also means the community layer is
currently doing very little *visible* work for a self-studier looking for peers, because so
much of it is gated dark until real density exists. The repeater-specific angle (§4.2's
tip/question content, §4.6's check-in signals) is stronger and already live; the
"community of self-studiers finding each other" angle is built but not yet population-proof.

---

## 5. The buddy/mentor system

### 5.1 Matching — three different mechanisms, easy to conflate

1. **Permanent buddy assignment (the paid subscription)** — **not automated.** A payment
   queues the student for assignment; a human admin picks the actual mentor by hand, with
   no capacity check enforced in that code path today. A 24-hour SLA alert tells the founder
   if a paid student has gone unassigned that long — it's a founder-facing alert, not a
   self-healing system.
2. **The showcase ranker** — used only to *display* candidate mentors before a purchase
   (onboarding, paywall, sales conversion screens). Scores on section-match, shared repeater
   journey (weighted higher when the mentor herself improved meaningfully between her own
   two attempts), and profile completeness. Never touches an actual assignment.
3. **The real, consequence-bearing matcher** — used only for the ₹299 single session.
   Capacity is a hard gate here (a mentor with no room isn't scored lower, they're not
   considered at all), and the booking flow is explicitly ordered "capacity → match → charge"
   so a student is never charged for a session nobody can actually deliver.

**A claim worth verifying, not assuming:** student-facing copy states "Max 5 students per
mentor. Ever," citing a database trigger. No such trigger could be found in the migrations,
and the actual assignment endpoint has no capacity enforcement of any kind today. The
`MENTOR_OVERLOAD_THRESHOLD` that does exist is a soft admin-dashboard alert set at 8, not a
hard cap at 5. Worth confirming directly against the live database before this claim is
relied on anywhere.

### 5.2 The three paid tiers — what's actually different between them

| | ₹299 single session | ₹999 monthly | ₹2,999 till-CAT |
|---|---|---|---|
| Grants ongoing buddy relationship? | No — one 45-minute call, then done | Yes | Yes |
| What's different from the tier next to it | Its own entitlement system entirely — the student stays a free user | — | Same service as monthly, just 4 months paid at once |

**The finding worth being direct about: monthly and till-CAT are the identical service.**
Same code path, same relationship, same everything a student receives — the only
difference is how many months are paid for in one transaction. There is no current
service-tier difference (no extra check-ins, no priority mentor, nothing) between them.
That's not necessarily wrong, but it's worth knowing plainly rather than assuming pricing
implies a different product.

The ₹299 session exists as its own system specifically because, before it did, there was
no way to sell a single session without accidentally granting the entire membership — both
used to be gated by the same single flag.

### 5.3 The diagnosis-first flow, and the "two doors"

Before any sale is pitched, a diagnosis engine computes findings **entirely from that
specific student's own real data — never an invented or population-average statistic.**
Possible findings include: consistency gap (logged vs. planned hours), a mock score
dropping or plateauing, one section badly under-covered while others progress, no mock in
14+ days or ever, the same topic swapped out of the plan repeatedly (avoidance), a repeater
whose weakest section at signup is still their weakest section now. Findings are capped at
exactly 3 shown — the reasoning stated directly in the code: one finding reads as
nitpicking, five reads as an attack. A prior version padded the card to 3 with generic
neutral facts when a student had fewer real findings than that; this was deliberately
removed, because it turned an honest weakness card into a manufactured status card. If a
student genuinely has nothing notable, the card shows nothing invented.

The card that follows is always structured the same way: the finding and its evidence, what
a mentor would actually do about it, the mentor's real (never invented) credentials, and
then **two doors, both real** — pay ₹299 to talk to this specific mentor about this specific
finding, or a genuine self-fix path that lets the student act on the same finding alone. The
self-fix door is explicitly not a decoy; it exists because the product's own promise is that
a student becomes independent, and a purely sell-only card would contradict that promise.

### 5.4 Chat, video sessions, and the AI-assisted briefing

**Chat** is real, persistent, bidirectional messaging — attachments, soft delete (only the
sender can delete their own message, and it leaves a tombstone rather than rewriting
history), two-way blocking, reporting, read receipts, and live delivery. Pushes from the
same conversation collapse into a single notification instead of stacking one-per-message.
An AI assistant can draft **facts only** for the mentor to review — never a ready-to-send
reply — with a client-side check that nudges the mentor if their sent message looks too
close to the AI's raw bullets, on the stated principle that "AI gathers the facts, the buddy
writes the actual words."

**Video sessions** run on one permanent meeting room per mentor (not a fresh link per
booking), with database-level protection against double-booking and against a stale
unresolved session from silently blocking a mentor's whole calendar. A session's window
opens 30 minutes before start and stays valid for an hour after the scheduled time. If a
session's window passes with no outcome recorded, it's marked "expired," not "completed" and
not "cancelled" — deliberately, because either of those would assert something false; the
honest state is that nobody recorded what happened.

**The buddy briefing** is an on-demand (never ambient/automatic) AI summary of a specific
student's real data — streak, coverage gaps, high-weight topics still untouched, mock trend,
and a pattern-detector for plan avoidance (sections repeatedly served but rarely completed).
It's built to state only verifiable facts, phrased as open questions where a pattern seems
notable rather than as a diagnosis — advice stays with the human mentor, not the model.

### 5.5 Mentor Operations — how the founder actually manages mentor supply

A single admin view where a healthy, unblocked mentor simply doesn't appear at all — the
explicit design goal, quoted directly from the code: *"healthy mentors disappear."* Every
mentor shown is in exactly one state: can't run a session (no meeting room set despite
having assigned students), a session expired with nobody joining, overloaded (8+ assigned
students), a pending payout, or available for a new assignment.

### 5.6 Repeater-specific positioning

The repeater buddy-pitch screen at onboarding is copy and framing only — it doesn't touch
matching logic itself. The real repeater-aware matching lives inside the two rankers already
described: a repeater is scored higher toward a mentor who was herself a repeater with a
real, verified improvement between her own two attempts (weighted higher than a mentor's
self-checked "I help repeaters" tag, specifically because it's real journey data rather than
a claim), and, for the paid single-session matcher, toward a mentor whose own `attemptNumber`
was greater than one. There's no separate repeater-specialist mentor pool or distinct
routing path — it's a scoring boost inside the one matcher every student shares.

**For the self-study/repeater lens:** the diagnosis-first flow (§5.3) is arguably the
strongest single piece of product-market fit evidence in the whole codebase for this exact
audience — it's built to never say anything invented about a specific student, which is
precisely the credibility a self-studier or repeater (who's often already skeptical of
generic advice) needs to trust a pitch enough to pay ₹299. The repeater-mentor matching
being a scoring boost rather than a dedicated pool is a reasonable choice at current mentor
headcount (6 mentors total, per this session's own data) but will need real reconsideration
the moment mentor supply grows enough to support genuine specialization.

---

## 6. Monetization and payments

**Freemium boundary, stated precisely:** the entire study plan, daily tracking, streaks,
and coverage system are free, full stop. Only the buddy/mentor relationship is paywalled.
The single gate function used everywhere is explicit that it must never be checked inline
elsewhere — every real-buddy surface (chat, sessions, mock debriefs, feedback) is gated
through it, and everything else in the product is not.

**Plans:** ₹2,999 for 4 months ("till CAT" — the buyer's actual mental unit is "till the
exam," not "months," per the code's own framing), ₹999 for 1 month, and the ₹299 single
session on its own separate entitlement system that doesn't touch the premium flag at all
(see §5.2). A refund reverts premium status but never touches the student's logs or plan
data — none of the free-tier value is ever taken away.

**GST** is fully built but switched off — the founder's decision, since collecting a tax
the company isn't registered to collect is worse than not charging it, and the company is
well under the ~₹20L threshold that would require registration. When it's switched on later,
subscriptions are priced tax-inclusive (the sticker price never moves) while the ₹299
session is tax-exclusive specifically so the full ₹299 still reaches the mentor.

**A real platform-specific bug worth knowing:** inline payment checkout is broken inside the
iOS installed-app/App-Store wrapper context (measured: zero for twenty-one iOS-PWA payment
attempts succeeded before this was found and fixed), so iOS traffic is routed through a
signed hand-off link into the real Safari browser instead, while Android's TWA wrapper uses
a popup hand-off, and everything else stays inline.

---

## 7. Notifications

**The honest current state, not the aspirational one:** in-app and push are the two channels
an automated decision engine can actually choose between. WhatsApp is not an automated
channel today — what exists under that name is either a human admin manually composing and
sending a message, or the passive broadcast Group described in §4.5. Email is wired but only
fires when a specific caller chooses to include it, not something the decision engine picks
on its own.

Every student sits in exactly one behavioral state (building a plan / plan ready but
unlogged / in the first-week onboarding arc / active / slipping / inactive / dark), and only
that state's message family is allowed to speak to them — this is the mechanism that keeps
a "your revision is due" nudge from ever reaching someone who's actually gone quiet for a
week (see §3.5). Every send passes through one shared daily budget per student (4 messages
in the normal active state, 8 during onboarding, 8 during active recovery) so multiple
automated systems can never accidentally stack sends on the same person.

Push subscriptions must be created from inside the installed app, never a browser tab — the
measured survival difference is stark (roughly 25% for browser-born subscriptions versus
roughly 92% for app-born ones), which is why push permission is only ever asked for right
after a student installs and reaches their first real value moment, never earlier.

**The rating-prompt feature** (built this session): three triggers — a streak milestone, a
completed mock, and the onboarding Blueprint reveal. Eligibility requires an account at
least 3 days old (which structurally makes the Blueprint-reveal trigger a no-op today, since
that only ever fires on day zero — deliberate, not a bug, and a one-constant change if that
should change), is permanently suppressed after a rating or a "don't ask again," capped at 3
lifetime asks, with a 21-day cooldown between asks, persisted server-side so it holds across
a student's devices.

---

## 8. Platform and install

Three real distribution shells, chosen automatically by device/context detection: iOS goes
straight to a universal App Store link (deliberately outranking every other option, since it
opens the real App Store app even from inside Instagram or WhatsApp's in-app browser, and
replaced what used to be a 3–4 tap manual "Add to Home Screen" process with no way to tell
if it actually worked); Android uses the browser's native install prompt where available, a
manual guide where it isn't, or a hand-off into Chrome first if launched from inside a social
app's webview; a separate Android TWA store build exists as its own package. Every
environment combination is covered by a test asserting it resolves to exactly one
non-duplicated live path.

---

## 9. Admin, ops, and analytics

**The Exception primitive** — a founder directive to stop building a bespoke dashboard per
problem domain and standardize on one shape instead: every operational problem is a domain,
a severity, a plain-English reason, the raw evidence behind it, a suggested action, and —
non-negotiably — a link that drills into the *exact* affected records, never just a chart.
The stated rule: "an exception you cannot drill into is a chart, and this contract does not
permit charts." **Worth flagging plainly: this is a designed contract, not yet consumed
anywhere in the live admin product** — no current admin page actually produces or reads an
Exception yet. A related but separate, already-live mechanism (the Founder Inbox) already
assembles real, drillable action items from live data today.

**Eleven fixed admin workspaces** (Command, People, Sales, Buddies, Study plan, OCR,
Engagement, Revenue, Analytics, AI, Operations), enforced by a guard test that fails the
build if any admin page isn't mapped to exactly one of them — an orphan or double-claimed
page is structurally impossible. Tabs with no real underlying data source are shown
disabled with the actual blocking reason on hover, rather than displaying a fabricated
number.

**Analytics** flow through one event table, fed by every client-side tracked action, enriched
server-side with real device/display-mode/network context, and opportunistically used to
heal a student's "last seen" and "app installed" status from a trustworthy signal. Two
separate founder-facing summaries exist: a live behavior dashboard, and a daily digest email
explicitly built "answer-first, never just a dashboard" — assembled from milestones, the
decision log, and notifications, always ending in a queue of things still waiting on a human
approval, because the automated decision engine never sends anything above a certain
importance threshold on its own.

---

## 10. Known gaps and things worth verifying directly — a consolidated list

Pulled together from every section above, because a founder reading this for "what to fix"
shouldn't have to re-scan the whole document:

1. **Instant Insight never renders on the main (`OnboardingModal`) signup path** — only on
   `/start`. Either the wiring or the comment claiming otherwise is wrong.
2. **Emotional mood chips are fully wired end-to-end in the backend but asked nowhere in the
   current logging UI** — a live but currently unused channel.
3. **"Max 5 students per mentor" is asserted in student-facing copy as database-enforced,
   but no such enforcement could be found anywhere in the code.** The real cap that exists
   (8) is a soft admin alert, not a hard limit. Worth confirming against the live database
   directly.
4. **Monthly and till-CAT subscriptions are, today, the identical service** — differing only
   in how many months are paid for upfront. Worth deciding if that's intentional.
5. **There is no referral program anywhere** — the event names exist in the analytics system
   but nothing fires them, and there's no reward mechanism for a student bringing in another
   student. The only sharing-adjacent reward (contributor of the month) rewards content
   quality, not referrals.
6. **The broader WhatsApp/Instagram/Telegram Channel system is built but has zero live call
   sites** — designed ahead of need, not broken, but not doing anything today either.
7. **The Exception primitive is fully built but not consumed by any live admin page yet** —
   a real, ready piece of infrastructure sitting unused.
8. **Peer Pulse's population-proof numbers are mechanically dark at current real activity
   levels** (the gate is 250 students active on the same day) — by design, correctly, but
   worth knowing this whole layer isn't doing visible work yet.
9. **The core habit loop (streaks, shields, milestones) is well-designed but not yet
   converting into real outcomes at current scale** — under 3% daily logging, one student
   past a 7-day streak, per this session's own live data pull. This is the gap most worth a
   founder's direct attention, more than any single missing feature.

---

## 11. Closing — reading this specifically through the self-study/repeater lens

What already exists that genuinely, specifically serves this audience, not generically:

- The **repeater effort multiplier** (§2.11) — a real algorithmic recognition that a
  repeater needs fewer hours for the same syllabus, not just sympathetic copy.
- The **diagnosis-first buddy pitch** (§5.3) — built to never say anything invented about a
  specific student, which is exactly the trust bar a skeptical self-studier or twice-burned
  repeater needs cleared before they'll pay for anything.
- The **honest, guilt-free recovery ladder** (§3.5) — built specifically for someone whose
  motivation is fragile and self-generated, which describes a self-studier far more than a
  coached student with an institute chasing them.
- The **"finish what you started" coverage philosophy and evidence-only mastery** (§2.5) —
  built for someone who has to trust their own self-assessment less than a coached student
  would, because nobody is checking their work but the app.

What's real but not yet proven at scale for this audience specifically:

- Everything in §4 that depends on population density (Peer Pulse's social-proof numbers,
  a genuinely large repeater community) — the infrastructure is built well, but the room
  isn't full enough yet for a self-studier to actually feel "not alone" from it today.
- Whether the never-coached self-studier (as distinct from the repeater) has an onboarding
  moment that speaks to their specific situation the way repeaters get one — right now they
  don't.

This is the actual state of the product, in full, as of 17 August 2026. Use it to decide
what to build next, not to assume what's already there is finished.
