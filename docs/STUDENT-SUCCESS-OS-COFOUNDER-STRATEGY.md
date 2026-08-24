# CareerRai — Student Success OS: Co-Founder Strategy

**24 Aug 2026 · Research, audit and architecture. NO CODE. NO MIGRATIONS. NO CONFIG.**
Labels: **FACT** (verified in production this session), **INFERENCE**,
**RECOMMENDATION**, **UNKNOWN**. Sources at the end.

---

## 1. Executive summary — the finding that changes the plan

I audited the return loop before designing anything. **The retention problem is
substantially a delivery problem, and it is measurable.**

**FACT — 7 days of notification data, production:**

| send_status | rows | distinct students | of which user has NO push subscription |
|---|---|---|---|
| **created (never sent)** | **11,614** | **585** | **11,579 (99.7%)** |
| provider_accepted | 5,066 | 175 | 284 |
| failed | 2,556 | 84 | 2,535 (99.2%) |
| null | 541 | 85 | 506 |

**Read that first row.** In one week the system created **11,614 notifications
for 585 students that were never sent** — because those students have no push
subscription. Another 2,556 failed for the same reason.

**FACT:** 149 of 795 students (18.7%) have a push subscription. **646 students
have no return channel at all.**

**FACT:** the 175 reachable students received 5,066 pushes in 7 days —
**~27 per student per week, roughly 4/day** — and clicked **57 times (1.1%)**.

**The one-sentence diagnosis: we cannot reach 81% of students, and we are
pushing the other 19% four times a day until they stop looking.**

That is not a motivation problem, not a content problem, and **not a problem a
salesperson can fix.** A rep calling 25 students a day cannot substitute for a
broken return channel reaching 646.

---

## 2. The benchmark that reframes it — we are not failing at push, we are at its ceiling

I expected to find our 18.7% opt-in was the failure. **The research says the
opposite.**

**FACT — web push opt-in benchmarks:** long-term steady state settles at ~5%
for e-commerce, 6–8% for media; ~6% average across sites; **10–15% is
considered achievable with well-placed prompts.**

**CareerRai is at 18.7% — above the "well-optimised" band.**

**INFERENCE, and it is the strategically important one:** we are already
winning at web push and it is *still* not enough, because **web push has a
structurally low ceiling**. Native apps get push and a home-screen icon
automatically on install; a PWA gets them only as separate opt-in steps —
a documented, architectural retention tax. **You cannot optimise your way out
of this. Prompt tuning will move 18.7% to maybe 22%. It will not reach 646
students.**

**Therefore the fix is not a better prompt. It is (a) reduce dependence on push
as the sole return trigger, and (b) fix the over-messaging of the few we can
reach.**

---

## 3. Retention vs the category — honest calibration

| | D1 | D7 | D30 |
|---|---|---|---|
| **CareerRai (measured)** | **5–10%** | **2–4%** | too young |
| Education apps (benchmark) | 14–15% | — | 2–3%; "above 3% is strong" |
| All apps (benchmark) | 25–26% | 11–13% | 5–7% |

**We are roughly half the education-category D1 benchmark.** And more
pointedly: **CareerRai loses by day 7 what a typical education app loses by day
30.**

**But context matters for a one-month-old product:** education is the hardest
retention category in mobile, D30 of 2–3% is *normal* there, and nobody
launches at benchmark. Duolingo sat at 12–15% D1 in its early years before
years of dedicated retention engineering took it past 50%. **Being below
benchmark at week four is expected. Not knowing why would be the failure —
and now we know why.**

---

## 4. Product failure vs sales failure — the distinction you asked for

Splitting the funnel by what is actually broken:

| Stage | Number | What kind of failure |
|---|---|---|
| Signup → first log within 3 days | **~22%, flat across cohorts** | **Product / onboarding.** Stable, so it is a fixable constant, not a scaling failure |
| Logged once → returned D1 | 5–10% | **Channel + product.** No trigger reaches most of them |
| Has any return channel at all | **18.7%** | **Architecture (PWA).** At the ceiling of what web push gives |
| Reachable → clicked | **1.1%** | **Message fatigue.** ~4 pushes/day |
| Opened app but did not log (last week) | **302 students** | **Product.** They were *inside the app* — no call needed |

**Only the last row is arguably addressable by a human — and even there, 302
students who opened and did not log is a product friction question first.**

