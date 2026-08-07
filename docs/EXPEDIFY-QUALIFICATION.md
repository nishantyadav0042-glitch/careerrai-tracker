# CareerRai — AI Qualification Framework (v1.0)

**Asset 2 of 5 in the Expedify system — the DESIGN SPEC, not the runtime.**
The Knowledge Base (`EXPEDIFY-KB.md`) is what Riya knows. This document is
how CareerRai thinks about leads — the classification model, the scoring
math, and the CRM contract. It is computed AFTER calls (from transcripts and
CRM fields) and used by humans to audit and improve Riya; it never ships in
the live prompt. What Riya executes on a call is the distilled runtime
layer: `EXPEDIFY-BEHAVIOR.md` (Asset 3) + `EXPEDIFY-PROMPT-RULES.md`
(Asset 5). `EXPEDIFY-CONVERSION.md` (Asset 4) is why students decide at
all. The Conversation Script is written last, from all five — an
implementation artifact, not a foundation.

Where this document and the KB overlap, they must never disagree. Every rule
here that touches Buddy, tone, guardrails, or dispositions defers to KB
§7, §12–§14, and §17. This document adds the layer the KB deliberately left
out: **scoring, routing, and CRM**.

---

## 0. The Prime Directive

**The first call classifies. It does not sell.**

We are not a call center pushing a product. We are the admissions desk of a
serious prep system. The first call's job is to find out — honestly — what
kind of aspirant this is, what their ONE dominant problem is, and whether
CareerRai (free) and the Buddy (paid) actually fit that problem. Selling to a
misclassified lead burns the lead, the agent's credibility, and the brand.

Three consequences the agent must internalize:

1. **A correct classification with no sale is a successful call.** A Cold
   lead correctly logged as Cold is a win; a Cold lead pushed into a pitch is
   a loss even if they don't hang up.
2. **The free app is the qualifier.** Whether a student installs and does
   Day 1 tells us more than anything they say. Install-first is not a soft
   goal — it is the measurement instrument.
3. **The Buddy is a prescription, not a product.** It is only ever offered as
   the answer to a diagnosed problem, in the student's own words. (§7 below.)

---

## 1. Lead Categories (who can be on the other end)

The agent must place every lead into exactly one **primary category** within
the first ~90 seconds. Categories are about *life situation*; the obstacle
(§3) is about *their problem*. Both get logged.

| Category | Recognition signals | Base approach |
|---|---|---|
| **Fresh first-attempt (student)** | In college / just graduated; vague timeline; "thinking about CAT" | Educate + install. Most common; highest volume, mixed intent |
| **Serious first-attempt** | Has a date awareness ("CAT is in November"), has started something, asks specific questions | Qualify fast, install, strong Buddy candidates if obstacle fits |
| **Repeater** | Mentions last attempt/percentile, or wound-language ("this time…") | Never probe the wound (KB §19). Structure pitch, faster trust |
| **Working professional** | Mentions job, office, "only evenings", weekend focus | Respect scarcity: fewer words, "the plan knows you work" (KB §2) |
| **Coaching student** | Enrolled somewhere; has classes, materials | Never against coaching (KB §3). CareerRai manages the other 22 hours; premium aligns with their class timetable |
| **Parent / guardian** | Not the aspirant; asking on someone's behalf | Answer honestly, offer the free app for the aspirant, never sell premium to a parent without the student in the loop. Disposition: Parent Decision Pending |
| **Window-shopper** | "Just tell me what this is"; no CAT commitment | One-breath explanation, zero pressure, install offer once. Usually Cold |
| **Wrong number / not an aspirant** | Confusion, no CAT connection | Apologize warmly, out in 20 seconds. Dead |

A lead can shift categories mid-call ("actually I'm asking for my sister" →
Parent). The FINAL category is what's logged.

---

## 2. The SCOPE Framework (what the agent measures)

Every conversation, underneath whatever is being said, is filling in five
fields. The agent never announces this — SCOPE is internal instrumentation,
not an interrogation script.

### S — Seriousness
*Is CAT a decision or a daydream?*

- **High (2):** has a target (any IIM/percentile), knows CAT is 29 Nov 2026,
  has already done something (mock, material, coaching demo, quit a habit).
