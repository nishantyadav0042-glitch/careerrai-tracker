# The Founder Solution — Student Success, Sales & the ₹40k Question

**24 Aug 2026 · Decision document. Researched. No code, nothing configured.**
Labels: **FACT** (our data or cited source), **INFERENCE**, **RECOMMENDATION**,
**UNKNOWN**. Sources at the end.

---

## 1. The number that decides everything

Queried from production today:

```
792   real students
598   have NEVER logged a single study day — ever          (75%)
387   opened the app in the last 7 days
 91   logged in the last 7 days
302   OPENED THE APP LAST WEEK AND DID NOT LOG
342   new signups in the last 7 days
```

Read the fifth line again. **302 students opened CareerRai last week and logged
nothing.** They did not forget we exist. They did not lose the app. They came,
and left without recording anything.

**A phone call cannot fix that.** You cannot ring someone to remind them of an
app they already opened.

And the inflow makes it arithmetic, not opinion:

- One person calling well makes ~25 meaningful contacts/day, ~125/week.
- We add **342 students/week.**
- **A full-time human covers 37% of one week's inflow.** The backlog of 598
  never-logged students grows every single week they work.

Two reps do not fix this. Ten do not fix this. **This is not a headcount
problem, and hiring against it is the most expensive way to find that out.**

---

## 2. What the research says about your exact question

You asked how habit / daily-log / edtech apps track their salespeople and how
salespeople contribute to those wins. The honest answer surprised me:

### The winners in this category do not have salespeople

**FACT — Cal AI:** ~$30–50M ARR within 18 months, **bootstrapped**, team of
**6 people growing to ~17**, later acquired by MyFitnessPal. Their growth
engine was **250 influencers on fixed monthly retainers** posting TikTok/
Instagram integrations, then broader creators, then in-house paid ads and an
affiliate program — mid-six-figures a month on distribution. **Not one rupee on
outbound calling. There is no sales team to track.**

**FACT — Duolingo:** the growth lever is the streak, iterated experimentally
for years. No outbound human contact to activate users.

**FACT — the PLG pattern:** consumer subscription products grow through product
usage rather than early sales engagement; where sales exists at all it works
**only high-intent, product-qualified users**, and mostly to move upmarket to
business buyers.

**INFERENCE, and it is the core of this document:** at consumer price points
(₹299–₹2,999) the unit economics cannot support a human touching each user.
The winners spend on **distribution and product**; the humans they employ build
the product, not the pipeline.

### The category that *did* build this role is the cautionary tale

**FACT — Indian edtech counsellor economics:** PhysicsWallah tele-counsellor
roles sit at **₹2–3 LPA (≈₹17,000–25,000/month)**; Unacademy sales roles start
around ₹3 LPA, academic counsellors ~₹4.3 LPA. **So your ₹25,000 is at the top
of the market band — the rate is fair. The question is whether the role is
right.**

**FACT — BYJU'S** moved to inside sales explicitly hoping it would "solve the
unit economics puzzle." It did not. Reporting describes unrealistic targets on
first-time job seekers, pressure to push products at parents who could not
afford them, and fear-based selling ("your child will fail without this").
Valuation fell from ~$22B to under $250M; Trustpilot ~1.3/5. One investor's
summary of the sector: *"the sales team is the one that gets laid off."*

**The lesson is not "don't sell." It is that the incentive produced the
behaviour.** Nobody set out to mis-sell; they had a number to hit.

---

## 3. The solution — three moves

### Move 1 — Hire ONE person, and do not call them a salesperson

**Title: Student Success.** The title decides what they optimise when nobody is
watching.

**Their job for 8 weeks is diagnostic, not commercial:**

> Call 100–150 students drawn deliberately from the two failure groups —
> *opened but never logged*, and *logged once then stopped* — and return with
> the answer to one question: **what stops a student who has already opened
> CareerRai from recording a study day?**

Every call logged in the CRM we built. Every call ends in one of three things,
all of them data: a real answer, a micro-commitment, or a refusal.