**RECOMMENDATION — the founder-facing rule this implies:** the system should be
able to tell you *"do not call these students; the reason they are not
returning is that we never reached them."* That instruction is worth more than
any call list, and it is exactly the output your Part 6 asked for.

---

## 5. Is CareerRai learning today? No — and here is the precise answer

**FACT — what exists:** daily crons recompute derived state (momentum bands,
`student_dna.churn_risk`, sales-ready flags); `classifyLane` classifies
students live; `student_events` accumulates ~90 event types; the Evidence Layer
labels mock claims fact/inference/unknown; every rep write carries provenance.

**FACT — what does not exist:** **no feedback path from outcome back to rule.**
Nothing records "we did X to a student in state S, and Y happened next", and no
threshold, message, or lane has ever changed because of a measured outcome.

**The system computes. It does not learn.** It is:

```
student behaviour → calculation → dashboard
```

not

```
student behaviour → intervention → outcome → measurement → learning → rule change
```

**This is the single largest gap in the architecture, and closing it is cheap.**

---

## 6. The learning loop — the design

### The intervention ledger (the one thing genuinely worth building)

Append-only, one row per meaningful human intervention:

```
BEFORE     student_id · state (NEW/ACTIVE/AT_RISK/DORMANT) · lane · reason ·
           days_since_last_log · streak · prior_interventions · tenure ·
           reachable_by_push (y/n)   ← so we can separate channel from message
THE ACT    rep · channel · IST hour · weekday · intervention_type
           (activation / restart / diagnostic / conversion) · the ask made ·
           micro_commitment_obtained · objection_raised
AFTER      logged_same_day · D+1 · D+3 · D+7 · streak_resumed ·
           session_booked · session_completed · dnd · silence
```

### The maturity ladder — rules first, ML probably never

| Stage | When | What it produces |
|---|---|---|
| **V1 — read it** | week 1 | "Of 23 restart calls, 11 produced a next-day log. Of 14 generic reminders, 2 did." Needs no statistics |
| **V2 — baselines** | ~200 interventions | Per-lane expected rate from *uncontacted students in the same lane*. Credit = actual − expected |
| **V3 — patterns** | ~500 | "Evening + micro-commitment beats morning + generic, for never-logged students" |
| **V4 — experiments** | after V3 is stable | A/B on opening, timing, channel |

**When is there enough data for ML? Realistically never, for this.** At ~30
interventions/day, a year is ~7,000 rows across dozens of state combinations.
The learning-analytics literature is blunt about this: prediction alone does
not improve outcomes, **the humans' readiness to act determines effectiveness
independent of model accuracy**, and interpretability is what makes people act.
**Transparent rules fitted to observed rates will beat a model nobody can
interrogate. I would not put ML on the roadmap.**

### The founder-facing output

A weekly paragraph: *"What did CareerRai learn this week?"* — with its evidence
and confidence, and the next thing to try. That is the moat: in 12 months,
500 logged conversations tied to real behaviour is something no competitor can
copy, because they did not have the conversations.

---

## 7. The metric tree

**North stars — two, and your instinct was right with two corrections:**

**NS1 — Incremental activated study-days.** *Not* "students who logged after my
call" but **above the rate for comparable students in the same lane who were
not called.** Without the baseline, a rep who calls healthy students looks
brilliant while adding nothing.

**NS2 — Completed 1:1 sessions.** Not *booked*. **Completed.** One word, and it
is the entire BYJU'S guardrail.

| Level | Metrics |
|---|---|
| **L1 Business** | completed sessions · revenue · subscription conversion |
| **L2 Student** | first meaningful log · D1/D3/D7 return · reactivation · sustained logging |
| **L3 Intervention** | eligible · reached · intervened · reactivated-above-baseline · converted |
| **L4 Quality** | note usable by next caller · disposition matches reality · frequency cap respected |
| **L5 Guardrail** | DND rate · complaints · refunds/no-shows · paying-student-pitched (must be 0) |
| **L6 Activity (diagnostic only)** | calls · messages · students touched · hours online |

**Your addition, which I agree with and want to record:** daily-log activation
must never become the ultimate KPI on its own. The real chain is *value →
return → meaningful study → habit → conversion when relevant*. **A rep must
never be rewarded for forcing a checkbox.** Practical protection: pair every
activation credit with a **7-day sustained-logging check** — a log that does not
survive a week was a checkbox, not a habit.

---

## 8. Anti-gaming — what we must never incentivise