- **Medium (1):** intends to prepare, no concrete step taken yet, timeline
  vague but this-year.
- **Low (0):** "maybe next year", "just exploring", deflects every
  commitment question.

### C — Current Situation
*What does their prep actually look like today?*

Captured, not scored: attempt number, coaching (yes/no/which), hours they
claim, months of prep so far, mock scores if volunteered. This field feeds
Potential Fit and personalisation ("you said 3 hours…" — KB §16). Never ask
for all of it; two questions maximum, the rest emerges.

### O — Obstacle (the heart of the call)
*The ONE dominant problem.* Not three problems — one. If the student names
several, the agent asks the deciding question: *"If I could fix only one of
those tomorrow, which one changes your prep the most?"*

The obstacle vocabulary is fixed (these map to KB §2 psychology and to CRM):

| Obstacle code | Student's language sounds like |
|---|---|
| `no_start` | "I don't know where to start" |
| `no_consistency` | "I make timetables but never follow them", "I stop after 2 weeks" |
| `strategy_switching` | "I keep changing plans/teachers/methods" |
| `no_accountability` | "Nobody checks on me", "I'm doing this alone" |
| `time_scarcity` | working professional, "I only get 2 hours" |
| `comparison_anxiety` | toppers, vlogs, "everyone is ahead of me" |
| `guilt_avoidance` | "I panic on Sundays", "I feel too guilty to open my books" |
| `needs_teaching` | "I don't understand quant", wants lectures/doubt-solving |
| `needs_basics` | hasn't seen the syllabus, doesn't know the sections |
| `none_apparent` | already disciplined, just curious about the product |

If no obstacle surfaces in 3 minutes, the honest entry is `none_apparent` —
never invent one to justify a pitch.

### P — Potential Fit (the founder's fit table — binding)
*Given the obstacle, how well do WE actually fit?*

| Dominant obstacle | Fit with CareerRai | Fit with Buddy |
|---|---|---|
| `no_start` (daily confusion) | **Excellent** | Strong |
| `no_consistency` | **Excellent** | **Excellent** — this is what Buddy exists for |
| `no_accountability` | **Excellent** | **Excellent** |
| `strategy_switching` | Strong (one plan held steady) | Strong |
| `guilt_avoidance` | Strong (honest check-in, restart design) | Moderate |
| `time_scarcity` | Strong (plan respects their hours) | Moderate |
| `comparison_anxiety` | Moderate (you-vs-yesterday design) | Moderate |
| `needs_basics` | **Moderate** — app helps order it, doesn't teach it | Weak |
| `needs_teaching` (wants lectures) | **Weak** — we are not coaching; say so | **Weak** — the Buddy doesn't teach (KB §7) |
| `none_apparent` (already disciplined) | **Moderate** — tracking still helps | Weak |

**The Weak rows are load-bearing.** A student who needs lectures is told the
truth: "CareerRai won't teach you quant — coaching or a good course does
that. What we do is manage everything AROUND the teaching. If you get
coaching, come back — we make coaching work." That honesty is the brand.

### E — Engagement (behavior beats words)
*Are they leaning in or waiting for the call to end?*

- **High (2):** asks questions back, gives real answers with detail, agrees
  to install DURING the call or sets a concrete time.
- **Medium (1):** polite, answers when asked, no questions of their own.
- **Low (0):** monosyllables, long silences, "haan haan okay", checking out.

Engagement is measured continuously and can only be observed, never asked.

---

## 3. Lead Scoring — Hot / Warm / Cold / Dead

The tier is computed from SCOPE at the moment the call ends. It answers ONE
question: **what happens next with this lead?**

### 🔥 HOT
**Definition:** Seriousness High + Engagement High + obstacle in an
Excellent/Strong fit row. They feel the problem NOW and we fit it.

**Signals:** installed on the call or committed to tonight; asked about the
Buddy unprompted; used pain language matching `no_consistency` /
`no_accountability`; asked "how much" before we raised price.

**Next step:** the agent may open the Buddy conversation on THIS call —
prescription-style (§7) — if and only if KB §7's conditions also hold
(Day-1 secured or on track). If timing is bad, the next step is a scheduled
follow-up within 48h while the pain is warm. CRM: `lead_tier=hot`,
`buddy_readiness` set, callback window if any.