**Compensation: ₹25,000 fixed. No commission. No variable pay for 8 weeks.**
Commission on bookings is precisely the BYJU'S mechanism, and here it would
also corrupt the only thing we are buying — honest answers.

**Do not hire the part-timer yet.** Hire them when the first person's method is
worth copying. Today there is no method to copy, and ₹12,500/month duplicates
an unknown.

### Move 2 — Fix activation in the product, because only that scales

The human reaches 125 students a week. **The product reaches 792, plus all 342
who arrive next week, at zero marginal cost.**

The moment the first pattern appears — even informally, in week 2 — it becomes
product work, using systems already live: the onboarding path between first
open and first log; the notification OS (budgeted, guard-tested); Home's
first-run state for a never-logged student; Daily Tips.

**This is the arm that moves the 598. The human arm exists to tell it what to
build.**

*(One activation blocker was fixed today: the timetable upload was hidden from
70% of students by a coaching-enrolled check, now live via PR #99. Effect
unmeasured — a thing to watch, not to assume.)*

### Move 3 — Start the learning ledger on day one

One append-only record per intervention: student state before, what was said,
what was asked, and what the student did for the next 7 days.

Week 2 it is a paragraph you read. Week 8 it is a playbook. Month 6 it is
something competitors cannot copy, because they do not have 500 logged
conversations tied to real behaviour.

**Without it, ₹50,000 buys anecdotes. With it, it buys a repeatable method.**

---

## 4. The four perspectives

### The student

**Feels:** *"Someone noticed I stopped, and helped me start again."*
**Must never feel:** watched, chased, sold to at a low moment, or that their
study data is a lever being used on them.

**Structural protections — not culture, rules:** contact only 09:00–21:00 IST;
**never more than twice in 7 days, never twice in 24 hours**; DND is one tap and
permanent; a paying student is never pitched; the opening line is always the
student's own evidence, never a deadline.

### The salesperson

Opens one screen; four questions already answered: **who needs me · why (with
the evidence) · what happened last time · what I promised today.**

The daily ask — corrected by Duolingo's actual result (§5) — is not "please log
something" but **"one topic tonight, 25 minutes — I'll check tomorrow."**

Accountable for: promises kept, notes the next caller can use, honest
dispositions, students who come back. **Never for call volume.**

### The product manager

Needs to learn one thing: **which intervention, on which student state, at
which time, produces a next-day log.** Every intervention must therefore be
recorded with its before-state and its 7-day after-state. Everything the human
proves gets built into the product and stops costing ₹25,000/month.

### The founder

Opens one screen weekly:

```
LANE            REACHED  RETURNED(3d)   UNREACHED  RETURNED(3d)
never logged      24        9 (38%)        132        11 (8%)
at risk            6        4 (67%)         14         2 (14%)
```

**That table is the entire business case for the hire**, and it is honest by
construction — both columns come from product truth the rep cannot write to.
The ~600 students we have no capacity to reach are a genuine control group.

---

## 5. Metrics — your two, corrected

You proposed: (1) daily-log activation, (2) session conversion. **Both are
right, with two corrections that matter.**

**Correction 1 — activation must be baseline-adjusted.** Not "students who
logged after my call" but *"above the rate for comparable students in the same
lane who were not called."* Without this, a rep who only calls healthy students
looks brilliant while adding nothing.

**Correction 2 — count *completed* sessions, not booked.** One word, and it is
the whole BYJU'S guardrail: nobody gets credit for talking an unsuitable
student into a booking that never happens.

**A finding that corrects us both:** we had both absorbed "make the daily action
as small as possible." **Duolingo's experiment says otherwise.** Moving the
streak to *one lesson* grew DAU significantly; testing *one exercise* did **not**
— it captured only the least-engaged users, and people were not motivated to
continue after a single question. **So the ask must be a genuinely meaningful
unit of study, not a token tap.**

**Never a target (all trivially gameable):** calls made, messages sent, students
touched, hours online, HOT/WARM/COLD counts. Keep them visible as diagnostics —
4 activations from 22 calls and 4 from 90 calls tell you different things about
method — but never as the score.

