# CareerRai — Student Success + Sales Operating System

**Co-founder research & strategy gate · 24 Aug 2026 · NO CODE, NO CONFIGURATION.**
Labels: **FACT** (verified in our data or cited), **INFERENCE**, **RECOMMENDATION**,
**UNKNOWN**. Sources listed at the end.

---

## 1. Executive verdict

**I would not hire both people yet. I would hire one, and I would keep you in
the conversion conversations personally for another month.**

The arithmetic is not close, and it is the first thing a co-founder should say:

- **FACT:** CareerRai has **5 paying customers, ever.** Every practitioner
  source on first sales hires says the same thing — hire after the founder has
  personally closed roughly **10–20** deals and can teach the pattern, because
  before that there is no playbook to hand over and the hire becomes a filter
  between you and the customer insight you still need. We are below that line
  by a factor of three.
- **FACT (arithmetic):** ₹25k + ₹12.5k + tools ≈ **₹40,000/month**. At ₹299 a
  session that is **134 completed sessions every month** to break even on
  salary alone — from a pool of 466 eligible students. That is a 29% monthly
  conversion of your entire eligible base. It will not happen.

**So the hire cannot be justified as a revenue function. It can only be
justified as a learning function** — buying the answer to "what does a human
have to say to make a CAT aspirant open the app tomorrow?", and then building
that answer into the product where it costs nothing to repeat.

That reframing changes almost everything downstream, and I think it is the
right bet — but it should be made deliberately, sized, and given a kill
criterion, not drifted into.

**Second verdict: do not build automatic lead assignment (Phase 2B-2).** At two
people it automates a problem that does not exist. I would rather delete it
than build it.

**Third verdict, and the uncomfortable one: your system does not currently
learn.** It computes. Nothing anywhere closes the loop from outcome back to
rule. §9 is how that actually gets built, and it is the highest-value thing in
this document.

---

## 2. What we are actually building

Not a CRM. Not a call centre. A **closed behavioural loop**:

```
student behaviour  →  system detects a state change  →  a human intervenes
        ↑                                                      ↓
   product improves  ←  the system learns what worked  ←  student responds
```

The salesperson is not a revenue channel. **They are the instrument that
teaches the product what works on a real human.** Whatever they discover that
reliably restarts a student is a feature waiting to be written.

If that loop never closes — if a rep calls and nothing is recorded about what
happened afterwards — we have paid ₹40k/month for anecdotes.

---

## 3. Research findings, and where they contradict us

### 3.1 Duolingo — this one corrects a shared assumption

The common summary is "make the daily action as small as possible." **The
actual experimental result is the opposite at the margin.** Duolingo moved the
streak from hitting an XP target to **completing one lesson** and saw
significant DAU growth. They then tested lowering it further to **one exercise**
within a lesson — and **DAU did not increase**; the change captured only the
least engaged users, and people were not motivated to continue after answering
a single question.

**Implication for CareerRai, and it changes the rep's script:** the ask must be
a *real* unit of study, not a token tap. "Just log something" produces a log
without a student. The right ask is the smallest **genuinely meaningful** block
— one topic, 25–30 minutes — because that is what produces the feeling of
having studied, which is what brings them back tomorrow.

Duolingo's other durable lesson: **streak-adjacent mechanics are experiments,
not doctrine.** They iterated the streak for years. We should treat our lanes
the same way.

### 3.2 Learning analytics / early-warning systems — the sobering one

The literature is consistent and directly relevant, because an EWS is exactly
what our lane system is:

- Prediction **alone does not improve outcomes**. Much research chases better
  models to predict at-risk students, which is insufficient without timely
  intervention.
- **The readiness of the humans to act on the signal determines effectiveness,
  independent of model accuracy.** A perfect risk model with an unmotivated or
  untrained responder produces nothing.
- Most implementations **privilege easily available behavioural traces (login
  frequency) over theoretically motivated indicators** of real understanding.
- Simple, timely warnings *do* move behaviour — the effect is real but modest.

**Implication:** our advantage is not going to come from a cleverer risk score.
It comes from the *quality and timing of the human response*, and from
measuring which response works. This is why I would spend our effort on the
intervention→outcome loop, not on a better lane classifier.

**A warning it aims squarely at us:** "logged today" is a login-frequency-class
trace. It is the right *operational* trigger, but we should not confuse it with
learning. A student can log daily and prepare badly.

### 3.3 BYJU'S — the failure mode we are one incentive away from

