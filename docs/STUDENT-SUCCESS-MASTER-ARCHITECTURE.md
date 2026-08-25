# CareerRai — Student Success + Sales Operating System
## Master Architecture

**24 Aug 2026 · Co-founder architecture pass. NO CODE. NO MIGRATIONS. NO CONFIG.**
Consolidates: Sales Intelligence research · Phase 1 · Phase 1.5 · Phase 2A ·
Phase 2B-1 · Student Success OS · the push/retention findings · and a new
finding on session delivery that changes the conversion half of the plan.

Labels: **FACT** (verified in production this session), **INFERENCE**,
**RECOMMENDATION**, **UNKNOWN**.

---

## 0. The finding that must be read first

You named **completed 1:1 sessions — not bookings** as a primary metric. I went
to verify it was measurable. It is not, and the reason is worse than an
instrumentation gap.

**FACT — every video session ever created in CareerRai:**

| session_status | rows | have `started_at` | have `ended_at` |
|---|---|---|---|
| expired | 9 | **0** | **0** |
| cancelled | 7 | **0** | **0** |
| **completed** | **0** | — | — |

**Sixteen sessions have been created. Nine expired with nobody joining. Seven
were cancelled. Not one has ever been completed** — and `started_at` /
`ended_at` are NULL on every row, so even if a session *had* happened, the
system could not tell you.

**Two conclusions, and both are load-bearing:**

1. **The paid product has never been successfully delivered.** Not once.
2. **Your primary conversion metric is structurally unmeasurable today.**
   Nothing marks a session complete — no join detection, no mentor
   confirmation, no attendance record.

**RECOMMENDATION — this changes the order of work.** Selling more of something
that has never been delivered is the precise failure TRUST-OS names: *"A
flawless payment with no live buddy behind it is a failure of this OS."*
**Before any conversion target exists, one session must actually happen,
end-to-end, and be recorded.** That is a prerequisite, not a phase.

*(Context: the incident archive already records dead video-session links, a
mentor losing the Join button at T+0, and a pair sent to two different rooms.
This is a known-fragile surface, not a surprise.)*

---

## 1. The student-success lifecycle (Q1)

```
SIGNUP
  ↓  ← 22% cross this within 3 days (flat across cohorts)
FIRST PLAN SEEN
  ↓
FIRST MEANINGFUL LOG          ← the activation moment
  ↓  ← only 5–10% return on D1
D2 RETURN                      ← the habit gate; where we lose most
  ↓
D3 / D7 SUSTAINED
  ↓
WEEKLY RHYTHM (habit formed)
  ↓
MENTOR INTENT (buddy taps, intent door)
  ↓
BOOKED SESSION                 ← 16 ever
  ↓
COMPLETED SESSION              ← 0 ever  ⚠ THE BREAK
  ↓
SUBSCRIPTION / CONTINUED VALUE
```

**Where each stage actually breaks, from measured data:**

| Stage | Number | Failure class |
|---|---|---|
| Signup → first log (3d) | ~22%, flat | **Product / onboarding** |
| First log → D1 return | 5–10% | **Channel + product** |
| Has any return channel | **18.7%** (149/795) | **Architecture (PWA ceiling)** |
| Reachable → clicked | **1.1%** (57 of 5,066) | **Message fatigue (~4 push/day)** |
| Opened but didn't log (7d) | **302 students** | **Product friction** |
| Booked → completed session | **0 of 16** | **Delivery** |

## 2. The salesperson lifecycle (Q2)

```
System detects a signal  →  student enters a lane  →  rep sees a card with
evidence  →  rep contacts  →  rep records outcome + REASON  →  system watches
the student for 7 days  →  outcome attributed against a matched baseline  →
reason aggregates into product intelligence
```

**The rep is not a channel. They are the instrument that converts a behavioural
signal into a human explanation — and the explanation is the asset.**

## 3–4. What the rep sees each morning, and does all day (Q3, Q4)

**One screen, four answers, zero decisions about who to call:**