Thinking as a rep on ₹25k with a target:

| The move | Structural block |
|---|---|
| Call only students about to log anyway | **Baseline-adjusted credit** — easy students are worth ~nothing |
| Log calls that never happened | Unpreventable (no telephony, permanently). **But** claimed contacts that never precede returns show effectiveness ≈ 0. The product is the witness |
| Push meaningless logs | **7-day sustained check** (above) |
| Book unsuitable students | Credit on **completed**; clawback on refund/no-show |
| Re-touch the same easy few | **Frequency cap** (max 2 per 7 days, never 2 in 24h) + distinct-students-reached |
| Manipulate HOT/WARM/COLD | **Firewalled** — cannot affect routing, priority, capacity, or score |
| Avoid difficult students | Lane coverage %, shown per rep |
| Schedule follow-ups never honoured | **Honoured %** is a headline metric |
| Optimise the dashboard | Both north stars are *student behaviours* the rep cannot write to — **product truth is write-revoked to sales at the database level** |

**NEVER INCENTIVISE:** calls made · messages sent · students touched · hours
online · bookings (as opposed to completions) · raw daily logs without the
sustained check · HOT labels.

**The BYJU'S lesson, stated once:** valuation ~$22B → under $250M; reporting
describes unrealistic targets on first-time job seekers, pushing products at
parents who could not afford them, and telling parents their children would
fail without it. **Nobody set out to mis-sell. The incentive produced the
behaviour.** That is why commission on bookings is off the table.

---

## 9. Remote operating model — output, not hours

**FACT:** MIT Sloan research cited in the remote-sales literature — **>92% of
monitored employees trust their employer less; 81% of managers trust their
workers less.** Punitive tracking makes reps do the minimum needed to avoid
attention.

**So: no working hours as a management concept.** Clocks exist for two reasons,
neither of them monitoring:

1. **Student protection** — contact only 09:00–21:00 IST.
2. **Callback realism** — self-declared calling windows so promises land when
   the rep is actually available. Never enforced.

**SLA belongs to the student's situation, not the rep's shift:** broken streak
→ contact within 48h (habit stays warm ~72h); never-logged → within 72h;
**promised callback → at the promised time (absolute)**. Missing an SLA then
describes *a student who needed help and did not get it*, which is worth
measuring, rather than accusing someone of not being at a desk.

**Management practice, from the research:** separate **normal visibility**
(logged calls, notes, pipeline movement) from **exception alerts** (missed
follow-ups, priority students untouched). Review monthly **as a conversation,
not an audit**.

**FT vs PT fairness:** never compare raw volume. Compare **effectiveness per
intervention** (activation above baseline) and **reliability** (promises
honoured %). A part-timer at 40% of the volume with equal effectiveness is
doing the job perfectly.

---

## 10. Compensation

| Period | Recommendation |
|---|---|
| **First 3 months** | **Fixed salary only. No variable pay.** We do not yet know what good looks like; a target now would be a guess with a person's income attached to it |
| After a repeatable playbook exists | Fixed + modest capped bonus on **completed sessions** and **baseline-adjusted activation**, clawed back on refunds/complaints |
| Never | Commission on **bookings**. Commission on calls. Anything on raw log counts |

**FACT — market calibration:** PhysicsWallah tele-counsellor roles sit at
₹2–3 LPA (≈₹17,000–25,000/month); Unacademy sales roles start ~₹3 LPA. **₹25,000
is market-correct to generous. The rate is right; the role definition is what
needs to change.**

---

## 11. Automatic assignment — the Part 8 decision

**RECOMMENDATION: do not build Phase 2B-2. Delete it from the roadmap for now.**

**Evidence-based triggers that would change my answer** — build it only when at
least two are true and *observed*, not predicted:

1. A rep demonstrably cannot process the priority queue in their working time
2. Priority students routinely breach the contact window because nobody owned them
3. Unclaimed priority leads accumulate for >48h while capacity exists
4. Two reps collide on the same student more than occasionally
5. Team grows beyond ~4 people

**None is true today.** Two people reading a ranked list do not need an
allocation engine. `claim_lead` is already atomic and race-safe.

**Founder principle, adopted: do not automate a problem we do not have.**

---

## 12. Duplication and canonicality — the Part 18 rule

**Verified this session — every concept has exactly one implementation:**

