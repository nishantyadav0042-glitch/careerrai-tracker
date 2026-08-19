# How we should propose the Buddy — research before copywriting

**19 Aug 2026. Research memo, no code changes.** Commissioned after the founder
asked how to position the ₹299 session for maximum conversion, and after a
ChatGPT positioning memo was tabled for comparison.

**One-line finding:** the positioning memo answers a question our data says is
not currently the binding constraint. **30% of students who open the pricing
sheet click a plan, and most of the loss is at checkout.** The words are
working better than the checkout is.

> **CORRECTION, same day, before this memo was acted on.** My first pass said
> "iOS has produced ₹0, ever" and "100% of revenue is Android." **Both are
> wrong.** See §1a — the true statement is narrower and more useful: no payment
> has ever completed **inside the iOS app shell**, while iOS Safari has
> collected at least one. I also built the funnel on client-side
> `pay_success_callback`, which misses **2 of the 4 real payments** because the
> webhook, not the browser, recorded them. Terminal rates below are therefore
> soft; `student_payments` is the authority, not the event stream.

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

### 1a. iOS — corrected, and narrower than I first wrote `[MEASURED]`

| Surface | Plan clicks | Escapes | Orders | Checkout | Dismissed | Paid (client) |
|---|---|---|---|---|---|---|
| Android standalone | 17 | 0 | 16 | 17 | 10 | 2 |
| **iOS standalone (installed)** | 24 | 17 | 7 | 7 | **7** | **0** |
| **iOS app shell** | 3 | 3 | 0 | 0 | 0 | **0** |
| **iOS Safari (plain browser)** | 2 | 0 | 1 | 1 | 0 | **0*** |

`*` — and this asterisk is the whole correction. On **4 Aug 15:23** an iOS
Safari student clicked `monthly`, an order was created, checkout opened, and
then **nothing**: no dismiss, no success callback. `student_payments` has a
**paid ₹999 monthly row for that student that day**. The payment went through;
the client never saw it. That student's entire surface history is
`desktop/browser, desktop/standalone, ios/browser, ios/standalone` — **no
Android at all.**

So the corrected statements are:

- **We do collect payments on iOS — in a real browser.** At least one, confirmed.
- **The iOS app shell has never completed a payment: 27 plan clicks, 0.**
- "100% of revenue is Android" was **false**. Retracted.

**The hand-off is deliberate, not a bug.** `unlock-buddy-sheet.tsx` routes store
builds out to the real browser because an in-app card sheet for a live
mentorship service would be rejected by Apple. The code already carries the
prior measurement of the alternative: *"Measured result of falling through: 0
payments in 21 attempts."* Someone already found this, already fixed the
routing, and already replaced a two-tap escape with a one-tap anchor. What is
unproven is whether students **survive the hand-off** — 17 escapes from the
installed iOS PWA, and only 2 clicks ever recorded on the far side in Safari.

**That is the open question, and it is not "is iOS broken".** It is: *how many
students fall into the gap between tapping in the app and arriving in the
browser?* Nothing currently measures the far side of that jump.

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

**P0 — Measure the iOS hand-off, then decide.** 26% of the base, 27 clicks
inside the app, 0 completions there — but the hand-off to Safari is
Apple-required and demonstrably *can* complete. The actionable gap is that
nothing measures survival across the jump. Instrument the far side (a marked
return URL, so an arrival in Safari can be tied to the tap that sent it) before
proposing any fix. Do not bundle with copy.

**P1 — Instrument the nudge before touching its copy.** `nudge_shown`,
`nudge_dismissed`, `nudge_cta_click`, `nudge_rung_click`. One commit, no
behaviour change. Without it, every subsequent positioning decision is taste.

**P2 — Reconcile the payment funnel against `student_payments`.**
`pay_success_callback` fired twice; four payments are real. Every abandonment
number in §1 is inflated by that gap, mine included. Until the event stream and
the payments table agree, we cannot tell a lost sale from an untracked one —
and one Android payer on 4 Aug ground through **six** checkout attempts across
27 minutes before succeeding, so repeat-clicking is not reliably a dead button
either.

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

## 6. State of the branch

`claude/buddy-entry-rung` holds the ₹299 rung on both screens plus the rewritten
claim, per the two rulings of 19 Aug, guarded by 13 tests. Full suite 1987
passing, tsc / eslint / build clean.

Two failures surfaced while writing that guard, and both had **one root cause
worth remembering**: a source-level guard reads the file as text and cannot
tell rendered JSX from a comment. It first anchored on the first `299` in the
file, which is `₹2,999` (tillcat) — the window landed on the wrong element and
the assertion silently tested nothing. Re-anchoring on `₹299` then landed on my
own explanatory comment, which mentions the price. The fix is to assert the
claim that is actually true — *some* occurrence of the price sits inside a link
to the gated card — rather than to keep chasing an exact offset.

**This does not change the ranking in §4.** The rung is honest and complete;
it is P3, not the lever. Nothing here moves revenue until iOS can pay.
