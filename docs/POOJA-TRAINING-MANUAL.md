# CareerRai — Core Training & Process Manual

> **Status: internal training document, v1. Owner: founder. Subject: Pooja
> (and any future team member in the same seat).**
>
> Pooja's exact job title and scope were not specified in any source
> document, so this is built as a **Core Training & Process Manual** —
> role-specific modules (a defined sales target, a specific team's SOPs) can
> be added later once that scope is confirmed. Nothing role-specific is
> invented here.
>
> Built from verified CareerRai source material only: the live codebase
> (`src/lib/plans.ts`, `src/app/refunds/page.tsx`, `src/lib/premium.ts`,
> `docs/MISSION.md`, `docs/OS/TRUST-OS.md`), the founder's own new draft
> manual (13 Aug 2026), and the two prior Pooja training artifacts already
> approved (10–11 Aug 2026). Where these disagree, the disagreement is
> recorded in **Appendix A**, not silently resolved.
>
> **Golden rule, stated once, true everywhere in this document:**
> *If you don't know the answer, don't create an answer. Unknown is better
> than wrong.*

### ⚑ ROLE-SPECIFIC INFORMATION REQUIRED

The following are needed before parts of this manual can be finalised —
none are invented, all are marked at the point they matter:

1. **Pooja's exact job title / scope** — is she full-cycle sales, a
   qualifier who hands off to someone else, support-only, or something else?
   Affects what "her responsibility" means throughout Module 01 and the
   Escalation Matrix (Module 03).
2. **A named escalation owner** — every escalation path in this manual
   currently reads *"Founder/team confirmation required"* because no source
   document names a specific person or role to escalate *to* (beyond the
   founder generally, and `business@careerrai.com` for refund requests).
3. **A confirmed live outbound channel** — WhatsApp Business number, or
   another channel — for the WhatsApp-template scripts in Module 04 to
   reference concretely.
4. **A first-week target** (if the role includes a quota) — explicitly not
   invented here, per the founder's own note that no role-specific sales
   target should be assumed.

---

## 0. How to use this manual

This manual is CareerRai's operating system for a human team member, in five
layers. Keep them separate — a fact is not an instruction, and an instruction
is not a script.

| Layer | Answers | Module |
|---|---|---|
| **KNOW** | What is true about CareerRai | 01, 02, 07 |
| **DO** | The process to follow | 03 |
| **SAY** | Approved language | 04 |
| **CHECK** | FAQs, pricing, policy | 05, 06 |
| **ESCALATE** | What you must never decide alone | every module, §13 pattern |

This is the same discipline CareerRai's own AI voice agent (Expedify) already
runs on: **Role = WHO, Objective = WHAT, Background = knowledge, Instructions
= HOW, Constraints = what never happens.** You are being trained the same way
the AI is governed.

CareerRai's operating principle is **say less, never more.** One clear
answer beats ten features. If you are unsure whether something is true,
saying so honestly beats a confident wrong answer — every time, no exception.

**You are not being trained to memorise this document.** You are being
trained to reach the point where you think *"I know the process, and if
something is unknown, I know exactly where to check or who to ask"* — not
*"I need to go re-read the manual."*

### Training Hub information architecture

This document is also published as a navigable hub (not a PDF to scroll
through) — 11 cards, one per module below, so any answer is a click away
instead of a scroll away:

`START HERE` · `PRODUCT` · `PROCESS` · `SCRIPT` · `FAQs` · `PRICE & POLICY`
· `KNOWLEDGE BASE` · `REAL EXAMPLES` · `TRAINING` · `CERTIFICATION` ·
`CHANGE LOG`

Each card maps 1:1 to a module below — the hub is a navigation layer over
this exact content, not a second, different source of truth.

---

## MODULE 01 — Start Here

### Welcome

You're joining CareerRai at an early, honest stage. The company has real
students, a real product, and a real gap: most students who sign up don't
come back. Your job touches the highest-leverage problem the company has —
getting a real, serious CAT aspirant to actually experience the product,
honestly, without an over-promise that comes back to bite them (and us)
later.

### What CareerRai is

CareerRai is a CAT preparation platform built around **execution**, not more
content. The core problem it solves is the gap between:

> "I know what I should study." — and — "I actually studied the right thing
> today."

The product loop is: **Plan → Study → Log → Plan adjusts.** CareerRai uses
the student's *actual* preparation data — not what they intended to do — to
keep giving them the next right thing to study.

### CareerRai's mission (the actual top-priority document in this company)

> *"How do we build a free, massively used student platform that
> continuously learns how Indian students actually study, struggle, decide,
> improve, interact, and eventually achieve outcomes — and use small amounts
> of monetisation only to keep that machine running?"*

Practically, for you, this means: **the free product comes first.** CareerRai
is compared internally to Duolingo and Reddit, not to coaching institutes or
marketplaces. Revenue exists to keep the servers and mentors running — it is
never the goal itself, and a sales tactic that makes the free experience
worse in order to convert someone is against company policy, not just bad
practice.

There are exactly **four surfaces** a student sees:

| # | Surface | Job |
|---|---|---|
| 1 | **Study plan** (free) | "What do I do today?" — the core habit |
| 2 | **Buddy** (paid) | A real human who watches whether the student actually changes |
| 3 | **Daily Pick** (engagement) | A reason to open the app on a day they didn't study |
| 4 | **Depth** | Analysis, reports, journey, blueprint — the payoff for staying |

### What CareerRai is NOT

Never casually describe CareerRai as:

- A traditional coaching institute (we don't teach content/lectures)
- A lecture platform
- A replacement for all study material
- A generic motivation app
- A random mentor marketplace where students browse and compare mentors by price
- A platform that guarantees percentile improvement
- A platform that guarantees IIM admission
- "Better than coaching" as an unsupported claim

**Correct framing:** Coaching provides teaching/content. CareerRai provides
execution, tracking, accountability, and personalised guidance from someone
who has actually seen the student's real prep data.

### Your role

You are the human bridge between a student's doubt and their decision to
trust CareerRai with their preparation. That is a real responsibility — a
CAT aspirant is handing us a year of their life and, often, their parents'
money. Every conversation either earns that or spends it
(`docs/OS/TRUST-OS.md` — CareerRai's binding Trust doctrine, §1: *"Trust is
the product; the app is the delivery mechanism."*).

### What success looks like

Not: reading this manual once and remembering everything.

Success is reaching a point where you can, unprompted:

1. Explain what CareerRai is and isn't, simply.
2. Handle the common questions and objections without checking the manual.
3. Know **exactly** where to check when something is outside what you know.
4. Know when a situation needs to be escalated instead of guessed.

---

## MODULE 02 — Product Knowledge

### The core product loop

```
Student enters CareerRai, gives real info about their prep
        ↓
System understands them: prep level, available time, topic
coverage, weak areas, past attempts, study behaviour
        ↓
Student gets a clear "what to do today"
        ↓
Student studies
        ↓
Student logs what actually happened — including "I studied
nothing today." The log is information, not a punishment.
        ↓
Tomorrow's plan adapts to what actually happened, not what
was planned.
```

This loop — **Plan → Study → Log → Plan adjusts** — is the whole product.
Every feature exists to make one of these four steps easier or more honest.

### The two products

**1. Study plan (free surface)** — `/student/today`, `/student/plan`. A
personalised, adapting daily plan built from the student's own prep data:
what's covered, what's weak, how many days remain to the exam. This is free
and is the core habit CareerRai is trying to build — it is not a lite
version of something, it is the actual mission.

**2. Buddy (paid surface)** — `/student/buddy`. A real, verified IIM
student/alumnus, matched to the student, who reviews their actual prep data
and gives specific feedback — **live weekly sessions plus daily chat
guidance.** (Exact copy used in the live product: *"1:1 mentorship with an
IIM mentor — live weekly sessions & daily guidance."*)

**The distinction that matters most in every conversation:** don't sell the
IIM tag alone. The value is not *"IIM student hai."* The value is *"this
person understands YOUR preparation and can give specific feedback on it."*
A student who hears only "IIM student" hears a credential. A student who
hears "someone who's looked at your actual weak sections" hears a reason to
pay.

### Mentors are reviewed, not self-serve

Every mentor profile goes through review and a background check before it is
ever shown to a student — a mentor is never live the moment someone submits
a profile (`docs/MISSION.md`, standing decision, 12 Aug 2026). If a student
asks how we verify mentors, the honest answer is: every mentor is manually
reviewed and background-checked before going live, and their profile shows
verifiable proof (LinkedIn, CAT percentile, college) students can check
themselves. The exact steps of that background check are not documented for
you to recite — if a student pushes for specifics beyond this, escalate.

### Key terminology

| Term | Meaning |
|---|---|
| **Log / logging a day** | The student recording what they actually studied that day — the single most important action in the product |
| **Plan** | The system-generated "what to study today," which adapts based on logs |
| **Buddy** | The paid, matched IIM mentor |
| **Mock** | A full-length practice test the student takes and logs a debrief on |
| **Streak** | Consecutive days logged — a habit signal, not a score |
| **VARC / DILR / QA** | The three CAT exam sections: Verbal Ability & Reading Comprehension, Data Interpretation & Logical Reasoning, Quantitative Ability |
| **Percentile** | How the student ranks against everyone who takes CAT that year — "out of 100 people, how many are behind you" |

### Every feature answers "why does this matter to the student," never a feature dump

Correct pattern — pain first, product second:

| Student's real pain | What they do today without us | Why it fails | The CareerRai line |
|---|---|---|---|
| "Aaj kya padhun?" | Opens YouTube, browses | Hours lost, nothing structured learned | "Roz subah 3 kaam ready milte hain — sochna nahi padta." |
| "Akela hoon, koi check nahi karta" | Studies alone, quits around day 10 | No accountability, no correction | "Ek IIM senior — sirf aapka. Coaching nahi." |
| "Syllabus khatam nahi hoga" | Studies randomly, no sense of pace | Panic close to the exam | "App batati hai: kab tak khatam hoga, roz update ke saath." |

Never open with *"humara feature yeh hai…"* — always open with the problem
the student already has.

---

## MODULE 03 — End-to-End Process

```
   LEAD / STUDENT
        │
        ▼
   FIRST CONTACT
        │
        ▼
   QUALIFICATION            ← who are they, where are they in prep,
        │                     what's actually stopping them
        ▼
   PRODUCT EXPLANATION      ← pain first, product second (Module 02)
        │
        ▼
   QUESTION / OBJECTION     ← handled at Module 04 (price objection has
        │                     its own script — never argued generically)
        ▼
   CONVERSION               ← current approved price only, never invented
        │
        ▼
   WHATSAPP / NEXT STEP     ← link sent, concrete next action confirmed
        │
        ▼
   FOLLOW-UP
        │
        ▼
   CRM / RECORD             ← every interaction recorded, unresolved
        │                     cases flagged
        ▼
   ESCALATION (IF REQUIRED) ← payment / refund / technical / buddy /
                                policy exception / unknown answer
```

**Only the stages above are used** — this manual does not invent additional
process steps beyond what the source material supports.

### For every interaction

**Understand → Respond → Record → Escalate if required.**

### Daily workflow

**Before starting work:**
- Check for process updates and pricing changes.
- Check important announcements.
- Confirm no pending escalations are waiting on you.

**During work:** the Understand → Respond → Record → Escalate loop, every
single interaction.

**After work:**
- Complete required CRM/record entries.
- Flag unresolved cases.
- Flag any question you got repeatedly (it may be a training or
  documentation gap, not a you-problem).
- Flag anything that felt outdated or caused confusion.

### Escalation Matrix

The last stage of the process, made explicit. "Can Pooja solve this?" is a
yes/no gate — there is no "solve it partially and hope."

| Situation | Pooja can solve? | Action |
|---|---|---|
| Standard FAQ (Module 05) | **Yes** | Answer directly, using the approved answer |
| Standard pricing (once Appendix A, Conflict 1 is resolved) | **Yes** | Quote the current approved price only |
| Technical issue covered in the FAQ | **Yes** | Follow the documented answer |
| Unknown technical issue | **No** | Escalate — Founder/team confirmation required ⚑ |
| Refund exception (outside the 20-day rule, or a genuine CareerRai-side failure) | **No** | Escalate — Founder/team confirmation required ⚑ |
| Pricing exception / discount request | **No** | Escalate — Founder/team confirmation required ⚑ |
| Policy conflict or contradiction the student points out | **No** | Escalate — Founder/team confirmation required ⚑ |
| Payment deducted, account/status wrong | **No** | Escalate immediately — this is a real payment-system mismatch |
| Buddy assignment overdue (past 24h) or a requested Buddy switch | **No** | Escalate — Founder/team confirmation required ⚑ |
| Angry or upset student | **No**, not alone | De-escalate with empathy (Module 08), then escalate the underlying issue |

⚑ *No source document names a specific escalation owner beyond the founder
generally — see "Role-specific information required" at the top of this
manual. Until named, every "No" row above routes to the founder.*

---

## MODULE 04 — Script Library

Structure is fixed. Language is flexible — react naturally to what the
student actually says, but never drift from the structure or the constraints
below. For every script: **WHEN TO USE / WHY IT EXISTS / EXACT LANGUAGE /
WHAT NOT TO SAY.**

### Conversation principles (apply to every script below)

1. Listen first — don't answer a question the student hasn't asked.
2. Don't overload — give the smallest useful answer.
3. Ask one question at a time.
4. Don't argue if a student disagrees — understand why first.
5. Don't manufacture urgency.
6. Don't promise outcomes.
7. Don't guess.
8. Use the student's own words back to them.

### 1. Opening

**WHEN:** The very first message or the first 10 seconds of a call.
**WHY IT EXISTS:** The first line decides whether the student stays open or
goes defensive. It must show you already know something real about them, not
a generic pitch.
**LANGUAGE (adapt to what you actually know about this student):**
> "Hi! Main Pooja, CareerRai se. Aapne [signup / checkout / buddy page] tak
> dekha tha — bas jaanna chahti thi, kya cheez atki ya koi sawal hai?"

**WHAT NOT TO SAY:** A scripted "Hi, hope you're doing well!" with no
reference to anything real about this specific student. Genericness is the
opposite of the goal.

### 2. Context (setting up the conversation)

**WHEN:** Right after opening, before qualification.
**WHY IT EXISTS:** Tells the student this is a real conversation about them,
not a sales call.
**LANGUAGE:**
> "Main sirf 2 minute lena chahti hoon — samajhna chahti hoon aap CAT prep
> mein kahan ho, phir bataungi kya help ho sakti hai."

**WHAT NOT TO SAY:** Anything that jumps straight to price or features
before understanding the student.

### 3. Qualification

**WHEN:** After context is set.
**WHY IT EXISTS:** You cannot give a relevant answer to someone whose actual
situation you don't know. A student who's studied 12 hours/day for a week and
logged nothing has a completely different problem than one who hasn't
started.
**LANGUAGE:**
> "Abhi tak preparation kaisi chal rahi hai? Roz padh rahe ho ya break-break
> mein?"
> "Sabse zyada mushkil kya lag raha hai — plan banane mein, consistency mein,
> ya kisi specific section mein?"

**WHAT NOT TO SAY:** Multiple questions stacked in one message. One question
at a time.

### 4. Product explanation

**WHEN:** Once you understand their actual problem.
**WHY IT EXISTS:** Explains the product against the student's own stated
pain — never as a generic feature list.
**LANGUAGE (pattern, fill in the real pain from qualification):**
> "Jo aapne bataya — [restate their actual problem] — CareerRai isi ke liye
> bana hai. Roz aapko exact pata hota hai kya padhna hai, based on aapki
> asli progress. Aur agar chaho, ek real IIM senior aapki prep dekh ke
> specific feedback deta hai — sirf 'IIM se hai' nahi, balki aapki actual
> weak areas pe."

**WHAT NOT TO SAY:** A list of every feature in the product. Answer the
question they asked or the problem they named — nothing more.

### 5. Common questions

Handled in full in **Module 05 — FAQ Library.** Use the FAQ pattern:
**ANSWER → CLARIFY → NEXT STEP.** Example:

> Student: "Buddy kaise milega?"
> "Payment aur activation ke baad Buddy assignment hota hai — current
> approved process ke hisaab se 24 hours ke andar."
> "Aap chaho toh main exact next step bata deti hoon."

Never stack five unrelated features onto a direct question.

### 6. Objection handling (general pattern)

**WHEN:** A student pushes back or expresses doubt.
**WHY IT EXISTS:** The instinct to argue makes it worse. Understanding the
real concern behind the words is the actual skill.
**LANGUAGE:**
> Student: "Mujhe nahi lagta isse meri preparation improve hogi."
> "Samajh sakti hoon — bahut log yehi sochte hain shuru mein. Aapko sabse
> zyada kis cheez ka doubt hai — ki plan kaam karega, ya ki aap follow
> karenge?"

**WHAT NOT TO SAY:** "No no, it definitely works, trust me" — that's
arguing, not understanding. Never counter a doubt with a guarantee you can't
back.

### 7. Price discussion

**WHEN:** Only after the student has heard what changes for them — never as
the opening line.
**WHY IT EXISTS:** Price landing before value reads as a sales pitch; price
landing after a real, specific "what changes for you" reads as an honest
offer.
**LANGUAGE:**
> "1 mahine ke andar aapko roz pata hoga kya padhna hai, aur ek real senior
> aapki prep dekhega. Uske baad current pricing hai [state the currently
> approved price from **Module 06** — do not recite from memory]."

**WHAT NOT TO SAY:** Any discount, "today only" offer, special price, or
refund period you have not verified is currently approved. See Module 06,
§"The Price Rule," which is absolute.

### 8. Closing

**WHEN:** Student has heard the value and the price and is ready to move.
**WHY IT EXISTS:** A close should always land on one concrete next action.
**LANGUAGE:**
> "Toh main abhi aapko payment link bhej deti hoon — activate hote hi
> Buddy assignment start ho jayega, 24 hours ke andar."

**WHAT NOT TO SAY:** Vague endings like "Let me know if interested" with no
concrete next step offered.

### 9. Follow-up

**WHEN:** A student who engaged but didn't convert, hasn't logged in a
while, or asked to think about it.
**WHY IT EXISTS:** A follow-up should never feel like a repeated pitch — it
should reference something real and specific about the student.
**LANGUAGE (for someone who's gone quiet):**
> "Koi bechne nahi aayi — bas ye poochne ki prep chhoot toh nahi gayi?"

**LANGUAGE (for someone who studies daily but hasn't converted):**
> "Aap roz log kar rahe ho — ye 90% log nahi karte. Bas ek cheez missing hai
> abhi — poochun kya?"

**WHAT NOT TO SAY:** A generic "Just checking in!" with no reference to what
the student has actually done or not done. (Note: these two examples come
from real production behaviour patterns identified in the founder-approved
"Design v2" training draft — see Module 08 for the full archetype table.)

### 10. WhatsApp templates

**WHEN:** Any written follow-up outside a live call.
**WHY IT EXISTS:** Consistency and a record.
**LANGUAGE (pattern — link/price/date must always be pulled fresh from the
current approved source, never memory):**
> "Hi [Name], jaisa baat hui — yeh raha aapka link: [link]. Koi bhi sawal ho,
> bas yahi reply kar dena. — Pooja, CareerRai"

**WHAT NOT TO SAY:** Anything with an old price, an old link, or a promise
not covered in Module 06.

### 11. Escalation language

**WHEN:** Any of the situations in **Module 03's Escalation Matrix.**
**WHY IT EXISTS:** A confident wrong answer is worse than an honest "let me
check."
**LANGUAGE:**
> "Achha sawal — main exact confirm karke aapko aaj hi bata deti hoon."

**WHAT NOT TO SAY:** A guess dressed as certainty — e.g. *"Probably AI
automatically decide karta hai"* for a question you don't actually know the
answer to.

---

## MODULE 05 — FAQ Library

Pattern for every FAQ: **Question → Approved answer → If the student asks
further → When to escalate.**

### A. Product FAQs

**Q: CareerRai kya hai?**
A: "CareerRai ek CAT preparation platform hai jo execution pe focus karta
hai — roz aapko pata hota hai kya padhna hai, based on aapki asli progress."
If further: explain the Plan → Study → Log → Plan adjusts loop (Module 02).
Escalate: never — this is core knowledge you should always have.

**Q: Coaching hai?**
A: "Nahi, hum content/lectures nahi dete — CareerRai execution, tracking
aur personalised guidance pe focus karta hai." If further: explain the
coaching-vs-CareerRai distinction (Module 01). Escalate: never.

**Q: Lectures/study material milta hai?**
A: Not verified as a current product offering — **do not claim this exists
or doesn't exist without checking.** Escalate if asked directly.

**Q: Mocks milte hain?**
A: The product tracks mock attempts and debriefs as part of the student's
data (Module 02's "Mock" definition). Whether CareerRai *provides* the mock
tests themselves, versus tracking mocks the student takes elsewhere, is not
confirmed in verified source material — escalate before stating either way.

**Q: Free kya hai, paid kya hai?**
A: "Study plan — roz ka 'kya padhna hai' — free hai. Buddy, jo ek real IIM
mentor hai jo aapki prep dekh ke feedback deta hai, paid hai." Escalate:
never — this is the core Free/Paid line and must be exact.

### B. Buddy FAQs

**Q: Buddy kaun hota hai?**
A: "Ek verified, background-checked IIM student ya alumnus, jo aapki asli
prep data dekh ke specific feedback deta hai." If further: point to their
profile — real name, college, CAT percentile, LinkedIn are all shown and
verifiable.

**Q: Buddy kaise assign hota hai?**
A: "Payment/activation ke baad, 24 hours ke andar." Escalate: if a student
reports it's been longer than 24 hours and no buddy is assigned — this is a
real SLA breach and needs to be flagged, not explained away.

**Q: Buddy kya karta hai, kitni baar milta hai?**
A: "Live weekly session, plus daily chat guidance." Escalate: any question
about exact session length or format beyond this.

**Q: Buddy change kar sakte hain?**
A: Not documented in verified source material — escalate, do not guess or
promise either way.

### C. Pricing FAQs

**Q: Kitna cost hai?**
A: State the **current approved price from Module 06 only** — never from
memory. **See Appendix A: this is a live, unresolved conflict in this
manual's own source material and must be confirmed with the founder before
Pooja quotes a single number as "the" price.**

**Q: Monthly hai ya ek baar ka payment?**
A: "Ek baar ka payment hai — koi auto-debit nahi, koi recurring mandate
nahi. Term khatam hone ke baad simply mentorship ruk jaata hai, data safe
rehta hai." This is confirmed, code-verified, and true across every plan.

**Q: Refund hai?**
A: See Module 06's refund section — quote the specific 20-day condition, not
a vague "value-based" description.

**Q: Cancel kar sakte hain?**
A: "Auto-debit hai hi nahi, toh cancel karne ki zaroorat nahi padti — term
khatam hone pe simply nahi renew hota, jab tak aap khud dobara na len."

**Q: Ek baar ka / single session mil sakta hai? Poora plan nahi lena.**
A: "Abhi sirf full plan hai — ek baar ka single session abhi available nahi
hai." Nothing more. A per-session option is planned but **not live** (Module
06, "Coming soon") — mentioning it as available, or as "aa raha hai jaldi"
to hold a hesitant student, is inventing a product. Escalate: if the student
specifically wants only a one-off session, log it and flag it — that demand
signal is exactly what the founder needs before launching the ₹299 option.

**Q (for when ₹299 goes live): Session accha na laga toh refund milega?**
A: "Refund guarantee subscription pe hai — single session pe nahi." Say it
plainly. Never soften it into "dekh lenge" or an implied refund — the
guarantee covers the subscription only (founder, 13 Aug 2026).

### D. Product usage FAQs

**Q: Daily log kya hai?**
A: "Aapne aaj kya padha, uska real record — chahe kuch na padha ho, wo bhi
likhna helpful hai, kyunki system usi se kal ka plan banata hai."

**Q: Plan kaise banta hai?**
A: "Aapki asli progress, weak areas, aur exam tak bache din — inse system
roz ka plan banata hai." Escalate: exact algorithm/ranking logic questions.

**Q: Agar task complete nahi hua toh?**
A: "Bas honestly log kar dena — system usi se kal ka plan adjust karega.
Yeh koi punishment nahi hai." (Directly reflects the real product design —
even a null day is useful data.)

**Q: Notifications nahi aa rahe / koi technical issue?**
A: Escalate as a technical issue (§ Module 03 escalation stage) — do not
attempt to diagnose or guess a fix.

### E. Trust FAQs

**Q: Buddy genuine hai?**
A: "Har mentor review aur background check ke baad hi live hota hai — aur
unka profile (college, CAT percentile, LinkedIn) verify karne ke liye khud
dekha ja sakta hai."

**Q: Data safe hai?**
A: "Haan — hum data kabhi bechte nahi. Wo sirf aapki khud ki prep behtar
karne ke liye use hota hai." (This is a permanent company policy, not a
current preference — `docs/MISSION.md`.)

**Q: Isse actual benefit kya hai?**
A: Return to Module 02's pain-first framing for whatever this specific
student's actual stated problem was — never a generic "it helps you a lot."

### F. Refund FAQs

See Module 06 in full — every refund FAQ routes there.

### G. Process FAQs

**Q: Aap se dubara contact kaise ho sakta hai?**
A: WhatsApp (per whatever number/channel is currently live) or email —
confirm the current live channel before quoting one; do not assume.

### H. Escalation FAQs

Any of: payment deducted but account/status wrong · refund eligibility
uncertain · a technical issue the FAQ doesn't solve · buddy assignment or
switching · a requested policy exception · any answer not in this manual.
**All of these escalate — none of these get an improvised answer.**

---

## MODULE 06 — Price & Policy Centre

> **Read Appendix A before quoting any price to a student.** This section
> states what the codebase actually enforces today; it also states where
> that disagrees with the founder's own new draft manual.

### Current price (code-verified, `src/lib/plans.ts`, live in production)

| Plan | Price | Duration | Positioning in the live product |
|---|---|---|---|
| **Till CAT** | **₹2,999** | 4 months | **The hero / recommended plan.** One payment, buddy all the way to exam day. |
| 6 Months | ₹4,499 | 6 months | Kept for existing subscribers and admin use — **not actively offered** to new students in the live flow. |
| 3 Months | ₹2,499 | 3 months | Same — kept, not actively offered. |
| 1 Month | ₹999 | 1 month | **The fallback** for students who specifically insist on month-to-month — not the lead price. |

**All plans are one-time payments. There is no auto-debit, no recurring
mandate, ever** — this is a hard product rule, not a policy choice
(`docs/OS/TRUST-OS.md` §2, rule 3 & §4).

**⚠ See Appendix A, Conflict 1** — the founder's own new draft manual states
"Monthly price ₹999/month" as the primary documented price, without
mentioning Till CAT. This must be resolved by the founder before Pooja is
told which number to lead with.

### Refund policy (code-verified, `src/app/refunds/page.tsx`, last updated
25 Jul 2026)

- **The promise:** full refund if CareerRai hasn't helped in the student's
  **first month** — on **one condition**: the student must have **logged at
  least 20 study days** within that first month.
- **How to request:** in-app, Profile → Refund guarantee (shows the
  student's own logged-day count and lets them request in one tap), or by
  emailing **business@careerrai.com** from the registered email.
- **Timeline:** reviewed within **2–3 working days**; approved refunds reach
  the original payment method (via Razorpay) within **5–7 working days**.
- **When a refund does NOT apply:** after the first month has ended; if
  fewer than 20 study days were logged; if the account was terminated for
  abuse. If the mentor was unavailable or something failed on CareerRai's
  side, that is handled individually — the 20-day rule is never used to
  refuse a genuine failure by us.
- **Failed/duplicate payments** are always refunded in full, unconditionally
  — this is separate from the 20-day guarantee.
- Refunds are **hand-processed by a human**, never auto-fired
  (`docs/OS/TRUST-OS.md` §2, rule 6) — so never promise an instant refund.

**⚠ See Appendix A, Conflict 4** — the founder's own new draft describes
this only as "first-month value-based refund policy," which is vague enough
to be misread as a subjective/discretionary decision. The real policy is a
specific, objective 20-day threshold. Pooja should be trained on the exact
number, not the vague paraphrase.

> **🚨 See Appendix A, Conflict 7 — do not quote "21 days" to any student.**
> The founder said "21 day login after subscription" on 13 Aug; the live
> code and the public `/refunds` page both say **20 logged study days**.
> Until this is settled, **Pooja quotes 20** — because 20 is what the
> student can read on our own public page, and quoting the higher number
> would wrongly tell a qualifying student they don't qualify.

### Payment process

Razorpay only. Price is resolved and enforced **server-side** — the price a
student sees in the app is always the price actually charged; there is no
path for a manually offered different number to actually take effect
(`docs/OS/TRUST-OS.md` §4). This means: **Pooja cannot manually apply a
discount even if she wanted to** — the payment system will simply charge the
real price regardless of what was promised. Any discount conversation must
go through an approved coupon/scholarship mechanism, not a verbal promise.

### Assignment timeline

Buddy is assigned **within 24 hours** of activation/payment. If a student
reports it has been longer with no assignment, this is a real SLA breach —
escalate per the Escalation Matrix (Module 03), do not reassure and wait.

### Cancellation

There is no auto-debit and no recurring mandate on any plan — so there is
nothing to "cancel" in the subscription-cancellation sense. When a paid term
ends, mentorship stops automatically; the student's data (streak, mocks,
debriefs, plan) is fully preserved and stays free to use
(`docs/OS/TRUST-OS.md` §2, rule 7 — downgrade never deletes). A student can
buy another term whenever they want their mentor back.

### Discounts

**No discount is currently officially approved for Pooja to apply.** If a
student asks for one, use Module 04 §7's price script and, if pressed
further, the Module 08 "Request for discount" example. Any future approved
discount must be added here with a Module 11 Change Log entry — never
applied from memory or verbal founder approval alone.

### 🕓 Coming soon — NOT sellable yet

| Product | Price | Who can buy | Refundable? | Status |
|---|---|---|---|---|
| **Per-session with a buddy** | **₹299 / session** | **Any free student** — no subscription needed | **No.** The money-back guarantee covers the subscription only | **Planned, not yet live** (founder, 13 Aug 2026) |

**What Pooja does with this today: nothing.** Do not quote it, do not offer
it, do not hint that it's coming to close a hesitant student. It is recorded
here so that when a student asks *"koi ek baar ka session mil sakta hai?"*
Pooja knows the honest current answer is **"abhi sirf full plan hai"** — not
a guess in either direction.

**It becomes sellable only when** it appears in the "Current price" table
above with a Module 11 Change Log row. Until that happens, treating it as
available is the same category of error as inventing a discount.

**When it does go live, two rules are already settled** (founder, 13 Aug
2026) and must be said plainly rather than glossed over:

1. **Any free student can buy one** — it is not gated behind a subscription.
   This makes it the cheapest real entry point into the product, so it will
   attract exactly the students who said "abhi nahi" to the full plan.
2. **It is not refundable.** The money-back guarantee applies to the
   *subscription* only. If a student asks "agar session accha na laga toh?",
   the honest answer is that the guarantee does not cover a one-off session —
   never soften this into an implied refund. Saying otherwise creates a
   promise CareerRai has not made.

### ⛔ NEVER SAY — the absolute list

> **The prominent rule this whole module exists to enforce: if the
> price or policy is uncertain, do not guess. Check the current approved
> source (this module), and if it still isn't covered, escalate.**

| Never say / promise | Because |
|---|---|
| A percentile-improvement guarantee | Prohibited outright — Module 01, Module 07 |
| An IIM-admission guarantee | Prohibited outright — Module 01, Module 07 |
| Fake scarcity ("sirf 2 seats bachi hain," "aaj hi offer") | No manufactured urgency — Module 04 §9 |
| An unauthorised discount | None is currently approved — see "Discounts" above |
| The ₹299 per-session option, in any form | Planned, **not live** — offering or hinting at it is inventing a product |
| An invented feature | Only describe what's verified in Module 02/07 |
| Invented Buddy availability | Assignment is a real 24h SLA, not a promise to improvise around |
| A vague or invented refund policy | Use the exact 20-day condition above, never "case by case" |
| "Better than coaching" as an unsupported claim | Module 01 — correct framing is *different from*, not *better than* |

---

## MODULE 07 — Knowledge Base

### Master facts (code-verified, current as of 13 Aug 2026)

| Fact | Value | Source |
|---|---|---|
| CAT 2026 exam date | 29 November 2026 (last Sunday of November) | `src/lib/cat-cycle.ts` |
| CAT exam sections | VARC, DILR, QA | Standard CAT structure |
| Buddy assignment SLA | Within 24 hours of activation | `src/lib/premium.ts`; `docs/OS/TRUST-OS.md` §5 |
| Unanswered-message escalation | 48 hours, auto-pings admin | `docs/OS/TRUST-OS.md` §5 |
| Session cadence | Live weekly session + daily chat guidance | `src/app/api/payments/create-order/route.ts`, `src/components/unlock-buddy-sheet.tsx` |
| Auto-debit | Never — one-time payments only | `docs/OS/TRUST-OS.md` §2, §4 |
| CAT Readiness Test | **Does not exist.** Confirmed by founder, 13 Aug 2026 — *"there is nothing like readiness test as of now."* Never mention it. | Founder, 13 Aug 2026; retired in code 20 Jul 2026 (`src/app/cat-readiness/page.tsx` now redirects to `/start`) |
| Per-session buddy option (₹299) | **Planned, not live.** Not sellable — see Module 06, "Coming soon" | Founder, 13 Aug 2026 |
| Data sale | Never — permanent policy | `docs/MISSION.md` |
| Refund condition | 20+ logged study days in first month | `src/app/refunds/page.tsx` |

### Approved claims

- "A real, verified, background-checked IIM mentor."
- "Your buddy reviews your actual preparation, not a generic script."
- "No auto-debit — one-time payment, ever."
- "Full refund if you've logged 20+ study days in your first month and it
  hasn't helped."
- "Buddy assigned within 24 hours of activation."

### Prohibited claims — never, under any circumstance

- Guaranteed percentile improvement.
- Guaranteed IIM admission.
- "Better than coaching" as an unsupported comparison.
- Any invented discount, "today only" offer, or special refund period.
- Any invented statistic about other students ("X students improved by Y").
- Any testimonial or quote not verified as something a real student actually
  said (`docs/OS/TRUST-OS.md` §2 rule 1, §7 — this rule binds every surface,
  human or AI).
- A technical answer you're not certain of.
- A promise of specific Buddy availability you haven't confirmed.

---

## MODULE 08 — Real Examples

### Good conversation

> Student: "Bas dekh raha tha, abhi decide nahi kiya."
>
> Pooja: "Bilkul, samajh sakti hoon. Ek cheez poochun — abhi tak kya sabse
> zyada confuse kar raha hai, plan follow karna ya consistency banaye
> rakhna?"
>
> *(Listens. Responds to the actual answer. Does not immediately push price
> or features.)*

**Why this works:** it asks one real question, uses the student's own
framing ("dekh raha tha"), and doesn't treat silence as an objection to be
overcome by force.

### Bad conversation (what NOT to do)

> Student: "Bas dekh raha tha."
>
> Wrong reply: "Hi! CareerRai India ka best CAT prep platform hai — daily
> plan, mock analysis, IIM mentor sab kuch milta hai sirf ₹999 mein, aaj hi
> offer hai!"

**Why this fails:** feature-dumps instead of listening, uses an unverified
superlative claim ("best CAT prep platform"), and invents urgency ("aaj hi
offer hai") that Module 06 explicitly forbids.

### A correct escalation

> Student: "Maine payment kar diya lekin app mein abhi bhi 'upgrade' dikha
> raha hai."
>
> Pooja: "Yeh definitely check karne wali baat hai — main abhi flag kar
> deti hoon aur aaj hi confirm karke aapko batati hoon."
>
> *(Escalates immediately as a payment issue — Module 03's escalation
> stage. Does not guess a fix or tell the student to "try logging out and
> back in.")*

### The full scenario set — GOOD vs BAD, one pattern each

**Price**
- Student: "Kitna cost hai?"
- GOOD: States the current approved price only (Module 06), then asks what
  matters most to the student before adding anything else. *Why correct:*
  answers exactly what was asked, nothing invented.
- BAD: "Bohot affordable hai, sirf ₹999 mein sab kuch milta hai, abhi le
  lo!" *Why wrong:* editorializes ("bohot affordable"), doesn't confirm
  which plan, manufactures urgency ("abhi le lo").

**Refund**
- Student: "Refund milta hai kya agar kaam na aaye?"
- GOOD: States the exact 20-day condition and timeline (Module 06). *Why
  correct:* precise, not vague, sets real expectations.
- BAD: "Haan bilkul, koi bhi time refund mil jayega." *Why wrong:* invents
  an unconditional, un-timed refund that doesn't exist.

**Product confusion**
- Student: "Yeh coaching hai ya app hai, samajh nahi aaya."
- GOOD: Uses Module 01's exact distinction — coaching teaches content,
  CareerRai is execution + tracking + a real mentor. *Why correct:* resolves
  the actual confusion in one clear line.
- BAD: Lists ten features hoping one lands. *Why wrong:* more confusion, not
  less — Module 01 exists to prevent exactly this reflex.

**Student doubt**
- Student: "Mujhe nahi lagta isse meri preparation improve hogi."
- GOOD: See Module 08's "Good conversation" above — asks what specifically
  is in doubt, doesn't argue.
- BAD: "Trust me it definitely works" — argues instead of understanding.

**Technical issue**
- Student: "Notifications aa hi nahi rahe."
- GOOD: "Yeh technical cheez hai — main flag kar deti hoon, jaldi update
  dungi." Escalates per the Matrix above.
- BAD: Guesses a fix ("try reinstalling the app") without knowing if that's
  actually the cause.

**Angry student**
- Student: "Ye bakwaas hai, paisa waste ho gaya, kuch nahi ho raha."
- GOOD: "Samajh sakti hoon aap frustrated hain — bataiye exactly kya nahi
  ho raha, main abhi dekhti hoon." Absorbs the tone, doesn't get defensive,
  moves straight to understanding the real issue, then escalates if it's
  outside the FAQ.
- BAD: Matching the tone, or a defensive "Actually humne bola tha ki…" *Why
  wrong:* an upset student needs to be heard before anything else; arguing
  first makes CareerRai the opponent instead of the fix.

**"Send me details"**
- Student: "Mujhe details bhej do, main dekh leta hoon."
- GOOD: Sends the accurate current details (Module 06 pricing, Module 04 §10
  WhatsApp template) *and*
  asks one grounding question first if possible — e.g. what they're most
  unsure about — so the follow-up isn't generic.
- BAD: Sends a wall of every feature and price plan with no context. *Why
  wrong:* "send details" is often a polite exit, not a real request — a
  generic dump doesn't earn a second look.

**"I'll think about it"**
- Student: "Main soch ke batata hoon."
- GOOD: "Bilkul, jaldi mein decide karne ki zaroorat nahi. Ek cheez poochun
  — abhi sabse zyada kis baat pe confusion hai?" *Why correct:* respects the
  answer, tries once to surface the real hesitation without pushing.
- BAD: Immediately offering an unapproved discount to force a decision. *Why
  wrong:* Module 06's Price Rule forbids inventing offers, and it also
  reads as pressure, which contradicts "don't manufacture urgency."

**"Parents se discuss karunga"**
- Student: "Parents se baat karke batata hoon."
- GOOD: "Bilkul sahi approach hai — CAT jaisa decision family ke saath hi
  lena chahiye. Chahen toh main unhe bhi basic details bhej sakti hoon."
  *Why correct:* validates rather than treats it as a stall tactic.
- BAD: Any attempt to rush past this or imply it's unnecessary. *Why
  wrong:* dismissive, and for many CAT households this is a genuine and
  reasonable step.

**Unknown question**
- Student: "Aapka Buddy allocation algorithm exactly kaise decide karta
  hai?"
- GOOD: "Iska exact internal process main confirm karke bataungi." Escalate.
- BAD: A confident guess. This is the single most-repeated failure mode this
  manual exists to prevent.

**Request for discount**
- Student: "Koi discount mil sakta hai?"
- GOOD: "Abhi koi official discount approved nahi hai jo main de sakti hoon
  — current price yeh hai [Module 06]." Never implies one might appear if
  they push.
- BAD: Inventing a number, or hinting "shayad ho jaaye agar aap abhi le
  lete hain" — this is an unauthorised discount by implication, forbidden
  exactly like a stated one.

---

## MODULE 09 — Training Curriculum

The progression is what matters, not that it's exactly five days: **Learn →
Observe → Practice → Test → Certify.** If the founder wants this compressed
or extended, keep the progression intact and just resize the days.

| Day | Focus | What happens | Modules used |
|---|---|---|---|
| **Day 1** | CareerRai + product | Read Module 01–02. Understand the mission, the four surfaces, the product loop, the Study-plan/Buddy distinction. | 01, 02, 07 |
| **Day 2** | Process | Walk the full lead-to-escalation flow. Understand the Escalation Matrix cold — know which situations are hers to solve and which aren't. | 03 |
| **Day 3** | Scripts + FAQs | Read the full Script Library and FAQ Library. Practice saying each script out loud once. | 04, 05, 06 |
| **Day 4** | Role-play | Live role-play of all 10 scenarios in Module 08 (the five certification scenarios plus the five additional ones: angry student, "send me details," "I'll think," "parents se discuss," discount request). | 08 |
| **Day 5** | Independent handling + certification | Sit the certification test (Module 10). Once certified, the first ~5 real interactions are observed before fully independent work begins. | 10 |

You are not marked trained because you read the manual. You are marked
trained when you pass certification **and** can perform the process
correctly under observation — reading the manual is Stage 1 of 4, not the
whole thing:

1. **Learn** — understand CareerRai (Modules 01–02, 07).
2. **Observe** — watch/read real examples of good and bad interactions
   (Module 08).
3. **Practice** — role-play the scenarios (Module 08, Day 4 above).
4. **Certify** — pass Module 10 without looking at the manual, then handle
   real interactions under observation.

---

## MODULE 10 — Certification

Certification tests seven things, not just recall: product understanding,
process understanding, FAQ handling, pricing accuracy, escalation judgement,
communication quality, and the ability to handle a question this manual
doesn't cover. **Certify only if she can perform the process correctly — not
because she finished reading.**

### Certification test — 16 questions, answer without help

**Product**
1. What is CareerRai?
2. What problem does it solve?
3. What is CareerRai *not*?
4. What is the difference between coaching and CareerRai?

**Buddy**
5. What is a Buddy?
6. What does the Buddy actually do?
7. How is the Buddy layer different from generic content?

**Pricing**
8. What is the current approved price? *(Answer only after Appendix A,
   Conflict 1 is resolved by the founder — see note below.)*
9. What is the current refund policy?
10. What should you do if you're unsure about pricing?

**Process**
11. What happens after a student signs up?
12. What happens when a student asks a question outside the FAQ?
13. When should you escalate?

**Trust**
14. Can we promise percentile improvement?
15. Can we promise IIM admission?
16. Can we invent a discount to close a student?

**The correct answer to 14, 15, and 16 is No — always.**

> **Note on Q8:** this manual cannot certify a trainee on "the current
> approved price" until the founder resolves Appendix A, Conflict 1. Do not
> run certification on pricing until that's settled — everything else can
> proceed now.

### Role-play module — practise at least these five

**Scenario 1 — Interested student**
> "Achha, CareerRai exactly kya karta hai?"
Explain the product simply, without dumping every feature (Module 02).

**Scenario 2 — Price question**
> "Kitna cost hai?"
Give the current approved price only — no invented offers (Module 06).

**Scenario 3 — Refund question**
> "Agar mujhe value nahi mili toh?"
Use the exact, current refund policy — the 20-day condition, not a vague
paraphrase (Module 06).

**Scenario 4 — Doubt / objection**
> "Mujhe nahi lagta isse meri preparation improve hogi."
Don't argue. Understand the real concern, respond with approved positioning
(Module 04, §6).

**Scenario 5 — Unknown question**
> "Aapka Buddy allocation algorithm exactly kaise decide karta hai?"
If the KB doesn't answer it: *"Iska exact internal process main confirm
karke bataungi."* **Never:** *"Probably AI automatically decide karta hai"*
— a guess dressed as certainty is exactly what this manual exists to
prevent.

### Passing this certification is not the finish line

Once certified, the founder's own note applies: the first ~5 real calls
should be observed (listened to, muted, or reviewed after) before fully
independent work begins.

---

## MODULE 11 — Change Log

The rule this module exists to enforce: **an old fact must never silently
compete with the current one.** When a price, policy, or process changes,
the old entry is marked **SUPERSEDED** right in this table — never deleted,
never left ambiguous next to the new value.

| Date | What changed | Old rule | New rule | Reason | Approved by |
|---|---|---|---|---|---|
| 13 Aug 2026 | Manual created (v1) | — | This document | Founder requested a centralised training/operating system for Pooja, replacing an ad hoc document approach | Pending founder review |
| 13 Aug 2026 | CAT Readiness Test removed from product knowledge | ~~"Readiness Test, 35 questions, free"~~ **SUPERSEDED** | Does not exist — never mention it | Founder: *"there is nothing like readiness test as of now"* | Founder |
| 13 Aug 2026 | Per-session buddy option recorded as planned | ~~"Secondary offering: single advisory session" (implied current)~~ **SUPERSEDED** | ₹299/session — planned, **not sellable**; do not quote or hint | Founder: *"we are also soon gonna introduce 299 per session as well from buddies"* | Founder |
| 13 Aug 2026 | ₹299 session — eligibility settled | (open question) | Any free student may buy; no subscription required | Founder: *"any free students"* | Founder |
| 13 Aug 2026 | ₹299 session — refundability settled | (open question) | Not refundable; guarantee covers the subscription only | Founder: *"refund for only subscription"* | Founder |
| 13 Aug 2026 | Refund threshold — **conflict opened, NOT applied** | Live: 20 logged study days, from signup | Founder stated "21 day login after subscription" — **not written into the manual pending decision** | Three-way mismatch vs live code and the public refunds page; see Appendix A, Conflict 7 | ⚠ Unresolved — awaiting founder |

*Every future entry needs all six fields filled — a change with no reason or
no approver is not a valid update to this manual. When a value is replaced,
add a row here **and** mark the old value SUPERSEDED at its source location
(e.g. Module 06's price table) rather than silently swapping the number.*

---

## APPENDIX A — Source Conflicts Requiring Founder Decision

These are real disagreements found between source documents during
construction of this manual. **None have been silently resolved.** Pooja
should not be certified on any of these facts until the founder picks an
answer.

### Conflict 1 — What is "the" price Pooja should lead with?

- The founder's own new draft manual (13 Aug 2026) lists, under "Core
  Product Information": *"Monthly price | ₹999/month"* as the primary
  documented price — with no mention of any other plan.
- The live, code-verified pricing model (`src/lib/plans.ts`) has **four**
  plans, and explicitly marks **Till CAT (₹2,999, 4 months) as the hero /
  recommended plan** — the code comment states this was a deliberate 24 Jul
  founder decision: *"the buyer's mental unit is 'till CAT,' not 'months'…
  kills the monthly churn decision at the exact moment the runway is
  short."* The ₹999/month plan is explicitly the *fallback* "for those who
  insist," not the lead offer.
- The founder's own already-approved **"Design v2"** training draft
  (11 Aug 2026) independently arrives at the same code-verified framing —
  its call card states *"₹2,999 CAT tak · ₹999/mahina — badlav bolne ke hi
  baad"* with Till CAT clearly primary.
- **The conflict:** two of three source documents (the live code and the
  already-approved Design v2 draft) agree Till CAT (₹2,999) is the lead
  price. The founder's brand-new draft manual states ₹999/month as *the*
  price with no mention of Till CAT. **Decision needed:** should Pooja lead
  with ₹2,999 (Till CAT) as the hero, per the live product and the
  already-approved training draft — or has the pricing strategy changed
  since 24 Jul, and the new draft reflects an intended change not yet made
  in code?

### ✅ Conflict 2 — RESOLVED 13 Aug 2026 — the CAT Readiness Test does not exist

- **Was:** the founder's new draft manual listed *"Readiness Test | 35
  questions | Free"* as current product info, while the codebase showed it
  retired on 20 Jul 2026 (route now redirects to `/start`).
- **Founder ruling, 13 Aug 2026:** *"there is nothing like readiness test as
  of now."*
- **Settled:** removed from Pooja's product knowledge entirely. Module 07
  now records it as non-existent, not merely retired. Pooja never mentions
  it. No further action needed.

### 🕓 Conflict 3 — PARTIALLY RESOLVED 13 Aug 2026 — the per-session product is real but not yet live

- **Was:** the founder's new draft listed a "single advisory session" as a
  current secondary offering, while no such product, SKU, or price existed
  anywhere in the codebase.
- **Founder ruling, 13 Aug 2026:** *"we are also soon gonna introduce 299
  per session as well from buddies."*
- **Settled:** this is the product the draft was referring to. Status is
  **planned, not live** — it is recorded in Module 06 under "Coming soon"
  with an explicit instruction that Pooja must not quote, offer, or hint at
  it until it appears in the live price table. The FAQ now carries the
  honest current answer (*"abhi sirf full plan hai"*).
- **Both blocking questions answered by the founder, 13 Aug 2026:**
  1. **Who can buy?** *"any free students"* — open to any free student, no
     subscription required. Recorded in Module 06.
  2. **Refundable?** *"refund for only subscription"* — no. The money-back
     guarantee covers the subscription only; a one-off session is not
     refundable. Recorded in Module 06 with an explicit instruction not to
     soften it into an implied refund.
- **Only remaining item (low urgency, not blocking):** does the ₹299 session
  sit alongside or count against the free-tier mentor-doors mechanic in
  Conflict 5? Both are "a free student gets some mentor contact," so they
  need to not contradict each other on the day both are live.

### 🚨 Conflict 7 — NEW, 13 Aug 2026 — the refund threshold is stated three different ways

This one is flagged loudest because getting it wrong **denies a real student
a refund they actually qualify for.**

| Source | What it says |
|---|---|
| **Founder, 13 Aug 2026** | *"21 day **login** after **subscription**"* |
| **Public `/refunds` page** (live, student-readable) | **20 logged study days** within the **first month** |
| **Live code** (`src/app/api/student/request-refund/route.ts`) | `REQUIRED_DAYS = 20`, counting rows in `daily_reports` within **30 days of `profiles.created_at`** |

Three separate discrepancies, not one:

1. **21 vs 20.** If Pooja quotes 21 and the real threshold is 20, a student
   sitting on exactly 20 logged days is told they don't qualify — while our
   own public page tells them they do. That is the exact claim-vs-delivery
   gap `docs/OS/TRUST-OS.md` §0 exists to drive to zero.
2. **"login" vs "logged study day."** These are not the same action. The
   code counts `daily_reports` — a student recording what they studied.
   Opening the app 21 times without logging a single study day would satisfy
   a "login" rule and fail the current one. This changes who qualifies, not
   just how many.
3. **"after subscription" vs from signup.** The founder's phrasing measures
   the window from the **subscription date**. The code measures it from
   **account creation** (`profile.created_at + 30 days`). For anyone who
   used the free product before paying, these are wildly different windows.

**Why #3 is more than a wording issue — it is a live defect today.** A
student who signs up free in June, subscribes in August, then logs 25 study
days as a paying member is currently **refused**, because their 30-day
window closed in July, before they ever paid. Conversely a student who
logged 20 days as a free user and subscribed months later qualifies
instantly, having never experienced the paid product at all. The founder's
own phrasing ("after subscription") is the version that actually matches
what the guarantee is *for*.

**Decision needed, three parts:** (a) is the threshold 20 or 21? (b) is it
logged study days or logins? (c) does the window start at subscription or at
signup? Whichever way (a) and (b) go, **(c) looks like a bug worth fixing in
code regardless** — but it changes who gets money back, so it is a founder
decision, not one to make quietly. Until all three are answered, Module 06
instructs Pooja to quote the public page's 20-logged-days version.

### Conflict 4 (informational, not a contradiction) — Refund policy specificity

- Not a true conflict, but flagged because the imprecision itself is a risk:
  the founder's new draft describes the refund policy only as *"first-month
  value-based refund policy,"* which could be read as subjective/case-by-case.
- The live, code-verified policy is a specific, objective threshold: **20+
  logged study days within the first month**, hand-reviewed within 2–3
  working days, refunded within 5–7 working days.
- **No decision needed** — Module 06 already uses the precise, code-verified
  version. Flagged here only so the founder is aware the "value-based"
  phrasing in his own draft is vaguer than what the product actually
  enforces, and could cause Pooja to describe the policy as more
  discretionary than it is.

### Conflict 5 — Should the free-tier "Mentor Doors" mechanic be part of Pooja's knowledge at all?

- Neither the founder's new draft, nor either of the two prior Pooja
  training artifacts, mention that free students can earn **3 messages with
  one matched IIM buddy** by hitting a usage threshold (`docs/OS/TRUST-OS.md`
  §3, `src/lib/mentor-doors.ts`).
- This mechanic is currently **"live-but-dormant"** in the codebase — the
  detection logic runs and records who has qualified, but actual access is
  gated behind an admin flag (`MENTOR_DOORS_ENABLED`) that must be
  explicitly turned on. It is not something free students receive today by
  default.
- **Decision needed:** should Pooja know about this mechanic at all (in
  case a student mentions "the app said I could message a buddy for free"),
  and if so, she must be told explicitly whether it is currently active —
  otherwise she risks confirming or denying something she can't verify. If
  the founder wants Pooja to know about it, this manual can add it to
  Module 02 once its live status is confirmed.

### Conflict 6 — Which training approach should be the primary one — this manual, or the existing Missions/Design v2 approach?

- Two different, already-approved Pooja training documents exist from
  10–11 Aug 2026: **"Pooja ki Training — 5 Missions"** (a conversational,
  day-by-day, psychology-first trainer built around real production leads)
  and **"Pooja Training — Design v2 (Conversion System)"** (a sharper
  version of the same approach, explicitly optimised for conversion rather
  than product knowledge, and built from CareerRai's 15 real hot leads with
  named behavioural archetypes).
- This new manual is structurally different: a comprehensive
  KNOW/DO/SAY/CHECK/ESCALATE reference system, not a day-by-day psychology
  trainer.
- These are not mutually exclusive, but they are not the same document
  either. **This manual currently treats Design v2's real-lead psychology
  (the "3 fears" framework: peeche hoon / akela hoon / paisa nahi hai, and
  the four buyer-archetype patterns) as valid source material and has
  folded small pieces of it into Module 04's follow-up scripts and
  Module 08's examples** — but has not reproduced Design v2 in full here.
- **Decision needed:** should this reference manual **replace** the
  Missions/Design v2 approach, run **alongside** it as a separate
  psychology-practice track, or should the real-lead archetype table and
  full Mission structure from Design v2 be fully absorbed into this
  document's Module 04 and Module 08? Recommendation (not a decision):
  given Design v2 is the only source built from actual production lead
  data, it likely deserves to live inside this manual's Script Library and
  Real Examples modules rather than exist as a separate document — but this
  is explicitly the founder's call.

---

## Appendix B — Quick Reference Card

*Print this. The rest of the manual is what you read once; this is what you
keep in front of you.*

| | |
|---|---|
| **Listen first** | 2 minutes, no features. Find the real concern before responding. |
| **Never lead with price** | Value first, price only after — Module 04 §7. |
| **Price today** | ⚠ See Appendix A, Conflict 1 — not yet settled. Do not quote a number until resolved. |
| **Refund** | Full refund, first month only, if 20+ study days logged. Hand-reviewed, never instant. |
| **Buddy SLA** | Assigned within 24 hours of activation. |
| **Never promise** | Percentile improvement · IIM admission · any invented discount or "today only" offer. |
| **Don't know?** | *"Achha sawal — main exact confirm karke aaj hi bata deti hoon."* Then escalate. Never guess. |
| **Escalate always** | Payment mismatch · refund eligibility · unresolved technical issue · buddy assignment/switch · policy exception · any unknown answer. |