| Concept | Canonical source | Status |
|---|---|---|
| Student identity | `profiles.id` | KEEP |
| Lane classification | `classifyLane` (call-queue.ts) | KEEP — 1 definition verified |
| Conversion score | `scoreConversion` (sales-score.ts) | KEEP — 1 definition verified |
| Weakness | `resolveFocusSections` | KEEP — 1 definition verified |
| Queue | `buildCallQueue` | KEEP — 1 definition verified |
| Lead status vocabulary | `LEAD_STATUSES` = DB CHECK | KEEP |
| Ownership | `lead_outreach.owner_id` via atomic `claim_lead` | KEEP |
| Ownership history | `sales_activity` | REUSE — **no new table** |
| Capacity | `sales-capacity.ts` | KEEP (built, read-only) |
| MIS | `sales-control-tower.ts` | EXTEND, never fork |
| Notification dispatch | `notification-os.ts` `dispatch()` | KEEP — single send gate |
| **Intervention ledger** | *does not exist* | **NEW — the only new table proposed** |

**DEPRECATE:** `student_crm` dual-write (zero readers), `cat_test_leads` (no
consumer). **DELETE:** nothing.

---

## 13. Roadmap — revised

| Phase | Objective | Verdict |
|---|---|---|
| **P0 — Channel repair** | Verify email actually sends; add install/push prompt *after first log*, not at signup; cut push frequency from ~4/day toward ~1 | **DO THIS FIRST.** It affects 646 students; everything else affects dozens |
| **P1 — Intervention ledger** | One append-only table + weekly read | The learning loop. Cheap, highest long-term value |
| **P2 — Lane baselines** | Uncontacted comparison per lane | Makes activation credit honest; kills the easy-student game |
| **P3 — Outcome attribution** | Reached vs unreached weekly table | The business case for the hire |
| **P4 — Experiments** | A/B openings, timing, channel | Only after P1–P3 are stable |
| **~~2B-2 automatic assignment~~** | — | **DELETE** (§11) |
| **DO NOT BUILD** | ML scoring, predictive models, second dashboard, call recording, telephony, weighted capacity, teams/pods | None is the constraint |

**Sequencing logic: P0 before any hire starts.** Putting a person to work
inside a broken return loop means their results measure the plumbing, not their
method — and we would learn nothing.

---

## 14. Attribution — measuring incremental impact honestly

**The control group is free and large:** ~600 students we have no capacity to
reach. Same eligibility, same product, same period, no contact.

**The ladder, in order:**

1. **Associated outcome** (week 1) — descriptive only, never called impact.
2. **Lane-matched comparison** (week 2+) — reached never-logged vs unreached
   never-logged. **Controls for the dominant selection bias.** Live here for months.
3. **Propensity matching** (later) — match on tenure, prior logs, momentum.
4. **Randomised holdout** (only if volume supports) — ethically fine here,
   since we cannot reach them anyway; randomising *which* ones we reach
   withholds nothing that was on offer.

**Every number labelled ASSOCIATED WITH CONTACT.** Never "caused". No rate
printed below 30 observations — show **UNAVAILABLE**.

**The founder standard you set, and I would enforce it:** *"If I removed this
person tomorrow, exactly what measurable student behaviour would disappear?"*
The lane-matched table answers precisely that, and it is honest by construction
because both columns come from product truth the rep cannot write to.

---

## 15. Founder decisions required

1. **Approve P0 (channel repair) before the hire starts.** This is the one I
   would fight for.
2. **Verify `RESEND_API_KEY` is set in production.** **UNKNOWN and untested** —
   `email.ts` silently console-logs if the key is absent, so a dead email
   fallback would be invisible. One environment check.
3. **Approve deleting Phase 2B-2** permanently.
4. **Fixed salary only for 3 months**, no commission.
5. **Frequency cap:** max 2 contacts per 7 days, never 2 in 24h.
6. **Approve the intervention ledger** as the only new table.
7. **Push budget:** approve reducing from ~4/day toward ~1/day for reachable
   students.

---

## 16. IF I WERE THE FOUNDER OF CAREERRAI

**What you are misunderstanding:** you are reading a *distribution* failure as
a *motivation* failure. Students are not ignoring CareerRai because they lack
discipline or because nobody called them. **646 of them are not being reached at
all**, and the 149 who are get four notifications a day and have stopped
looking. That is a plumbing problem wearing the costume of a sales problem.

**What you are overbuilding:** the sales system. It is already more capable
than a two-person team can use — queue, lanes, Student 360, dispositions,
follow-ups, DND, capacity, Control Tower — and it has **never been used once**.
More CRM features now is building a second floor on an unoccupied house.