**Paired metrics, the anti-gaming mechanism:** activation ↔ lane baseline ·
sessions booked ↔ completed + refunds · contacts ↔ connect rate + DND rate ·
follow-ups scheduled ↔ follow-ups honoured.

---

## 6. Remote work — no hours, and the evidence for that

**FACT:** MIT Sloan research cited in the remote-sales literature — **>92% of
monitored employees trust their employer less; 81% of managers trust their
workers less.** Tracking logins, call counts and screen time without context
erodes trust and performance follows. Field reps can tell when tracking exists
to catch mistakes, and respond by doing the minimum needed to avoid attention.

**So: no working hours as a management concept.** Clocks exist for exactly two
reasons, neither of them monitoring:

1. **Student protection** — the 09:00–21:00 IST contact window.
2. **Callback realism** — the person declares windows they normally call in, so
   promised callbacks land when they are actually available. Self-declared,
   changeable, never enforced.

**SLA belongs to the student's situation, not the rep's shift:** a broken streak
is warm ~72h → contact inside 48h; a never-logged signup has a ~7-day window →
inside 72h; **a promised callback happens at the promised time** (absolute).
Missing an SLA then describes a student who needed help and didn't get it —
worth measuring — rather than accusing someone of not being at their desk.

**The management practice**, straight from the research: separate **normal
visibility** (logged calls, notes, pipeline movement) from **exception alerts**
(missed follow-ups, priority students untouched). Review monthly **as a
conversation, not an audit.**

---

## 7. The economics, honestly

**The old framing:** ₹40,000/month needs **134 completed ₹299 sessions every
month** to break even — 29% of the entire eligible base, monthly. It fails on
arithmetic before it starts.

**This framing:**

```
Cost      ₹25,000 × 2 months = ₹50,000
Buys      why 75% never activate  +  ~100 deeply worked students
          +  a logged intervention ledger
```

**The return is not sessions. It is a product change that lifts activation for
every student, forever.** Today 91 of 792 logged in a week (11.5%). Moving that
to 15% is roughly **28 more active students every week, permanently, at zero
marginal cost** — compounding with every one of the 342 arriving next week.

**One ₹299 session is worth ₹299. One activation insight is worth every student
who ever signs up.**

**LTV stays UNKNOWN and I will not invent it.** Five paying customers is not a
cohort. Anyone quoting a lifetime value here — me included — would be guessing.

---

## 8. The 8-week plan

| Week | Human arm | Product arm |
|---|---|---|
| 0 | Hire, create account, 30-min walkthrough | Watch whether today's timetable fix moves anything |
| 1–2 | 40–60 calls into *opened-but-never-logged*. **No pitching at all** | Listen first, build nothing |
| 3 | **Read the ledger together.** What are people actually saying? | Pick the most-repeated blocker |
| 4–5 | Test two different asks against the same student state | Ship the fix for that blocker |
| 6 | Second read. Reached vs unreached table by lane | Measure the shipped fix |
| 7–8 | Light conversion talk **only** with students who have activated | Decide the next product change |

**Week 8 decision.** Continue and hire the second person if: ≥15 students/month
activated above baseline, **and** ≥1 product change shipped because of what the
calls revealed, **and** the ledger shows a repeatable pattern rather than 100
unique stories. Change the role if students only activate while being personally
chased — that insight is not transferable, and the job is coaching, a different
(and possibly paid) product. **Stop if contacted students return at the same
rate as the unreached control** — then the call does not work, and no CRM will
make it work. **Learning that for ₹50,000 in 8 weeks is a good outcome.**

---

## 9. What we explicitly do NOT do

| Do not | Because |
|---|---|
| Hire two now | No playbook to copy; the second salary duplicates an unknown |
| Build automatic lead assignment (2B-2) | Automates a decision one person makes from a ranked list |
| Commission on bookings | The BYJU'S mechanism; corrupts the answers we are buying |
| Set working hours | WFH; monitoring erodes trust, and performance follows |
| Target calls/day | Goodhart — it will be hit and it will mean nothing |
| ML, predictive scoring, a second dashboard, call recording, telephony | None is the constraint |
| Chase ₹299 with human effort | 134 sessions/month is unreachable; monetisation stays product-led |

