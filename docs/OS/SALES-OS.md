# Sales OS — Final Product Contract

> **RATIFIED 29 Aug 2026.** This is a binding Constitution under the authority
> described in `AGENTS.md`. Read it before changing anything in the sales
> domain. Amendments carry a dated note saying what changed and why.
>
> **Amendment 1 (29 Aug 2026), after the Contract × Repo audit.** Four
> corrections, all recorded inline below: §3 rule 1 now describes the enforced
> mechanism rather than asserting a behaviour that did not exist (Incident #52);
> §4 distinguishes lane order from primary objective; §5 gains the catch-all
> rule that makes "42 means 42" true; §12 defers to `student-success-mis.ts`
> instead of proposing work already done.

---

## 0. The hierarchy, and the one safeguard that matters most

Everything in this document exists to serve two business goals. Nothing else in
it is an end in itself.

| | Layer | What lives here |
|---|---|---|
| **P0** | **Business goals** | Retention · Conversion |
| P1 | Student intelligence | Who needs attention, and why |
| P2 | Salesman workflow | Call / WhatsApp → response → disposition → follow-up |
| P3 | Automation | Queue refresh · cooldown · resurfacing |
| P4 | Founder visibility | Coverage · outcomes · conversion · retention · feedback |
| P5 | Telemetry | Taps · profile opens · active time · clicks |

**THE SAFEGUARD: P5 must never become P0.** A system that measures taps will
eventually be optimised for taps. Every metric in this document is classified,
and a P5 number may never appear as a performance judgement, a target, a quota,
or an input to pay. It may only appear as context for understanding behaviour.

Any change that moves a number up this hierarchy — making profile opens a KPI,
making call count a target, making hours worked a measure of output — violates
this contract regardless of how reasonable it looks in the pull request.

---

## 1. What the two counsellors are for

Their job description is two lines. Not five.

**Goal 1 — Retention.** Keep a student studying. Notice when they stop,
understand why, and bring them back into a routine.

**Goal 2 — Conversion.** Where a student shows real need or buying intent, have
the right conversation at the right moment and take them to the paid offering.

**Feedback is a by-product, not a third job.** When a student says *"the app has
this problem"*, *"I don't understand DILR"*, *"why should I pay ₹299"*, or *"I
want a mentor but don't know how"* — that goes in a remark, and it becomes
product and business intelligence. It is captured as a side effect of a
conversation the counsellor was having anyway. **A separate feedback form is
forbidden by this contract**: it turns a by-product into a chore and the quality
of both collapses.

---

## 2. Division of responsibility

> **The system decides WHO needs attention and WHY.
> The salesman decides HOW to have the conversation.
> The system records WHAT happened and determines WHEN the student surfaces again.**

This sentence resolves most design arguments before they start. If a proposal
asks the counsellor to decide *who* to call, it is wrong. If it scripts *how*
they talk, it is wrong. If it relies on them remembering *when* to call back, it
is wrong.

**They are given opportunities, never a lead list.** The difference is not
cosmetic:

| Forbidden | Required |
|---|---|
| "Here are your 80 leads. Call them all." | "These 72 students are where action is most valuable today." |
| A list to manage | A queue that manages itself |
| The rep works out why | The card says why |

---

## 3. Student state machine

One student has exactly one sales state at a time. `lead_outreach.student_id` is
the primary key of that table, so this is enforced by the schema, not by code.

```
                    ┌──────────────────┐
     enrolled ─────▶│  not_contacted   │
                    └────────┬─────────┘
                             │ first contact attempt
                             ▼
                    ┌──────────────────┐
              ┌────▶│      called      │◀────┐
              │     └────────┬─────────┘     │
              │              │               │ retry / cooldown elapses
              │   ┌──────────┼──────────┐    │
              │   ▼          ▼          ▼    │
              │ interested  follow_up  no_answer
              │   │          │          │
              └───┴──────────┴──────────┘
                             │
                 ┌───────────┼────────────┬──────────────┐
                 ▼           ▼            ▼              ▼
             converted  not_interested   dnd        unqualified
             (TERMINAL)  (TERMINAL)   (TERMINAL)    (TERMINAL)
```

**Rules that bind:**

1. **Only the payment ledger may produce `converted`.** A counsellor cannot
   type their way to a won deal.
   *Amended 29 Aug 2026:* the original text said this was "already true in
   code". **It was not** — the audit found the opposite (Incident #52): a typed
   `converted` was terminal in `call-queue.ts` and deleted the student from
   every future queue with no payment anywhere. It is true now, and enforced by
   `isClosedForSales()` in `sales-conversion-truth.ts`, which closes a student
   on the payment ledger and on the two things the student themselves said —
   never on a typed status. A claim without money is recorded as history with
   `self_reported` provenance and raises a founder exception; the student stays
   in the book.
2. **The four terminal states never resurface.** `not_interested`, `dnd` and
   `unqualified` are closed forever; `converted` leaves the sales queue and
   becomes a retention relationship.
3. **`no_answer` is not `not_interested`. `not_contacted` is not rejection.**
   Collapsing these is the single fastest way to turn the conversion funnel into
   garbage, because it converts our failure to reach someone into their refusal
   to buy. The vocabulary keeps them apart at the database
   (`sales_activity_status_check`), and no reporting layer may merge them.
4. **`uncontactable` is a suppression, not a state.** A student with no phone
   number keeps their real state and their owner, and is simply never surfaced
   as a call. They appear instead as a data-quality exception. Dropping them
   would make them nobody's responsibility forever.
5. **`unqualified` must be added** to `lead_outreach_status_check`,
   `sales_activity_status_check` and `CONNECTED_OUTCOMES`. It exists in none of
   them today. It means wrong number, not a CAT aspirant, or a duplicate human —
   and crucially it *shrinks the book*, so a counsellor is rewarded for cleaning
   rather than punished with a smaller queue.

---

## 4. Two queues, because there are two goals

The queue is not organised by priority alone. It is organised by **which
business goal the contact serves**, and the counsellor is always told which one.

### Retention queue — bring the student back to studying

Signals: streak break · yesterday missed after a consistent run · sudden stop in
logging · previously active, now inactive · repeatedly missing study · weak
consistency · never activated · declining activity.

The card shows a **retention reason**.

### Conversion queue — act on real need or intent

Signals: checkout opened · payment started, not completed · Buddy CTA · intent
page · repeatedly exploring paid or help features · asking strategy questions ·
asking mentor questions · explicitly said "later" · a previous sales
conversation with a follow-up now due.

The card shows a **conversion reason**.

### When a student is in both

This is common and must not produce two tasks. One student, one card, one call:

```
PRIMARY OBJECTIVE:   Conversion
SECONDARY CONTEXT:   Retention — 3 days without a log
```

**Conversion is primary when a live commercial signal exists; retention is
primary otherwise.**

*Amended 29 Aug 2026.* This is about the CARD, not the QUEUE, and the audit
found the two being confused. The build order of 24 Aug puts retention lanes
above conversion lanes; that decides **who gets surfaced at all**. Primary
objective decides **what a given call is about**. A student surfaced by a
retention lane who also has an abandoned checkout still gets
`PRIMARY = CONVERSION` on their card. And because §5 fills the two lanes
independently, "which lane ranks higher" rarely decides anything. Both
statements stand; they were never in conflict once separated.

The counsellor covers both naturally in one conversation —
*"your preparation looks a bit irregular and you'd also looked at strategy
support — is something specific getting in the way?"* — instead of making two
robotic calls to the same person.

---

## 5. Sizing: the system owes the day, the counsellor owes the outcomes

*Amended 2 Sep 2026 on the founder's word ("take charge… keep a range 50–70
daily"; the design and the reasons are in `docs/SALES-DAILY-DAY.md`).*

**The system owes each counsellor a full day: 50 to 70 named students, each
with a true printed reason and a channel.** The counsellor owes conversations
and outcomes, never a count. The number is what the platform must supply, not
what a person is judged on — it is never a component of pay or performance,
and a day the book cannot fill is reported short, never padded.

**Rotation is a lane with a reason, not padding.** A student nobody has spoken
to in 21 days is due a touch, oldest first; the card says so in words
("last spoken to 24 days ago — nothing since"). Signals fill the day first;
rotation fills the rest, with a floor so the silent book always moves.

The rest of this section, written before the amendment, stands where it does
not conflict:

| Actionable today | The queue shows |
|---|---|
| 43 | **43.** Never padded to 100 with cold students. |
| 120 | The best 70–100, with the rest available as a ranked pool. |

A short queue on a Tuesday is information about the base, not evidence about the
counsellor. The founder dashboard must present it that way.

**No catch-all lane.** *Added 29 Aug 2026.* The audit found that "42 means 42"
was unenforceable: `call-queue.ts` had a `fresh` lane documented as "everyone
else", so once a book exists the queue can never be short — it always fills to
the cap. **Every lane must require an actual signal.** A student with no current
signal is backlog, reachable through the ranked pool, never auto-dealt to pad a
day. Without this rule the no-padding promise is decoration.

### The retention floor

A counsellor optimising for conversion will rationally starve retention: paying
students are where visible reward is. Left unprotected, the free student who will
never pay stops being called — which contradicts `docs/MISSION.md` directly.

**So retention opportunities may not be crowded out of the queue by conversion
opportunities.** The two lanes are filled independently before any overflow
ranking is applied, and the founder dashboard reports retention and conversion
work separately and always — neither may be hidden inside a combined "worked"
number.

---

## 6. The card: two layers, never a database dump

### Layer 1 — the five-second view

Exactly this, and nothing more:

- Name
- **WHY TODAY**
- Retention status
- Conversion signal
- Last interaction
- Known weakness
- Recommended action + channel

### Layer 2 — Open 360, only on demand

Signup date · study history · streak · subject performance · weak areas · recent
activity · Buddy interactions · payment and checkout history · previous
conversations · remarks · follow-ups · WhatsApp events · full timeline.

**The default screen is never the 360.** If a counsellor needs 60 seconds to
work out why the system handed them a student, the queue has failed at its one
job.

### Channel is part of the recommendation

Call · WhatsApp · Callback · Reactivation. Not every student is a phone call.
Forcing 100 calls on a part-timer with five hours is how coverage collapses.

---

## 7. The weakness rule

Telling a counsellor *"student is inactive"* is nearly useless. Telling them
*why this student might need help* is the difference between a pitch and a
diagnosis:

> DILR accuracy declining · study consistency falling · mock performance
> stagnant · planning gaps · frequent missed days

**Every fact on a card carries its evidence class.** The database already
enforces the vocabulary — `sales_activity.provenance` is constrained to
`observed · vendor_reported · self_reported · system_generated · imported ·
unknown` — and the card must render it.

**The phrasing rule, which is the part that protects trust:**

| The system inferred it | Forbidden | Required |
|---|---|---|
| DILR accuracy trending down | "Aapki DILR problem hai." — asserted as fact | "DILR mein koi difficulty aa rahi hai kya?" — asked as a question |

An inference is a question to ask, never a fact to assert back to the student.
Stating an inference as though the student said it is how a helpful call becomes
a creepy one, and it is prohibited.

---

## 8. Disposition, remarks, follow-up

Deliberately lightweight. The counsellor should be talking, not filling forms.

**Outcome** — one tap: Connected · No answer · WhatsApp sent · Callback ·
Interested · Not interested · DND · Unqualified · Converted.

**Student response** — one optional tap from a short reason list.

**Remark** — short free text, and only where it carries something a structured
field cannot: *"Student said busy till Monday. Wants strategy discussion after."*

**Follow-up** — if the student names a time, the counsellor sets it and forgets
it. A date that lives only inside remark text does not exist. This is binding: a
promised date **must** create a `sales_followup` row, never a note.

**"Worked" means dispositioned.** Pressing call is not work. Opening a profile
is not work. A student counts as worked only when a valid outcome is recorded.
This is the rule that stops the daily counter becoming a thing to game.

---

## 9. Feedback taxonomy

Optional on every disposition, prompted on none. Categories exist only where they
make the free text searchable later:

`product_complaint` · `pricing_objection` · `feature_request` ·
`content_gap` · `mentor_need` · `competitor_mention` · `personal_circumstance`

The remark is the truth; the category is an index into it.

---

## 10. The loop

```
student ─▶ signal ─▶ salesman action ─▶ student response ─▶ disposition
   ▲                                                            │
   │                                                            ▼
   └──── next queue ◀──── cooldown / follow-up ◀────── outcome recorded
                                                                │
                                              ┌─────────────────┴──────────────┐
                                              ▼                                ▼
                                          RETENTION                       CONVERSION
                                       (student active)                    (payment)
```

The counsellor is not only doing work. Every interaction makes the next day's
queue better informed. That is why disposition quality is the one workflow
behaviour worth insisting on.

---

## 11. The founder dashboard

It reports **outcomes and coverage**, never activity volume. "Anshul made 57
calls today" is banned as a headline, because 57 calls can be worth nothing.

**Retention** — students needing intervention · interventions completed ·
students reactivated · students still slipping.

**Conversion** — high-intent students surfaced · contacted · meaningful
conversations · follow-ups · payments · conversions by counsellor.

**Coverage** — actionable opportunities today · worked · untouched ·
**high-priority untouched**.

**Feedback** — product complaints · pricing objections · feature requests · pain
points · repeated objections.

**Lead leakage is named students, never a count.** "7 high-priority remaining"
is useless; it renders as a list — *Rahul Sharma, checkout abandoned 2 days ago,
surfaced 3 days running, never opened*. Per `docs/SCALE-CONTRACT.md`, a count
that cannot be drilled into is a chart, and this contract does not permit charts.

---

## 12. Telemetry: tracked, never judged

Profile opens, call-button presses, WhatsApp clicks and active time are recorded
because they explain *how* someone works. They are P5.

> Anshul — profile opens 94 · calls 48 · WhatsApp clicks 31 · **valid
> dispositions 61**

Only the last number is output, and even it is only a proxy. The real answers are
*how many were retained* and *how many converted*.

**Honesty rules that already hold in code and must not regress:** a WhatsApp
*click* is not a *sent* message and neither is a *reply*; a call *initiated* is
not a call *connected* unless the channel confirms it. Where confirmation does
not exist, the number is labelled `NOT INSTRUMENTED` — never rendered as zero.

---

## 13. Attendance

Attendance answers *"was this person actually working?"*, not *"did they sit for
six hours?"*

Recorded: first login · Start Day · End Day · meaningful active periods ·
profiles opened · actions · dispositions · follow-ups completed.

**Hours are never a target.** A counsellor who does 70 meaningful interactions in
4.5 hours has done their job. Time is context for interpreting output, and pay is
governed by `sales-earnings.ts` — fixed plus incentive — never by hours logged.

---

## 14. Measuring the two goals honestly

This section exists because both goals are easy to *claim* and hard to *prove*,
and a contract that ignores that will produce confident nonsense within a month.

**Conversion is measurable.** High-intent surfaced → contacted → meaningful
conversation → follow-up → payment, with the payment ledger as the only truth
and attribution snapshotted at payment. This already works.

**Retention is not, without care.** The chain *at risk → contacted → reactivated
→ stayed active* is only a correlation. Students who are called are the students
the queue judged reachable and worth calling — so "68% of contacted students came
back" may measure the selection, not the call.

**The honest fix already exists and must not be rebuilt.** *Amended 29 Aug 2026:*
the original text proposed the same-lane reached-vs-unreached comparison as new
work. `compareByLane()` in `src/lib/student-success-mis.ts` already implements
it, with D1/D3/D7 outcome windows and a minimum-per-arm threshold that returns
`UNAVAILABLE` rather than a thin percentage. Its own comment is stricter than
this contract was: *"reps work the students most likely to respond, so a raw
'contacted students log more' comparison measures the rep's TARGETING, not their
effect… and it is still not causal — the rep picks whom to call inside the lane
too."*

**`student-success-mis.ts` is the retention-measurement authority.** Building a
second one violates non-negotiable #14. The real work is narrower than this
contract first claimed: feed its intervention ledger from the new queue.

**We will not run a deliberate holdout** — withholding a helpful call from a
student to improve a measurement is not compatible with `docs/MISSION.md`. The
natural comparison is weaker and it is the one we are entitled to.

Until there is enough data for that comparison, retention impact is reported as
`NOT YET MEASURABLE`, never as a percentage.

---

## 15. Non-negotiables

A change that does any of these violates this contract, however well-intentioned:

1. Making a P5 telemetry number into a target, a quota, a KPI or an input to pay.
2. Judging a counsellor on a count. (*Amended 2 Sep 2026:* the 50–70 day is
   what the SYSTEM must supply — §5 — never what the counsellor must hit.)
3. Dealing a student with no true printed reason. (*Amended 2 Sep 2026:*
   rotation's reason — "nobody has spoken to them in N days" — is true and
   printed; a card without one is padding and is forbidden.)
4. Letting a typed status override the payment ledger as conversion truth.
5. Merging `no_answer` with `not_interested`, or `not_contacted` with rejection.
6. Letting a promised follow-up date live only in free text.
7. Surfacing an inference to a counsellor without its evidence class, or
   phrasing an inference as something the student said.
8. Letting conversion work crowd retention work out of the queue.
9. Making the default card a full profile dump.
10. Reporting a high-priority untouched *count* without the named students.
11. Reassigning ownership because of a student's temperature. Ownership is
    stable; attention is dynamic.
12. Adding a separate feedback form.
13. Reporting a retention percentage before the comparison in §14 is possible.
14. Building predictive or AI lead scoring before deterministic rules have been
    validated against real outcomes.

---

## 16. What this contract does not cover

Deliberately out of scope, to be decided when there is evidence rather than now:
the weighting between priority lanes once conversion data exists (§5 of the
distribution design says these are configuration, not belief); a third or fourth
seat; and any learned ranking model. Each returns as an amendment with data
attached.
