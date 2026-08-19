# How we should propose the Buddy — research before copywriting

**19 Aug 2026. Research memo, no code changes.** Commissioned after the founder
asked how to position the ₹299 session for maximum conversion, and after a
ChatGPT positioning memo was tabled for comparison.

**One-line finding:** the positioning memo answers a question our data says is
not currently the binding constraint. **30% of students who open the pricing
sheet click a plan. 80% of the ones who reach checkout abandon it. iOS has
taken 27 plan clicks and produced ₹0, ever.** The words are working better
than the checkout is.

Everything below is graded. `[MEASURED]` = queried production today.
`[WEAK]` = real but n is too small to lean on. `[UNEVIDENCED]` = plausible,
no supporting instance in our data — stated as a hypothesis, never as a fact.

---

## 1. The funnel, measured

`student_events`, all time (23 Jul – 19 Aug), distinct people:

| Step | People | Conversion from previous |
|---|---|---|
| Opened the pricing sheet (`buddy_unlock_open`) | 57 | — |
| Clicked a plan (`buddy_plan_click`) | 17 | **30%** |
| Razorpay order created | 10 | 59% |
| Checkout opened | 10 | 100% |
| **Dismissed checkout** (`pay_dismissed`) | **8** | **80% of checkouts** |
| Paid (`pay_success_callback`) | **2** | **3.5% of sheet-openers** |

`student_payments` agrees: 25 orders, 4 `paid` (1 tillcat, 3 monthly).

**Read this the right way round.** A pricing sheet that converts 30% of
viewers into a plan click is not a sheet with a messaging problem. The message
is getting people to reach for their wallet. The wallet step is where they are
lost.

### 1a. The single largest fact in this dataset `[MEASURED]`

Split the same funnel by platform:

| Platform / mode | Plan clicks | Checkout | Dismissed | `pay_escape_browser` | **Paid** |
|---|---|---|---|---|---|
| Android standalone | 17 | 17 | 10 | 0 | **2** |
| iOS standalone | 24 | 7 | 7 | 17 | **0** |
| iOS app shell | 3 | 0 | 0 | 3 | **0** |
| Everything else | 2 | 1 | 0 | 0 | 0 |

**iOS: 27 plan clicks, 20 escape-to-browser events, zero rupees. Not once.**
100% of revenue this company has ever collected came from Android.

iOS is **26% of the active base** (760 of 2,928 people active in 14 days).
Roughly a quarter of our students are structurally unable to pay us, and the
`pay_escape_browser` instrumentation says we already knew the mechanism —
Razorpay does not complete inside the iOS shell, so we punt to a browser tab
and the payment dies there.

No sentence, in any language, fixes that.

### 1b. The repeat-click signature `[MEASURED]`

28 `tillcat` clicks from 9 people (3.1 each). 18 `monthly` clicks from 11
people. People are tapping the same plan over and over. That is the behavioural
signature of a checkout that does not respond, not of a student weighing value.

### 1c. Price is not filtering at the click `[MEASURED]`

9 distinct people clicked **₹2,999**. 11 clicked **₹999**. Near-parity.
Students who reach the sheet are not visibly deterred by the higher number —
which is direct evidence *against* the assumption underneath "add a cheap rung
and conversion rises." The cheap rung is worth having for other reasons (§4),
but "₹2,999 is scaring them off at the sheet" is not what the data shows.

### 1d. The ₹299 door has already been walked to `[WEAK — n=2]`

`session_book_click` — 2 people, both 17 Aug. `session_pay_dismissed` — 1.
`session_credits` — **0 rows, ever**. `session_requests` — **1 row, ever**
(29 Jul). Two students found the ₹299 session two days ago and neither
completed. n=2 proves nothing; it does mean the rung is not an untested idea,
and that the first observation of it is not encouraging.

---

## 2. The finding that contradicts both memos

Of the 16 students who have ever created an order, I counted distinct logged
study days **before** their first order:

| | Students | Avg study-days before first order | Range |
|---|---|---|---|
| Ever paid | **4** | **0.5** | 0–2 |
| Never paid | 12 | 1.6 | 0–10 |

`[WEAK — n=4, and directionally the opposite of intuition]`

**Every rupee this company has collected was collected from a student who had
barely used the product.** Payers had *less* product exposure than
non-payers. That is consistent with conversion being **sales-led** — the
Expedify/Riya call — and it means the product-led path has, to date, converted
nobody.

This matters because both memos assume the product-led path.

`docs/EXPEDIFY-CONVERSION.md` §3 says *"Confidence arrives after Day 1, never
before it… pushing premium pre-install is backwards."* The ChatGPT memo says
*"Don't shove ₹299 in their face before they understand CareerRai… let them
experience 'oh, I can actually prepare here', THEN convert."*

