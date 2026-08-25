# Sales Pilot Readiness — Co-Founder Review

**24 Aug 2026 · No code. No configuration. Recommendation before numbers.**
Labels: **FACT** (verified), **RECOMMENDATION**, **INFERENCE**, **UNKNOWN**.

---

## 0. The recommendation I most want you to read

**The pilot may prove that automatic assignment is unnecessary at this team
size, and that would be a good outcome, not a failed one.**

Two reps working a shared pool will realistically work 20–30 students a day.
If they never approach their capacity ceiling, an engine that distributes
leads by available capacity solves a problem that does not exist — it would
add a cron, a table's worth of new state, and a class of race conditions to
replace a "claim" button that already works atomically.

So I would frame the pilot's decision as genuinely two-sided: **not "when do
we turn on 2B-2" but "does 2B-2 earn its existence?"** The threshold in §9 is
written to be capable of returning NO.

---

## 1. What a salesperson does every day

```
10:00  Open /sales → the deck is already ordered. No filtering, no searching.
       Read the top card: WHO, WHY (with the evidence), and the suggested move.
       ↓
       Tap the name → Student 360 → 20 seconds of context:
       14-day study strip · latest mock · coverage by section · what they
       told us at signup · every previous interaction.
       ↓
       Tap Call (or WhatsApp — opens their own app, pre-filled).
       ↓
       Log the outcome. Mandatory note if they connected. If a callback was
       promised, the exact time.
       ↓
       Card leaves the deck. Next card. Repeat.
17:00  Work the callbacks that came due during the day (they re-surface
       automatically at the top).
End    /sales/summary — what they did and what came of it.
Next   The promised callbacks are waiting at the top. Nothing to remember.
```

**The one thing this workflow guarantees:** a rep never decides who to call.
The queue decides, and it shows its reasoning. That is the difference between
this and a spreadsheet.

## 2. What they can see about each student

**Can see:** name, phone, signup date, momentum band, 14-day study strip,
streak, section-wise syllabus coverage, strongest/weakest section **with the
source rung named** ("from their mock" vs "no evidence yet — do not assert"),
latest mock percentiles, top untouched high-value topics, buddy-interest
signals, their own words from signup, full interaction history, open
follow-ups, recommended mentor, the ₹299 objection playbook.

**Cannot see:** payment amounts, payment history, refunds, other reps' books,
any student not owned-or-unclaimed. A student who already paid shows only
"already premium — no sales ask needed."

**The licence this operates under (MISSION/TRUST-OS):** a rep sees study
behaviour *in order to help that student*. Not to profile them, not to export
them, not to pressure them. That boundary is why the payment ledger is closed
to reps and why access is audited.

## 3. What they must record after every interaction

| Field | Required? | Why |
|---|---|---|
| Outcome (interested / callback / converted / not interested / no answer / **DND**) | **Yes** | Drives the cadence; nothing else re-queues the lead |
| Note ("what did they say?") | **Yes on any connected call** | The next call starts where this one ended |
| Callback time | **Yes if callback** | It becomes a promise the system will surface |

**DND is one tap and permanent.** A student who says "stop calling me" must
never resurface. This existed as a suppression rule with no way to set it
until this month; it is now a real outcome.

**What they must NOT be able to do:** change a study log, a mock score, a
streak, a coverage status, or anything about payment. Those are product truth,
write-revoked to sales at the database level. A rep records *what they
observed*; the product records *what happened*.

## 4. How retention performance will be measured

For every student who receives a **first connected contact** at time T:

- logged the same day · **next day (D+1)** · within D+3 · within D+7
- momentum band at T vs T+7 (recovered / held / declined)

**Compared against what — and this is the methodological point that matters:**

**RECOMMENDATION — compare within the same lane, not against the whole pool.**
Reps will work the highest-priority students first, so "reached" and
"unreached" differ systematically. Comparing a reached going-cold student to
an unreached fresh student measures the queue's sorting, not the rep's effect.
Comparing **reached never-logged students to unreached never-logged students**
controls for the dominant selection driver at near-zero cost.

**This is a quasi-experiment, not a trial.** Assignment is not random. Even
matched within lane, a rep may pick the more promising-looking student. Every
number here is labelled **CORRELATION — ASSOCIATED WITH CONTACT**, never
"caused by". At 2 reps and ~14 days the sample will be small; where it is too
small to speak, it must say **UNAVAILABLE**, not print a percentage.

## 5. How conversion performance will be measured

Per contacted student: buddy interest expressed after contact → checkout
opened (`payment_checkout_opened`) → **paid (observed ledger row)** → still
active 30 days after paying.

**WON is a paid row in `student_payments`. Never a rep typing "converted".**
Per-rep conversion *rate* stays suppressed below 30 paid customers — today
there are 5 in total, so it will read UNAVAILABLE for the entire pilot, and
that is correct rather than a gap.