**FACT:** valuation fell from ~$22B to under $250M; Trustpilot ~1.3/5 by 2023.
The sales mechanics that did it, from the reporting: unrealistic targets and
immense pressure on reps; pushing products at parents who could not afford
them; telling parents **their children would fail without the product** —
fear-based urgency rather than value; loans sold without clear disclosure;
refund promises not honoured.

**The lesson is not "don't sell."** It is that **the incentive structure
produced the behaviour.** Nobody woke up wanting to defraud a parent; they had
a number to hit. Every guardrail in §15 exists because of this.

Our existing rules already encode part of it — MISSION.md's "not a
fear-monetisation machine", the script-honesty guard that imports the real
price, the refusal to promise refunds sessions don't carry. **Those must
survive contact with a person whose salary depends on conversions.**

### 3.4 Goodhart, and the one mechanism worth stealing

"When a measure becomes a target, it ceases to be a good measure." The
practical antidote from the KPI literature is **paired metrics**: pair every
target with the metric that its abuse would damage, so gaming one exposes the
other. Leads generated ↔ lead-to-opportunity rate. Tickets closed ↔
satisfaction per ticket.

**This is the single most useful mechanism in all of this research, and §11 is
built on it.**

### 3.5 Remote work — the evidence says surveillance backfires

MIT Sloan research cited in the remote-sales literature: **>92% of monitored
employees trust their employer less, and 81% of managers trust their workers
less.** Tracking logins, call counts and screen time without context erodes
trust and performance drops. The recommended alternative is outcome-based
goals, shared real-time dashboards, and a **monthly business review run as a
conversation, not an audit**.

**You were right and I was wrong.** My 10:00–19:00 proposal was reasoning by
office convention. §12 replaces it.

---

## 4. Why my previous numbers were badly reasoned (and what replaces them)

I proposed FT 35 active units / 12 new per day / 10:00–19:00 / 24h SLA. Here is
the honest audit of that proposal:

| What I said | Where it came from | Verdict |
|---|---|---|
| 35 active units | Halved your 50 "to be safe" | **Not derived from anything.** A guess wearing a decimal |
| 12 new/day | Roughly a third of 35 | **Arbitrary** |
| 10:00–19:00 | Office convention | **Wrong for WFH** — and contradicted by the trust evidence |
| 24h SLA | Sounded achievable | Directionally fine, wrong unit (§12) |

**What should actually determine capacity:** the number of students a person
can hold *in their head* as live relationships. The only evidence-based anchor
I can offer is that this is a **human working-memory and follow-through
limit**, not a throughput limit — and it is precisely what the pilot must
measure (peak concurrent open work per rep). **Until it is measured, any number
is a guess, and I should label it as one rather than dress it as analysis.**

**RECOMMENDATION:** start the pilot with **no hard ceiling at all** — let the
rep take what they can carry and *observe the number they naturally settle at*.
That number, not my arithmetic, becomes `max_capacity_units`.

---

## 5. The student's experience (the constraint everything else obeys)

**What the student should feel:** *"Someone noticed I stopped, and helped me
start again."*

**What they must never feel:** watched, chased, sold to at a vulnerable moment,
or that their study data is a lever being used on them. MISSION.md's rule is
the line — **evidence → relevance → option**, never fear → urgency → payment.

**Concrete student protections I would make structural, not cultural:**

1. **No contact outside 09:00–21:00 IST, ever.** This is a student protection,
   not a rep schedule. It is the *only* legitimate reason CareerRai needs a
   clock.
2. **A hard contact frequency cap** — no student contacted more than twice in
   7 days regardless of lane, and never twice in 24 hours. The notification OS
   already enforces exactly this discipline for push; sales should not be the
   one channel without a budget.
3. **DND is instant, permanent, and one tap** (built).
4. **A paying student is never pitched again** (built).
5. **The rep opens with the student's own evidence**, never with a deadline.

---

## 6. The salesperson's operating model

Morning, one screen, four questions answered before they think:

```
WHO NEEDS ME       ranked, with the reason and the evidence on the card
WHAT HAPPENED      last interaction, what the student did afterwards
WHAT TO SAY        the opening built from their real prep, not a script
WHAT I OWE         promises I made that are due today
```

**The daily ask, corrected by the Duolingo evidence (§3.1):** not "please log
something" but **"can you do one topic tonight — 25 minutes — and I'll check in
tomorrow?"** A micro-commitment to a *real* unit, plus a named follow-up.