**What you are underbuilding:** the return loop, and the learning ledger.
₹25,000/month buys one person calling 125 students a week. **Fixing the push
frequency and adding a post-first-log install prompt costs a few days of
engineering and touches all 795 — and every student who arrives after.**

**What to kill:** automatic assignment. Weighted capacity. Any ML on this
roadmap. The second dashboard.

**What to accelerate:** P0. Today.

**Where the ₹25k becomes wasteful:** if the person spends eight weeks calling
students who then get no follow-up notification because they were never
reachable. Their entire measured effect would be the plumbing, and you would
conclude — wrongly — that human intervention does not work.

**Where the salesperson creates disproportionate value:** the **302 students
who opened the app last week and logged nothing**. They are engaged enough to
show up. Ten conversations with that group will tell you more about why the
product does not convert an open into a log than any amount of analytics — and
that answer becomes a product change worth more than the salary.

**What data to start collecting immediately:** the intervention ledger, from
call one. Not later. **The first hundred conversations are the most valuable
data CareerRai will ever collect, and they are unrepeatable.**

**The defensible advantage after 12 months:** not the CRM — anyone can buy one.
It is a dataset that maps *student state × intervention × timing → outcome* for
Indian CAT aspirants, and a product that acts on it automatically. Competitors
can copy your features in a month. They cannot copy 500 logged conversations
they did not have.

**And the hiring answer, honestly:** hire, but fix the channel first and point
the person at the 302, not at the 646. **Two people is defensible as an
experiment** — with n=1 you cannot separate "the model fails" from "this person
cannot sell", and ₹120k over three months to answer that before a funding
conversation is cheap. **But run it as an actual experiment: same pool split
randomly, same baseline script in week one, both measured against the
unreached control.** Otherwise you will spend ₹120k and get two anecdotes.

---

## Sources

- [Push notification benchmarks 2025 (Pushwoosh)](https://www.pushwoosh.com/blog/push-notification-benchmarks/)
- [15 Must-Know Web Push Notification Statistics (Gravitec)](https://gravitec.net/blog/15-must-know-web-push-notification-statistics/)
- [Mobile App Push Notification Benchmarks 2025 (Airship)](https://www.airship.com/resources/benchmark-report/mobile-app-push-notification-benchmarks-for-2025/)
- [Education App Benchmarks 2026 (Business of Apps)](https://www.businessofapps.com/data/education-app-benchmarks/)
- [Mobile App Retention Benchmarks by Industry (UXCam)](https://uxcam.com/blog/mobile-app-retention-benchmarks/)
- [App retention rate: 2026 benchmarks by industry (Appcues)](https://www.appcues.com/blog/app-retention-is-hard-heres-how-to-improve-it)
- [PWA vs Native App: when to build an installable PWA (MagicBell)](https://www.magicbell.com/blog/pwa-vs-native-app-when-to-build-installable-progressive-web-app)
- [Behind the product: Duolingo streaks (Lenny's Podcast)](https://www.getrecall.ai/summary/lennys-podcast/behind-the-product-duolingo-streaks-or-jackson-shuttleworth-group-pm-retention-team)
- [The Effectiveness of Learning Analytics-Based Interventions: meta-analysis (SAGE 2025)](https://journals.sagepub.com/doi/10.1177/21582440251336707)
- [Learning Analytics for Early Identification of At-Risk Students (Journal of Learning Analytics)](https://learning-analytics.info/index.php/JLA/article/view/8735)
- [Unveiling the Fall of BYJU'S (IRJEMS)](https://irjems.org/Volume-4-Issue-5/IRJEMS-V4I5P126.pdf)
- [Goodhart's Law: Why Metrics Get Gamed (KPI Tree)](https://kpitree.co/guides/frameworks/goodharts-law)
- [How to Manage a Remote Sales Team Effectively (Claap)](https://www.claap.io/blog/manage-remote-sales-team)
- [Founders: Your First Sales Hire Is Probably a Mistake (Techstars)](https://www.techstars.com/blog/founder-advice/founders-your-first-sales-hire-is-probably-a-mistake)
- [Cal AI: $0 to $50M ARR in 18 months (Superframeworks)](https://superframeworks.com/case-study/cal-ai)

**No code. No migrations. No configuration. Awaiting the seven decisions in §15.**