### 🌤 WARM
**Definition:** genuine intent, but one element missing — Seriousness Medium,
or Engagement Medium, or good fit but "not now" (exam far in their head,
money, parents, mid-semester).

**Next step:** secure the FREE Day 1 (install + plan opened). NO Buddy pitch
beyond, at most, one sentence of awareness if they ask. Nurture path:
app reminders + WhatsApp + a future AI call keyed to their situation
("call back after their first week of streaks"). Warm leads convert through
experienced value, not repeated calls.

### 🌥 COLD
**Definition:** low seriousness or weak fit (`needs_teaching`,
`needs_basics`, window-shopper). Might be an aspirant someday; isn't one now.

**Next step:** educate only. One honest, useful thing ("the free app shows
the full 46-topic syllabus — even just seeing it ordered helps"), install
offer once, out warmly. NO follow-up call scheduled by the agent; they enter
the general (low-frequency) nurture pool only. Never call a Cold lead twice
about premium.

### ⛔ DEAD
**Definition:** wrong number, not a CAT aspirant, hostile, or asked not to
be contacted.

**Next step:** end warmly in seconds. `Do Not Call` if requested — absolute,
flagged immediately (KB §17). No nurture, no retry.

**Tie-break rule:** when torn between two tiers, score DOWN. An
over-scored lead gets an unwanted call later (trust burned); an under-scored
lead who was truly hot will surface again through the app itself.

**Tier vs. disposition — both are logged, they answer different questions.**
The disposition (KB §17, twelve values) records *how this call ended*. The
tier records *what the lead is worth next*. "Installed + Plan Seen" (best
disposition) can coexist with Warm (they installed but seriousness is
medium); "Callback Requested" can coexist with Hot. Never collapse one into
the other.

---

## 4. The Call — minute-phased, with internal structure

Total budget ~5 minutes of goodwill. The phases are elastic — a student's
question always outranks the phase plan (KB §18 rule 1) — but the SEQUENCE
is fixed: trust before questions, diagnosis before value, value before any
mention of money.

| Minute | Phase | What's actually happening |
|---|---|---|
| 0–1 | **Trust** | Permission to talk, warmth, zero pitch. "Am I catching you at an okay time?" A rushed yes = offer callback (Wrong Time, KB §17) |
| 1–2 | **Qualification** | 2–3 light questions → fills S and C. Feels like interest, not intake |
| 2–3 | **Diagnosis** | Find the ONE obstacle → fills O. The deciding question if needed. Name the feeling before fixing (KB §19) |
| 3–4 | **Value** | Explain ONLY the part of CareerRai that answers THEIR obstacle — never the feature tour. Install happens here when engagement is high |
| 4–5 | **Conversion — only if appropriate** | Hot + KB §7 conditions → Buddy as prescription. Everyone else → one concrete next step and a warm close |

The agent's internal checklist for every call (10 steps — the order is the
discipline):

1. **Permission** — got an okay to talk, or gracefully out.
2. **Qualification** — S and C filled (category identified).
3. **Diagnosis** — ONE obstacle named, ideally in the student's own words.
4. **Lead score** — tier decided (silently) before any selling decision.
5. **Personalised value** — the one-obstacle answer, not the brochure.
6. **Install** — attempted if engagement supports it (careerrai.in →
   Chrome → Add to Home Screen; KB §8 is the authority on the flow).
7. **Today's plan** — opened on the call if possible; that's Day 1.
8. **Buddy** — ONLY if tier is Hot AND KB §7 conditions hold. Skipping is
   success, forcing is failure (KB §18 rule 5).
9. **Next step** — exactly one, concrete, agreed ("tonight", "Saturday 6pm").
10. **CRM update** — §8 fields, every call, no exceptions.

---

## 5. Qualifying Questions (the bank — pick 2–4, never all)

Asked conversationally, one at a time (KB §12). Each question exists to fill
a SCOPE field; the agent should know which one it's filling.

**Fills S (seriousness):**
- "Is CAT this year the plan, or are you still deciding?"
- "Do you have a college or percentile in mind, even roughly?"
- "What have you tried so far — anything?"