**What the rep is accountable for:** promises kept, notes that make the next
call possible, honest dispositions, and students who come back. Not call
volume. Never call volume.

---

## 7. Does the system learn today? No. Here is the honest answer.

**FACT — what exists:** daily crons recompute derived state (momentum bands,
`student_dna.churn_risk`, sales-ready flags); lanes classify students live;
`student_events` accumulates ~90 event types; the Evidence Layer labels mock
claims fact/inference/unknown.

**FACT — what does not exist:** **no feedback path from outcome back to rule.**
Nothing anywhere records "we did X to a student in state S, and Y happened",
and no threshold, lane, or message has ever been changed because of measured
outcome. The system **computes**; it does not **learn**.

Saying otherwise would be the precise defect this codebase has spent a month
eliminating — a confident claim with no evidence behind it.

**This is also the biggest opportunity in the document**, because the loop is
cheap to start: one append-only table and a weekly reading of it (§9).

---

## 8. KPI architecture

### North stars (2, and I largely agree with yours — with two corrections)

**NS1 — Incremental activated study-days.** Not "students who logged after my
call". *Students who logged after my call, above the rate for comparable
students in the same lane who were not called.* Without the baseline, a rep who
only calls healthy students looks like a genius.

**NS2 — Completed 1:1 sessions.** Not *booked*. **Completed.** This single word
is the BYJU'S guardrail: a rep cannot be rewarded for talking an unsuitable
student into a booking that never happens or gets refunded.

### The layers beneath

| Layer | Metrics |
|---|---|
| **Outcome** | activated (first-ever log), reactivated (dormant→logging), streak resumed, completed sessions |
| **Leading** | connect rate, micro-commitment obtained, follow-up honoured within 24h of promise |
| **Quality** | note usable by the next caller, disposition matches what happened, student not re-contacted inside the cap |
| **Guardrail** | DND rate, contact-frequency violations, refund/no-show rate, complaints, paying-student-pitched (must be 0) |
| **Diagnostic (never targets)** | calls made, messages sent, students touched, hours "online", HOT labels applied |

### Metrics that must never become targets

**Calls/day, messages sent, students touched, hours online, HOT/WARM/COLD
counts.** Each is trivially inflatable without helping a single student, and
Goodhart guarantees they will be inflated the moment someone's salary depends
on them. They stay visible as diagnostics — a rep with 4 activations and 90
calls and one with 4 activations and 22 calls are telling you different things
about method — but they are never the score.

### The paired-metric table (the anti-gaming mechanism from §3.4)

| If we measure… | We must show beside it… | Because the abuse is… |
|---|---|---|
| Activation | **lane-baseline-adjusted** activation | calling only easy students |
| Sessions booked | sessions **completed** + refunds | pushing unsuitable students |
| Contacts made | connect rate + DND rate | dialling for the number |
| Follow-ups scheduled | follow-ups **honoured** | scheduling promises never kept |
| Students touched | distinct students, capped frequency | re-touching the same easy few |

---

## 9. The learning engine (the part I care most about)

### The one new thing worth building: an intervention ledger

**Every intervention writes one append-only row**, capturing state *before* and
outcome *after*:

```
BEFORE            student state, lane, days since last log, streak,
                  momentum band, prior interventions, tenure
THE ACTION        rep, channel, IST hour, weekday, intervention TYPE
                  (activation / restart / diagnostic / conversion),
                  the ask made, micro-commitment obtained (y/n),
                  objection raised
AFTER             logged that night · D+1 · D+3 · D+7 · streak resumed ·
                  session booked · session completed · DND · silence
```

**Version 1 — rules and reading (weeks 1–8).** No modelling. A weekly one-page
read: *"Of 23 restart conversations, 11 produced a next-day log. Of 14 generic
reminders, 2 did."* That is already actionable and needs no statistics.

**Version 2 — baselines (from ~200 interventions).** Per-lane expected
next-day-log rate, computed from the **unreached students in the same lane** —
which we have in abundance and for free (§10). Now every intervention has an
expected value, and rep credit becomes *actual − expected*.

**Version 3 — patterns (from ~500).** "Evening calls with a micro-commitment
outperform morning generic reminders for never-logged students." Still rules,
now evidence-backed.

**Version 4 — experiments (§13).** Only once V1–V3 are stable.