```
TODAY — 12 students need you

  6  activation      never logged, joined 2–7 days ago
  3  going cold      had a rhythm, silent 3+ days
  2  follow-up due   you promised
  1  mentor intent   asked about a buddy

Each card:
  WHY NOW      "studied 5 of 7 days, then 0 in the last 3"
  EVIDENCE     14-day study strip · last mock · weakest section (with source)
  WHAT TO DO   "ask what changed; get one topic committed for tonight"
  LAST TIME    what was said, and what the student did afterwards
  DO NOT       already contacted twice this week · DND · paying student
```

**After the call — four fields, no more:** outcome · what the student *said*
(the reason) · promise made · next action. **The "reason" field is the one that
becomes product intelligence (§10), so it is structured, not free text.**

## 5–6. Automatic vs human (Q5, Q6, Q16, Q17)

| System surfaces automatically | Human decides |
|---|---|
| Who is at risk, and the evidence | Whether this student wants contact today |
| Lane and priority order | What to actually say |
| Contact caps, DND, paying status | Whether the student is *ready* for a mentor |
| Promise due dates | Whether a reason is genuine or deflection |
| Outcome measurement vs baseline | Whether a product complaint is real |

**Should eventually be automated:** lane detection (done), queue ordering
(done), follow-up scheduling (done), outcome measurement, reason aggregation,
routine nudges that reps prove work.

**Must never be automated:** the judgement that a student is ready to be sold
to; the decision to stop contacting someone; interpreting *why* a student
stopped. **A wrong automated pitch at a low moment is exactly the BYJU'S
mechanism, and no model should be trusted with it.**

## 7–9. Measurement, successful interventions, incremental impact (Q7, Q8, Q9)

**A successful intervention is not a completed call. It is:** the student
performed a *meaningful* study log within 72h **and** it survived 7 days
(sustained check — a log that dies in a week was a checkbox, not a habit).

**The metric tree:**

| Level | Metrics |
|---|---|
| **North star 1** | **Incremental activated study-days** — above the matched-lane baseline |
| **North star 2** | **Completed sessions** — *currently unmeasurable, see §0* |
| Student | first log · D1/D3/D7 return · consecutive days · logs/week · reactivation |
| Intervention | eligible → reached → intervened → recovered-above-baseline → converted · time from signal to contact |
| Quality | follow-up honoured % · note usable by next caller · disposition accuracy |
| Guardrail | DND rate · complaints · frequency-cap breaches · unreachable rate · paying-student-pitched (must be 0) |
| Activity (**diagnostic only, never targets**) | calls · messages · students touched · hours online |

**Incremental impact — the honest ladder:**

1. **Associated outcome** — descriptive, week 1. Never called impact.
2. **Lane-matched comparison** — reached vs unreached *within the same lane*.
   Controls for the fact that reps work the highest-priority students first.
   **Live here for months.**
3. **Propensity matching** — later, on tenure/prior logs/momentum.
4. **Randomised holdout** — only when volume supports it. Ethically clean here:
   we cannot reach ~600 students anyway, so randomising *which* we reach
   withholds nothing that was on offer.

**Everything labelled ASSOCIATED WITH CONTACT. No rate printed below 30
observations — show UNAVAILABLE.**

## 10. Remarks → product intelligence (Q10)

**This is the piece you identified as under-built, and I agree it is the most
valuable thing in the document.**

The rep's "reason" field must be a **structured category plus free text**, not
free text alone — free text cannot aggregate, and aggregation is the whole
point:

```
reason_category   timetable_mismatch · no_time · exam_far_away ·
                  using_other_app · app_confusing · notification_never_seen ·
                  content_not_relevant · personal · price · other
reason_verbatim   the student's own words (for the founder to read)
```

**Then the loop that makes CareerRai learn:**

```
37 students independently say "coaching timetable doesn't match my plan"
        ↓
system aggregates by reason_category
        ↓
founder sees: "timetable_mismatch — 31% of all drop-off reasons this month"
        ↓
this is no longer a sales remark; it is a PRODUCT REQUIREMENT
        ↓
product change ships
        ↓
measure whether that category shrinks next month
```

**A rep saying it once is an anecdote. Thirty-seven saying it is a roadmap.**

## 11. Preventing duplicate/contradictory metrics (Q11)

**Verified this session — every concept has exactly one implementation:**