**Fills C (current situation):**
- "First attempt, or have you given it before?" *(if 'before' — don't probe further; KB §19)*
- "Are you with a coaching, or preparing on your own?"
- "On a normal day, how many hours actually happen — honestly?"

**Fills O (obstacle — the money questions):**
- "What's the hardest part right now — starting, or continuing?"
- "When you sit down to study, what usually goes wrong?"
- "You've made timetables before, right? What happened to them?" *(said with a smile — everyone laughs, everyone answers)*
- The decider: "If I could fix only ONE of those tomorrow, which one changes your prep the most?"

**Fills E:** nothing — engagement is only observed.

**Rules of the bank:**
- Maximum ~4 questions per call. Past that, it's an interrogation.
- Never re-ask anything they answered (KB §16 — the cardinal sin).
- A question they dodge twice is its own answer: score S or E down and move on.

---

## 6. Disqualifying Signals (stop-selling triggers)

Any of these caps the lead at the stated tier and changes the agent's goal.
Disqualification is not rejection — Cold leads get honesty and warmth, just
not a pitch.

| Signal | Effect |
|---|---|
| Two nos, any form, to anything (KB §12) | **All selling stops permanently this call.** Tier per other evidence |
| "Not this year" / next-year timeline | Cap at Cold. Educate; the app is still free |
| Wants lectures / doubt-solving as the ONLY need | Cap at Cold for Buddy (Weak fit). Say the honest thing (§2-P); app install still offered once |
| Cannot say anything concrete about CAT | Cap at Cold (S=0) |
| Monosyllabic after two open questions | Cap at Warm at best; go for the shortest useful close |
| Distress, burnout language, "giving up" | **Tier is irrelevant — KB §19 protocol.** No selling this call or next; human flag |
| Anger / "you keep calling" | Apologize once, fix, offer Do Not Call (KB §19). No selling |
| It's a parent, aspirant absent | No premium selling. Parent Decision Pending; secure free Day 1 for the aspirant |
| Driving / at work / in class | Wrong Time (KB §17): 20 seconds, callback offer, out |
| Asks to be removed | Dead. Do Not Call, absolute, immediate flag |

---

## 7. The Buddy — Prescription, Not Product

The rule that separates a great call from a salesy one. The Buddy is never
"offered". It is *prescribed* — connected to a diagnosis the student
themselves stated, in their words.

**Bad (product):** "We also have a premium Buddy program at ₹2,499 with a
real IIM mentor, weekly reviews, video calls…"

**Great (prescription):** "Can I say something honestly? From what you told
me, your challenge isn't learning — you clearly CAN study, you did it for two
weeks. Your challenge is what happens in week three, when nobody notices you
stopped. That's exactly why the Buddy exists — a real IIM-alumni mentor who
DOES notice. That's the one thing an app alone can't do for you."

**Preconditions (ALL must hold — this list is KB §7's, restated):**
1. Lead tier is **Hot** (this document's addition — Warm gets awareness at
   most, Cold/Dead never).
2. Day-1 setup is done or clearly on track.
3. The student has EXPRESSED a Buddy-fit pain: consistency struggle, past
   dropout, loneliness, parent-pressure story, repeater anxiety — or asked
   "what else do you offer?"
4. At least 2 minutes of goodwill remain; student is not rushed, confused,
   mid-install-problem, or annoyed.

**Execution rules:**
- Value before price, always. Price stated once: anchor **₹2,499 / 3
  months** ("one full season of prep"); Till CAT ₹2,999 only if they ask
  about coverage to the exam (KB §7).
- One mention. A flat response = never again this call (KB §12). Changing
  the topic away from Buddy counts as a no (KB §16).
- Payment happens ONLY inside the app (KB §14). The agent points to the
  path, never collects anything.
- The close of a Buddy-interested call is the exact in-app path + a
  concrete time they'll do it — disposition **Interested in Buddy**.

---

## 8. CRM — what Expedify writes after EVERY call

The call isn't over until these fields are populated. A brilliant call with
an empty CRM entry is a failed call: the next agent (human or AI) inherits
nothing and re-asks everything — the cardinal sin at company scale.

**Required on every call (no exceptions, including Dead):**

| Field | Values |
|---|---|
| `lead_category` | one of §1: `fresh_first_attempt` · `serious_first_attempt` · `repeater` · `working_professional` · `coaching_student` · `parent` · `window_shopper` · `not_aspirant` |
| `lead_tier` | `hot` · `warm` · `cold` · `dead` |
| `disposition` | exactly one of KB §17's twelve values |
| `primary_obstacle` | one code from §2-O (`no_consistency`, `needs_teaching`, …) |
| `scope_s` / `scope_e` | 0–2 each (Seriousness, Engagement) |
| `next_action` | the ONE agreed step, with time window ("installs tonight"; "callback Sat 6–7pm"; `none`) |
| `do_not_call` | boolean — absolute when true |
| `escalate_to_human` | boolean + reason (`otp_failure` · `payment_issue` · `refund_request` · `distress` · `parent_callback` · `kb_gap`) |

**Populated when known (else null — never guessed):**

| Field | Values |
|---|---|
| `attempt_number` | 1 / 2 / 3+ |
| `coaching_status` | `enrolled` (+name if given) · `self_prep` · `deciding` |
| `stated_daily_hours` | number, as claimed |
| `installed_on_call` | boolean |
| `plan_opened_on_call` | boolean — the Day-1 flag |
| `buddy_readiness` | `asked_unprompted` · `receptive` · `flat_no` · `not_raised` |
| `price_stated` | boolean (so no future call repeats it — KB §16) |
| `pain_verbatim` | ONE short quote in the student's own words ("I stop after 2 weeks") — the single most valuable field for the next conversation |
| `callback_window` | timestamp range, only for Callback Requested |
| `nos_given` | what they said no to, verbatim topic list — so it is never re-pitched |

**Field integrity rules:**
- `pain_verbatim` is a quote, not the agent's paraphrase.
- `distress` escalation overrides everything: tier may be left `warm`-null,
  but the flag and a same-day human follow-up are mandatory (KB §19).
- If `do_not_call` is true, no other outreach field matters — the record is
  sealed.

---

## 9. Transition Rules (when to do what — the routing table)

| From → To | Trigger |
|---|---|
| Trust → Qualification | Permission granted + one warm beat exchanged |
| Qualification → Diagnosis | Category identified (S, C sketched) — don't wait for perfect data |
| Diagnosis → Value | ONE obstacle named. If two remain, ask the decider first |
| Value → Install | Any engagement uptick: a question back, "achha?", "how?" |
| Install → Today's Plan | App on home screen — immediately walk to the plan, don't celebrate yet |
| Value/Plan → Buddy | ONLY via §7's four preconditions. No trigger = no transition, ever |
| Anywhere → Solve-their-question | The student asked something. Always. Then bridge back (KB §16) |
| Anywhere → Emotion protocol | Feeling language detected → KB §19 owns the call until resolved |
| Anywhere → Close | Day-1 secured (best), OR student asks to go, OR ~2 min goodwill left, OR two nos. One next step, warmth, out |
| Close → CRM | Every call, all §8 required fields, before the next dial |

**When to explain CareerRai:** only AFTER diagnosis, and only the slice that
answers their obstacle. The full product exists in the app, not in the call.

**When to push install:** the moment engagement turns high — mid-call is
better than end-of-call ("2 minutes, I'll stay on the line").

**When to stop selling:** two nos · any disqualifier (§6) · emotion protocol
active · goodwill under 2 minutes with no Day-1 yet (then the only goal is a
clean next step).

---

## 10. What Good Looks Like (per tier, one line each)

- **Hot:** installed on the call, plan opened, Buddy prescribed in their own
  words, in-app path pointed, `pain_verbatim` logged. *Disposition:
  Installed + Plan Seen / Interested in Buddy.*
- **Warm:** installed (or 3-step recap + tonight commitment), zero premium
  pressure, nurture path set. *Disposition: Installed only / will
  self-install.*
- **Cold:** one honest useful thing given, install offered once, no
  follow-up scheduled, out in under 3 minutes with warmth intact.
- **Dead:** out in seconds, dignity intact, record sealed.

The metric that matters across all four: **would this student pick up our
call next time?** Every rule in this document exists to keep that answer yes.

---
*v1.0 — 7 Aug 2026. Companion to EXPEDIFY-KB.md v1.1 (facts, dispositions,
tone, guardrails). Asset 3 — the Conversation Script (natural example calls,
good and bad) — is the remaining piece. Update this document when pricing,
features, or the disposition list change in the KB; the two must never
disagree.*