**When is there enough data for ML? Not for a long time — and probably never
for this.** At ~30 interventions/day, a year is ~7,000 rows across dozens of
state combinations. **INFERENCE:** transparent rules fitted to observed rates
will outperform a model nobody can interrogate, and the EWS literature (§3.2)
says interpretability is what makes humans act. I would not put ML on this
roadmap at all.

### How we avoid fooling ourselves

Pre-register what we expect before reading a week's numbers; never report a
rate below 30 observations; always show the unreached comparison beside the
reached one; and treat any pattern that appears in one week and vanishes the
next as noise, which most will be.

---

## 10. Attribution — and the gift hiding in our constraint

**FACT:** 466 eligible students, two reps who can hold perhaps 50–70 live
relationships between them. **396 students will not be contacted.**

I called this a constraint. It is also **the cleanest control group a
two-person company will ever get for free** — same eligibility criteria, same
product, same period, no contact.

**The honest ladder, in the order we should climb it:**

1. **Associated outcome** (week 1): "of students contacted, X% logged next day."
   Descriptive only. Publishable internally, never as impact.
2. **Lane-matched comparison** (week 2+): reached never-logged vs unreached
   never-logged. Controls for the dominant selection driver. **This is where we
   should live for months.**
3. **Propensity-style matching** (later): match on tenure, prior logs, momentum.
4. **Holdout** (only if volume ever supports it): randomly withhold contact from
   a slice of a lane. **Ethically fine here** — we cannot reach them anyway, so
   randomising *which* ones we reach withholds nothing that was on offer.

**What we must never write:** "the rep caused N returns." Assignment is not
random and reps pick who to call. Everything is **ASSOCIATED WITH CONTACT**.

---

## 11. Remote work, availability and SLA — replacing my bad answer

**Delete working hours as a management concept.** They exist for exactly two
purposes, neither of which is monitoring:

1. **Student protection** — the 09:00–21:00 IST contact window (§5).
2. **Callback realism** — a rep declares the windows they normally call in, so
   the system schedules promised callbacks into times they will actually be
   available. Self-declared, changeable, never enforced.

**SLA, redefined:** not "respond within 2 business hours" but **"a student who
enters a priority lane gets a first contact before the lane's window closes."**
The window is a property of the *student's* situation, not the rep's shift:

- broken streak → the habit is warm for ~72h; contact inside 48h
- new, never logged → the activation window is ~7 days; contact inside 72h
- going cold → contact inside 72h
- promised callback → **at the promised time** (this one is absolute)

Missing an SLA is then a fact about a student who needed help and didn't get it
— which is worth measuring — rather than an accusation about someone's calendar.

**Inactivity detection without surveillance:** if no dispositions are logged for
2 consecutive declared-available days, that is a conversation, not an alert.
**Burnout detection:** rising contacts with falling connect rate and falling
activation is the signature of someone grinding a number.

**Full-time vs part-time fairness:** never compare raw output. Compare
**per-intervention effectiveness** (activation above baseline per intervention)
and **reliability** (promises honoured %). A part-timer doing 40% of the volume
at the same effectiveness is doing their job perfectly.

---

## 12. Compensation and the economics you asked me to build

**Monthly cost:** FT ₹25,000 + PT ₹12,500 + telephony/tools ~₹2,500 ≈
**₹40,000**.

**Break-even at ₹299/session: 134 completed sessions/month.** Against 466
eligible students. **Not achievable.** State it plainly rather than modelling
around it.

**So the framing must be cost-per-outcome, and the honest version is:**

```
Cost per incrementally activated student
  = ₹40,000 ÷ (activated_with_contact − expected_without_contact)

If a rep incrementally activates 30/month → ₹1,333 per student
If 50/month                              → ₹800
If 15/month                              → ₹2,667
```

**Is ₹800–₹2,700 worth paying for one activated CAT aspirant?**
**UNKNOWN — and we cannot compute it.** LTV requires a cohort of paying
students; we have five, and no retention curve. Anyone quoting an LTV here is
inventing it.

**What I would do instead of pretending:** run the pilot, measure incremental
activation, and hold this decision open. If a rep incrementally activates fewer
than ~15 students a month, the economics do not work on any plausible LTV and
the role should change or end.

**On variable pay — my strongest recommendation in this section: do not put
commission on bookings.** That is the exact BYJU'S mechanism (§3.3). If you want
variable pay: a fixed salary plus a modest bonus on **completed sessions** and
on **activation above baseline**, capped, with any refund or complaint clawing
it back. Better still for the first three months: **no variable pay at all**
while we are still learning what good looks like.