| Concept | Canonical | Verified |
|---|---|---|
| Identity | `profiles.id` | ✓ |
| Lane | `classifyLane` | 1 definition |
| Conversion score | `scoreConversion` | 1 definition |
| Weakness | `resolveFocusSections` | 1 definition |
| Queue | `buildCallQueue` | 1 definition |
| Status vocabulary | `LEAD_STATUSES` = DB CHECK | ✓ |
| Ownership | `lead_outreach.owner_id` (atomic claim) | ✓ |
| Ownership history | `sales_activity` | **no new table** |
| Notification gate | `dispatch()` | single send gate |
| MIS | `sales-control-tower.ts` | extend, never fork |

**The rule:** a metric exists in exactly one module; pages render it, never
recompute it. **New tables proposed in this document: one** (intervention
ledger). Everything else extends what exists.

## 12–15. The four views (Q12, Q13, Q14, Q15)

### Founder — five questions, not fifty charts

```
1. ARE STUDENTS USING CAREERRAI?     active loggers · activation % · D7 curve
2. ARE REPS IMPROVING THAT?          recovered above baseline, by lane
3. ARE STUDENTS CONVERTING?          completed sessions (⚠ unmeasurable today)
4. WHY ARE STUDENTS FAILING?         top reason_categories, ranked
5. WHAT DID WE LEARN THIS WEEK?      one paragraph, with evidence and confidence
```