---

## 10. Decisions I need from you

1. **One hire, not two.** Full-time, ₹25,000 fixed, no commission, 8-week
   defined experiment. *(Your ₹25k is market-correct — PhysicsWallah pays
   ₹2–3 LPA for the equivalent. The rate is right; the role needs changing.)*
2. **Title is Student Success, not Sales.**
3. **Stop Phase 2B-2 (automatic assignment) permanently.**
4. **First two weeks are diagnostic only** — no pitching, no ₹299, no targets.
5. **Name the candidate + email** when you have one, and I configure the account.

---

## 11. The one-paragraph version

You have 792 students and 598 have never logged a single study day. Last week
302 of them opened the app and still logged nothing, while 342 more signed up.
No number of salespeople can out-dial that — one person covers a third of one
week's inflow, and the apps winning this category (Cal AI at $40M ARR with 17
people, Duolingo) employ **no salespeople at all**; the Indian edtechs that built
this role are the cautionary tales. So do not hire a sales team to fix
activation. **Hire one person to find out *why* activation fails, log every
conversation, and turn the answer into product changes that work on all 792 and
everyone who arrives after.** Keep monetisation product-led, keep the ₹299 door
where it is, pay no commission until we know what good looks like. Two months,
₹50,000, and a clear decision at the end.

---

## Sources

- [Cal AI: $0 to $50M+ ARR in 18 months — case study (Superframeworks)](https://superframeworks.com/case-study/cal-ai)
- [The Cal AI Growth Playbook (Growthcurve)](https://growthcurve.co/three-engines-and-an-exit-the-cal-ai-growth-playbook)
- [Cal AI Revenue 2026: $40M ARR, bootstrapped (GetLatka)](https://getlatka.com/companies/calai.app)
- [Behind the product: Duolingo streaks — Jackson Shuttleworth (Lenny's Podcast)](https://www.getrecall.ai/summary/lennys-podcast/behind-the-product-duolingo-streaks-or-jackson-shuttleworth-group-pm-retention-team)
- [From product-led growth to product-led sales (McKinsey)](https://www.mckinsey.com/industries/technology-media-and-telecommunications/our-insights/from-product-led-growth-to-product-led-sales-beyond-the-plg-hype)
- [From Disruptor To Just Another Edtech Unicorn: PhysicsWallah (Inc42)](https://inc42.com/features/physicswallah-was-supposedly-different-now-is-it-just-another-byjus-or-unacademy/)
- [PhysicsWallah tele-counsellor roles and pay bands](https://nisarfoundation.org/blog/jobs-at-pw-physicswallah/)
- [Unacademy salaries in India (Indeed)](https://in.indeed.com/cmp/Unacademy/salaries)
- [Unveiling the Fall of BYJU'S (IRJEMS)](https://irjems.org/Volume-4-Issue-5/IRJEMS-V4I5P126.pdf)
- [Byju's aggressive marketing strategy: rise and fall](https://florafountain.com/byjus-aggressive-marketing-strategy-rise-fall-lessons/)
- [How to Manage a Remote Sales Team Effectively (Claap)](https://www.claap.io/blog/manage-remote-sales-team)
- [How to Manage Remote Field Sales Reps Without Losing Visibility (Outfield)](https://explore.outfieldapp.com/manage-remote-field-sales-reps)
- [Goodhart's Law: Why Metrics Get Gamed (KPI Tree)](https://kpitree.co/guides/frameworks/goodharts-law)
- [Founders: Your First Sales Hire Is Probably a Mistake (Techstars)](https://www.techstars.com/blog/founder-advice/founders-your-first-sales-hire-is-probably-a-mistake)
- [The Effectiveness of Learning Analytics-Based Interventions: meta-analysis (SAGE 2025)](https://journals.sagepub.com/doi/10.1177/21582440251336707)

**No code written. No configuration applied. Awaiting the five decisions in §10.**