**INFERENCE, stated up front:** at current volume the pilot will almost
certainly not produce statistically meaningful conversion data. Its honest
conversion output is a **count and a narrative** ("3 students booked; here is
what each call looked like"), not a rate. Retention is where the pilot can
actually learn something in two weeks.

## 6. What the founder sees

**Daily (`/admin/sales/tower` + `/admin/sales/capacity`):** new students, leads
in CRM, unassigned, activity logged today, follow-ups due/overdue, going cold,
per-rep working set with **click-through to the exact students**, available
capacity, overflow and its cause, binding constraint, data-quality checks.

**Weekly (the number that matters):** for each lane — students reached,
students who returned within 3 days, and the same figures for the unreached
students in that lane.

**What the founder will NOT see, deliberately:** a daily per-rep "retention
lift" percentage. At 3 calls a day that number is noise, and noise printed
next to a person's name becomes a judgement about that person. Weekly and
pooled, or not at all.

## 7. Evidence classification of every pilot metric

| Metric | Class |
|---|---|
| Student logged / studied / streak / coverage / mock | **FACT** (product truth) |
| Payment, checkout opened | **FACT** (observed, webhook) |
| Lead assigned, follow-up created/closed | **FACT** (system-generated) |
| "Called", "connected", "student said…", HOT/WARM/COLD | **SELF-REPORTED** — never summed with observed |
| Contact → return-to-app relationship | **CORRELATION** — associated with, never caused by |
| Per-rep conversion rate (< 30 paid) | **UNAVAILABLE** |
| SLA breach counts (nothing sets a due time until 2B-2) | **UNAVAILABLE** (absent, not zero) |
| New leads today (live panel) | **NOT INSTRUMENTED** — derivable in analysis (§8) but not shown live |
| Whether a phone call physically occurred | **UNKNOWABLE** — no telephony, permanently |

## 8. What the pilot measures over 7–14 days

1. **Follow-ups created and completed, per rep per day** — the input that will
   dominate capacity in steady state, and the one nobody has ever measured.
2. **Students genuinely worked per rep per day** — the real throughput number.
3. **New leads absorbed per rep per day** — derivable as the first activity per
   rep-student pair (verified recordable; no schema change needed).
4. **Peak concurrent open work per rep** — the number `max_capacity_units`
   should actually be set from.
5. **Contact → D+1 / D+3 study return**, matched within lane (§4).
6. **Lane productivity** — do activation calls, retention calls, or conversion
   calls produce more return-to-app?
7. **The dormant question** — of students contacted and not engaged within 7
   days, how many exist, and did *any* contacted student engage at all?
8. **Whether reps ever approach capacity** — the question that decides §9.

## 9. What must be true before automatic assignment is approved

**Approve 2B-2 only if ALL of these hold:**

- ≥ 10 working days of usage, ≥ 100 logged activities, both reps active
- A **stable observed daily throughput** per rep (a range, not one good day)
- **Peak concurrent open work is within 20% of a ceiling we would set** — i.e.
  capacity is a real constraint, not a theoretical one
- At least one complete cycle observed: claim → call → disposition →
  follow-up due → follow-up completed
- Capacity panel verified against a hand count on day 1 and at the end
- No red data-quality check
- Manual claiming has caused an actual, observed problem (collision, a lead
  neglected because nobody owned it, or unfair distribution)

**Reject or defer 2B-2 if:**

- Reps never approach capacity → **the engine solves nothing; do not build it**
- Throughput is so low that the pool never turns over → the constraint is
  headcount, and automation would be decoration
- Manual claiming caused no problem in two weeks → the atomic claim is
  sufficient; revisit at 5 reps

**I would rather delete Phase 2B-2 from the roadmap than build it because it
was on the roadmap.**

## 10. Students contacted who never engage

**FACT:** in steady state 404 of 466 (86.7%) go dormant. Some of those were
contacted and did nothing.

**RECOMMENDATION: add no lane, and no automatic re-contact, during the pilot.**
Measure instead: how many are contacted-and-silent at 7 days, and — the
question that actually decides this — **did contact move anyone at all?**

- If contacted students return at a meaningfully higher rate than matched
  unreached ones, a second-touch lane is worth designing.
- If contact moves nobody, a second lane would just double an ineffective
  action. The problem would be the *call*, not the *cadence*.

Deciding before we know which is true is exactly the assumption-driven design
this workstream has spent a week eliminating. **Founder decision after data.**

## 11. The 25-card activation cap — my recommendation: LEAVE IT, for a reason

The evidence says activation is the bottleneck (65.9% fresh, 56 never-logged,
6 in retention lanes). My instinct was that the cap now works against that.
Thinking it through, I do not think it should change yet:

- **It does not bind operationally.** The deck holds 60; activation sits above
  conversion in rank. A rep working 20–30 students a day never reaches card 31,
  so the 25-card cap does not hide work they would otherwise have done.
- **Removing it would starve the pilot of conversion evidence.** If the deck
  becomes almost entirely activation cards, we learn nothing about whether
  buddy-interest students convert — one of the two things the pilot exists to
  learn.
- **There is a cheaper signal.** If a rep *clears* their activation cards in a
  day, that is the evidence the cap should rise — and it is directly
  observable during the pilot.

**Change it when a rep empties the lane, not before.** One constant, one line,
any time you say.

## 12. The complete operating workflow

**Salesperson:** login → deck (already prioritised, each card explains itself)
→ open student → 20 seconds of context → call/WhatsApp → log outcome →
next card → callbacks re-surface at their promised time → end-of-day summary.

**Founder:** morning Control Tower (what happened, what is overdue, who is
going cold) → capacity panel (who has room, who is overflowing and why) →
click any number to reach the exact students → weekly, the lane table showing
reached vs unreached return rates → data-quality panel to know whether the
numbers can be trusted at all.

**The loop that makes it a system rather than a dashboard:** every number
drills to its students; every student drills to their history; every
interaction drills to what the student did afterwards.

---

## What I need from you before configuring

1. **Is Priya one of the two hires, or being replaced?** (Account exists;
   used once on 22 July, never since.)
2. **Names and emails** for whoever is new.
3. **The numbers** — my conservative proposal stands: FT Mon–Sat 10:00–19:00,
   35 active units, 12 new/day; PT Mon–Sat 17:00–21:00, 15 units, 5/day;
   24 working-hour first-contact SLA for both.
4. **Confirm the activation cap stays at 25** for the pilot (§11).

**Status: no code written, nothing configured. Awaiting these four before any
write.**