---

## 13. Student health model — fewer states than you listed

**RECOMMENDATION — five states, not ten.** Each must be evidence-backed and
cause a different human action; a state that changes nothing about what we do
is decoration.

| State | Entry evidence | The action it implies |
|---|---|---|
| **NEW** | signed up, never logged | activation call |
| **ACTIVE** | logged within 3 days | leave alone (or conversion, if intent) |
| **AT RISK** | had rhythm, now silent 3+ days (going cold / broken streak) | restart conversation |
| **DORMANT** | no rhythm, silent 14+ days | low priority; measure before acting |
| **CLOSED** | converted / not interested / DND / paying | never contacted |

**Which of your proposed states I would drop:** ACTIVATING and BUILDING_HABIT
(same action as ACTIVE — leave them alone), CONVERSION_READY (an *attribute* of
an ACTIVE student, not a state), CONVERTED (a payment fact, not a health
state). **GOING_COLD and BROKEN_STREAK collapse into AT RISK** — the evidence
differs, the action does not.

---

## 14. Anti-gaming architecture

Thinking as a dishonest rep on ₹25k with a target:

| The move | The structural block |
|---|---|
| Only call students already about to log | **Baseline-adjusted credit** — an easy student is worth almost nothing |
| Log calls that never happened | Cannot be prevented (no telephony, permanently). **But** claimed contacts that never precede returns show up as effectiveness near zero. The product is the witness |
| Fake remarks | Notes are read weekly; a note that doesn't inform the next call is visible |
| Re-touch the same easy few | **Contact frequency cap** + distinct-students-reached |
| Push unsuitable students to book | Credit on **completed**, clawback on refund |
| Manipulate HOT/WARM/COLD | **Firewalled** — cannot affect routing, priority, or score (built) |
| Avoid difficult students | Lane coverage shown per rep: % of AT RISK students reached |
| Schedule follow-ups never honoured | **Honoured %** is a headline metric |
| Optimise the dashboard | The two north stars are *student behaviours*, which a rep cannot write to. **Product truth is write-revoked to sales at the database level** (built) |

**The deepest protection is architectural and already exists:** a rep can
record what they *claim*; only the student can produce a log. Every outcome
metric reads from tables sales cannot write.

---

## 15. Founder Control Tower — three screens, not thirty

**Daily (60 seconds):** how many students studied yesterday · new signups ·
how many entered AT RISK · how many were reached · promises overdue · anything
red in data quality. Every number clicks through to its students.

**Weekly (the one that matters):**

```
LANE            REACHED   RETURNED(3d)   UNREACHED   RETURNED(3d)
never logged       24         9 (38%)       132         11 (8%)
at risk             6         4 (67%)        14          2 (14%)
```

That table is the entire business case for the hire, and it is honest by
construction because both columns come from the same product truth.

**Weekly also: "what the system learned"** — one paragraph from the
intervention ledger, with its evidence and confidence, and the next thing to
try.

**Monthly:** cost per incrementally activated student, completed sessions,
contribution, and the explicit question *"is this role earning its salary?"*

**Design rules:** no metric without its evidence class; no rate below 30
observations (show UNAVAILABLE); no daily per-rep percentages; every number
drills to records. **If a screen cannot change a decision, delete it.**

---

## 16. Roadmap — what I would build, and what I would delete

| Phase | Build | Why |
|---|---|---|
| **NOW** | **Nothing.** Hire one person. Run manually on what exists. | The system is ahead of its usage. Every feature added now is built on assumption |
| **P1 — Intervention ledger** | One append-only table + the weekly read | The loop that makes CareerRai learn. **Highest value in this document** |
| **P2 — Lane baselines** | Unreached comparison per lane | Makes activation credit honest; kills the easy-student game |
| **P3 — Outcome attribution** | Reached vs unreached weekly table | The business case for the hire |
| **P4 — Experiments** | A/B on openings and timing | Only once P1–P3 are stable |
| **DELETE** | **Phase 2B-2 automatic assignment** | Solves a problem two people do not have |
| **DO NOT BUILD** | ML scoring, predictive models, a second dashboard, call recording, telephony, weighted capacity, teams/pods, a student-facing sales surface | None is the constraint. Each adds surface we would have to keep honest |