Both are reasonable. Neither has a single supporting instance in our data.
Four for four went the other way. I am not claiming the doctrine is wrong —
n=4 cannot carry that, and the causal story ("Riya calls the engaged-looking
ones early") is unresolved. I am saying it is currently **an assumption we have
never tested, being cited as if it were a finding**, which is the exact defect
this codebase spent the week removing from its data layer.

---

## 3. Grading the ChatGPT memo

**What survives contact with our data:**

- **"Don't say 2–3 sessions and you'll ace the exam."** Correct, and for a
  harder reason than it gives: with 4 paid students and 0 completed sessions,
  any outcome claim is a number we do not have. This is the same class of
  defect as `avg([]) === 0` — absence of evidence rendered as a confident
  statement — and it is worse in copy, because money moves on it.
- **"₹299 is the escape hatch, not the product."** Aligns with MISSION Q4
  ("would we build it if it earned ₹0?"). The free plan must not become a
  demo.
- **"Guidance when you need it, preparation stays yours."** Genuinely
  ownable, and consistent with SELF-PREP framing already in the repo.
- **Never "human intervention."** Agreed. Clinical, and implies defect.

**What is already true and therefore not a new idea:**

- *"Prepare on your own. Don't prepare alone."* The nudge headline in
  production today is literally **"Don't prep alone."** The memo's flagship
  line is our current copy. Adopting it changes nothing.

**Where it is confidently wrong for us:**

- It diagnoses a **positioning** bottleneck. Measured: 30% sheet→click.
  The leak is at Razorpay, and it is 100% on iOS.
- It never asks what a student who bought actually did. We can ask. §2.
- The Duolingo-India paywall anecdote is asserted without a source I can
  check. `[UNEVIDENCED]` — do not repeat it in a strategy doc as fact.

**What neither memo noticed, and is cheap to fix:**

`src/components/daily-buddy-nudge.tsx` emits **no telemetry at all** — no
shown, no dismissed, no click. It is a modal shown daily to ~492 buddy-less
students and we cannot measure a single thing about it. **Polishing it today
produces an unfalsifiable result.** Whatever copy we ship, we will not know
whether it worked.

---

## 4. What I would actually do, ranked by measured leverage

**P0 — Make iOS able to pay.** 26% of the base, 27 plan clicks, ₹0. This is
worth more than every word on both screens combined, and it is an engineering
problem with a measurable pass/fail. Needs its own audit gate; do not bundle it
with copy.

**P1 — Instrument the nudge before touching its copy.** `nudge_shown`,
`nudge_dismissed`, `nudge_cta_click`, `nudge_rung_click`. One commit, no
behaviour change. Without it, every subsequent positioning decision is taste.

**P2 — Fix the checkout-abandon rate on Android.** 10 open, 8 dismiss. We have
`pay_dismissed` but not *why*. Worth a read of the Razorpay failure props
before assuming it is price.

**P3 — Ship the ₹299 rung and the honest claim.** Already built on
`claude/buddy-entry-rung` (see §6). It is right on the merits — the cheapest
real step existed and appeared nowhere on the path a student walks — but
expect it to move revenue by approximately nothing until P0 and P2 land.
Ship it because it is honest and complete, not because it is the lever.

**P4 — Positioning.** Recommended line, if we are choosing one:

> **Prepare for the exam yourself. CareerRai is free, and it stays free.**
> When you're stuck — not sure what to fix, or whether you're on track — sit
> with an IIM senior who's cleared it. One session, ₹299. No package, no
> subscription required.

Why this shape: it names the free product as *complete* rather than as a
trial (MISSION Q1), it describes what the buddy **does** rather than what the
student will **achieve** (no outcome claim we cannot evidence), and it puts
the ₹299 in as a door rather than a discount.

**Do not ship** any variant of "ace the exam for ₹1–2k", "₹30,000 coaching
replaced by ₹999", or "you only need 2–3 sessions". Every one of those is a
promise about an outcome we have never observed. We have completed zero
sessions.

---

## 5. Against the MISSION filter

A positioning change is a monetisation feature and must be labelled one.

1. *Better for a student who will never pay?* **Yes** — "free, and it stays
   free" is a stronger statement to a non-payer than the current sheet, which
   reads as a paywall.
2. *Deepens what we learn?* **Only if P1 ships.** Untelemetered copy teaches
   us nothing — a missed deposit into the only compounding asset we have.
3. *Survives 100,000 students?* Yes for copy. **No for the ₹299 rung without
   the capacity gate** — 21 mentor-sessions a week against 492 buddy-less
   students. That gate is why both rungs link to `BookSessionCard` instead of
   charging inline.
4. *Would we build it at ₹0?* The rung, no — it is honestly a monetisation
   feature. The honest claim, yes.

---

## 6. State of the parked branch

`claude/buddy-entry-rung` holds the ₹299 rung on both screens plus the rewritten
claim, per the two rulings of 19 Aug. `src/lib/buddy-entry-rung.test.ts` is at
11 passing / 2 failing. Neither failure is in the shipped behaviour:

- **My test bug.** The slice window anchors on `s.indexOf('299')`, which finds
  `₹2,999` (tillcat) first and lands on the wrong element, so it never sees the
  new rung's `href`.
- **The guard being right.** The retired claim *is* gone from the rendered copy,
  but I quoted it verbatim inside an explanatory code comment, and a
  source-level guard cannot tell comment from JSX. Quoting the exact string a
  guard forbids makes that guard fail forever — the comment should describe the
  retired claim without reproducing it.

Nothing is committed pending the founder's call on §4.