Every number drills to its students. No number without an evidence class.
No daily per-rep percentages (at 3 calls/day that is noise attached to a
person's name).

### Product team

Aggregate failure map: where the funnel breaks, by cohort and segment; which
reason categories dominate; which segments retain better (coaching timetable
uploaded? mock logged? push subscribed?); which interventions correlate with
recovery — **the specification for what the product should automate next.**

### Salesperson

§3–4. Decisions, not tables. **Their own capacity and their own outcomes —
never another rep's book.**

### Student

Feels: *"someone noticed I stopped, and helped me restart."*
Never feels: watched, chased, sold to at a low moment.
**Structural protections:** contact only 09:00–21:00 IST · max 2 contacts per
7 days, never 2 in 24h · DND one tap and permanent · paying students never
pitched · the opening is always the student's own evidence, never a deadline.

## 18–19. How the system learns, and what to preserve now (Q18, Q19)

**FACT: today the system computes, it does not learn.** Crons recompute
momentum, churn risk, lanes; nothing feeds an outcome back into a rule.

**The two loops you named, and I would build in this order:**

```
LOOP 1 — STUDENT (fast, operational)
behaviour → detection → intervention → behaviour change

LOOP 2 — COMPANY (slow, compounding)
behaviour + intervention + outcome → aggregate → pattern →
product/playbook change → measure again
```

**Loop 2 is the moat. Loop 1 is just operations.**

**The intervention ledger — the one new table, and what it must capture from
call one:**

```
BEFORE   student · state · lane · reason_for_flag · days_since_log · streak ·
         prior_interventions · tenure · reachable_by_push   ← separates
                                                              channel from message
ACT      rep · channel · IST hour · weekday · intervention_type · the ask ·
         micro_commitment · reason_category · reason_verbatim · objection
AFTER    logged same day · D+1 · D+3 · D+7 · sustained_7d · streak_resumed ·
         session_booked · session_completed · dnd · silence
```

**Maturity ladder — rules first, and probably never ML:**
V1 read it (week 1) → V2 lane baselines (~200 interventions) → V3 patterns
(~500) → V4 experiments. At ~30 interventions/day, a year is ~7,000 rows across
dozens of state combinations. **The learning-analytics literature is blunt:
prediction alone does not improve outcomes; the humans' readiness to act
determines effectiveness independent of model accuracy, and interpretability is
what makes them act.** Transparent rules beat a model nobody can interrogate.

**What to preserve now so ML is possible later:** the ledger, complete, from
the first call. **The first hundred conversations are unrepeatable.**

## 20. What NOT to build yet (Q20)

ML/predictive scoring · a second dashboard · call recording · telephony ·
weighted capacity · teams/pods · student-facing sales surface ·
**automatic assignment (see below)**.

---

## Phase 2B-2 — PAUSED, not deleted

**I said delete. You said pause. You are right and I accept the correction** —
deleting on zero rep-behaviour data is a decision made too early, the same
error as setting capacity numbers before observing anyone.

**Status: PAUSED. Resume when at least two are observed (not predicted):**

1. A rep demonstrably cannot process the priority queue in their working time
2. Priority students breach the contact window because nobody owned them
3. Unclaimed priority leads sit >48h while capacity exists
4. Reps collide on the same student more than occasionally
5. Team exceeds ~4 people

**What already exists and stays** (Phase 2B-1, read-only, live): capacity
model, working-set classification, founder capacity panel with drill-down,
audited config route. **Nothing in it moves a student.**

---

## The revised roadmap

| Phase | Objective | Why this order |
|---|---|---|
| **P0 — Return loop** | Verify email delivery · fix push subscription health · **cut push from ~4/day to ~1** · move install prompt to *after first log* · verify D2/D3 triggers fire · instrument the full funnel | Affects **646 unreachable students**. Everything else affects dozens |
| **P0b — Session delivery** | Make one session actually happen and be recorded (`started_at`/`ended_at` or attendance) | **The paid product has never been delivered.** Conversion work is meaningless until this works once |
| **P1 — Intervention ledger** | One append-only table + structured `reason_category` + weekly read | Loop 2. The moat |
| **P2 — Lane baselines** | Uncontacted comparison per lane | Makes credit honest; kills the easy-student game |
| **P3 — Attribution** | Reached vs unreached weekly table by lane | The business case for the hires |
| **P4 — Experiments** | A/B openings, timing, channel | Only after P1–P3 are stable |
| **2B-2** | *paused* | See triggers above |

**The sequencing principle: a human working inside a broken return loop
measures the plumbing, not their method. Fix P0 first or you will spend ₹120k
and learn nothing about the model you are trying to test.**

---

## Founder decisions required

1. **Approve P0 + P0b before the reps start.**
2. **Verify `RESEND_API_KEY` in production** — **UNKNOWN**; `email.ts` silently
   console-logs when it is absent, so a dead fallback is invisible.
3. **Approve the push frequency cut** (~4/day → ~1/day for reachable students).
4. **Approve `reason_category` as a structured field** — this is what turns
   remarks into product intelligence.
5. **Fixed salary only for 3 months.** No commission, especially not on
   bookings when zero sessions have ever completed.
6. **Contact frequency cap:** max 2 per 7 days, never 2 in 24h.
7. **Accept that "completed sessions" cannot be a rep metric until P0b ships.**

---

## IF I WERE THE FOUNDER

**The single most important thing I found today is not the push data. It is
that CareerRai has sold a ₹299 human session sixteen times and delivered it
zero times.** Nine expired, seven cancelled, none completed, and no field
anywhere would record it if one had. Before we design incentives around
conversion, the thing being converted *to* has to exist.

**What you are misunderstanding:** you are reading a distribution failure and a
delivery failure as a sales-effort problem. 646 students cannot be reached at
all; the 149 who can are pushed four times a day and have stopped looking; and
the paid product has never been delivered. **None of those three is fixed by
someone making more calls.**

**What you are overbuilding:** the sales machine. It is more capable than a
two-person team can use and **has never been used once.**

**What you are underbuilding:** the return loop, session delivery, and the
reason-category field. That last one is three days of work and is the
difference between a CRM and a company that learns.

**Where the ₹25k becomes wasteful:** eight weeks of calls into a broken
channel, measuring plumbing instead of method — and concluding, wrongly, that
human intervention does not work.

**Where it creates disproportionate value:** the **302 students who opened the
app last week and logged nothing.** They showed up. Ten honest conversations
with them will explain the activation gap better than any dashboard, and that
explanation is a product change worth more than the salary.

**The defensible advantage in 12 months:** not the CRM — anyone can buy one. A
dataset mapping *student state × intervention × timing → outcome* for Indian
CAT aspirants, plus a product that acts on it automatically. Competitors can
copy features in a month. They cannot copy 500 conversations they never had.

**And on the two hires: proceed** — your experimental argument is sound, n=1
confounds person with model, and ₹120k to answer that before a funding
conversation is cheap. **But fix P0 and P0b first, run it as a real experiment
(same pool split randomly, same baseline script in week one, both measured
against the unreached control), and give the reps the `reason_category` field
from call one.** Otherwise you will spend ₹120k and get two anecdotes.

---

**No code. No migrations. No configuration. Awaiting the seven decisions above.**