**What existing architecture survives, unchanged:** identity on `profiles.id`,
the single queue, lanes, Student 360, dispositions, follow-ups, DND, sticky
ownership, the working-set capacity model, provenance separation, the Control
Tower as a read model, every guard test.

**What changes:** hours → student-protection window + declared availability;
capacity ceiling → observed, not guessed; the health model → five states;
"conversion" → **completed** sessions.

---

## 17. Founder decisions required

1. **Hire one or two?** My recommendation: **one full-timer**, and you keep
   doing conversion conversations for another month.
2. **Accept that this is a learning investment, not a revenue one**, with an
   explicit kill criterion (I suggest: <15 incrementally activated
   students/month by week 8).
3. **Variable pay: none for the first three months.** If any, it is on
   completed sessions and baseline-adjusted activation only.
4. **Approve the five-state health model** replacing the ten-state list.
5. **Approve deleting Phase 2B-2** from the roadmap.
6. **Approve the intervention ledger as the next thing built** — after the
   manual pilot, not before.
7. **Contact frequency cap** — I propose max 2 per 7 days, never 2 in 24h.

---

## 18. The co-founder answer to your hardest question

*"If it were your money — would you hire both, build automatic assignment,
build this sales system at all?"*

**Would I hire both? No.** One full-timer. ₹25k buys a real experiment; ₹40k
buys the same experiment plus a second person managing an unproven playbook.
The part-timer should be hired **when the first person's method is worth
copying** — which is exactly the "10–20 closes then hire" logic, applied to
activation instead of revenue.

**Would I build automatic assignment? No.** Not now, possibly not at five reps.
It automates a decision two people make correctly by looking at a ranked list.

**Would I build this sales system at all? Yes — but not as a sales system.**
As the instrument that answers the one question CareerRai cannot answer from
product data alone: *what does a human have to say to make a student who has
stopped, start again?* Every answer we get is a feature. **That is the moat —
not the CRM.**

**And the thing I would be most careful about:** the day a rep's income depends
on conversions, BYJU'S becomes reachable from where we stand. Not because
anyone is bad, but because that is what the incentive does. Keep the student
outcome upstream of the commercial one, in the incentive structure and not just
in the values document.

---

## Sources

- [Behind the product: Duolingo streaks — Jackson Shuttleworth (Lenny's Podcast summary)](https://www.getrecall.ai/summary/lennys-podcast/behind-the-product-duolingo-streaks-or-jackson-shuttleworth-group-pm-retention-team)
- [How Duolingo Built and Iterated Its Core Growth Feature: Streaks](https://elsewhere.news/en/linearcapital/duolingobolt)
- [The Effectiveness of Learning Analytics-Based Interventions: A Meta-Analysis (SAGE, 2025)](https://journals.sagepub.com/doi/10.1177/21582440251336707)
- [Learning Analytics for Early Identification of At-Risk Students and Feedback Intervention (Journal of Learning Analytics)](https://learning-analytics.info/index.php/JLA/article/view/8735)
- [Learning Analytics and Early Warning Systems: Multi-Country Comparative Evaluation (Research Square)](https://www.researchsquare.com/article/rs-10559564/v1)
- [Unveiling the Fall of BYJU'S: Lessons from a Failed EdTech (IRJEMS)](https://irjems.org/Volume-4-Issue-5/IRJEMS-V4I5P126.pdf)
- [Byju's aggressive marketing strategy: rise and fall](https://florafountain.com/byjus-aggressive-marketing-strategy-rise-fall-lessons/)
- [Goodhart's Law: Why Metrics Get Gamed and How to Prevent It](https://kpitree.co/guides/frameworks/goodharts-law)
- [Goodhart's Law: The Hidden Reason KPI Programs Fail](https://www.kpifire.com/continuous-improvement/goodharts-law-the-hidden-reason-kpi-programs-fail/)
- [How to Manage a Remote Sales Team Effectively (Claap)](https://www.claap.io/blog/manage-remote-sales-team)
- [The Future of Sales Compensation: Remote-First & Outcome-Based](https://businessandmarketingblog.com/the-future-of-sales-compensation-in-a-remote-first-outcome-based-economy/)
- [Founders: Your First Sales Hire Is Probably a Mistake (Techstars)](https://www.techstars.com/blog/founder-advice/founders-your-first-sales-hire-is-probably-a-mistake)
- [When to Make Your First Sales Hire (First Round Review)](https://review.firstround.com/0-5m-first-sales-hire/)

**No code written. No configuration applied. Awaiting the seven decisions in §17.**
