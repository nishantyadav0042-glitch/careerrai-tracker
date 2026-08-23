# Phase 1 — IDENTITY: the canonical student/lead record and the Expedify mapping

**23 Aug 2026 · READ-ONLY investigation. No schema, no API, no UI, no data
change. No DDL written. The four frozen B3b paths remain frozen.**

**Governing rule for everything below (founder, this phase):**

> **ONE STUDENT. ONE CANONICAL IDENTITY. ONE LEAD RECORD. ONE OWNER. ONE
> ACTIVITY LEDGER. ONE FOLLOW-UP SYSTEM. ONE PAYMENT/ENGAGEMENT TIMELINE. ONE
> SOURCE OF TRUTH.** The Founder Admin Panel is a *projection* of that system,
> never a second system.

---

# 0. A CORRECTION TO YESTERDAY'S P0 — I OVERSTATED IT

Yesterday I wrote: *"236 real call outcomes were mis-attributed to one
profile."* **That is wrong, and the correction matters more than the original
claim.**

One query settles it:

```
rows                        : 236
distinct agent_summary      : 1
the only agent_summary value: "first webhook test"
length                      : 18 chars, every row
distinct phones             : 1  (= the admin profile's own phone)
disposition / outcome fields: none present in any row
per-day: 7 Aug ×10 · 11 Aug ×6 · 12 Aug ×220
```

**They are not 236 mis-keyed calls. They are one test payload delivered 236
times** — 220 of them on 12 August alone, which reads as a stuck retry or a
looping node on Expedify's canvas.

And the other three inbound events (`contact.updated`, 29 Jul ×2, 7 Aug ×1)
matched **no student either** — `student_id` is null on all three.

> **Corrected finding: not one genuine call outcome has EVER arrived from
> Expedify. The inbound pipe has carried a test string and three unmatched
> contact updates, and nothing else, in its entire life.**

This is better news (no real evidence was lost) and worse news (the pipe has
never worked at all) than what I told you. I am not repairing the sentence
quietly — the earlier document's §2.3 is superseded by this section.

---

# 1. THE SIX EXPEDIFY QUESTIONS, ANSWERED FROM EVIDENCE

### Q1 — What identifier does Expedify actually send?

| Event | Count | Identifier fields present |
|---|---|---|
| `call_report` | 236 | `phone` only (plus `event`, `agent_summary`) |
| `contact.updated` | 3 | `entity_id`, `entity_type`, nested `data` — **their** id, not ours |

**Answer: phone, and their own `entity_id`. Never a CareerRai identifier.**

### Q2 — Can it send a CareerRai `student_id` / lead id?

**Unknown from their side — but the reason it doesn't is ours, not theirs.**
`src/lib/expedify.ts` builds the outbound payload, and here is the complete
field list it sends:

```
name, phone, email, source, lead_type, summary, attempt, target_percentile,
dream_colleges, hours_per_day, coaching, wants_mentor, target_date,
pain_points, strongest_section, weakest_section, device, coverage
```

**`studentId` is in the `ExpedifyLead` interface and is deliberately NOT put in
the request body** — it is used only to write `expedify_status` back onto our
own profile. **We have never given Expedify an identifier to echo back.** A
vendor cannot return a key it was never handed.

### Q3 — Is phone the only available identifier?

Effectively yes, and email cannot rescue it:

| | students |
|---|---|
| have a phone | **730 of 771** |
| have **no** phone | **41** |
| distinct phones | 730 — **zero duplicates** |
| have an email | **4 of 771** |

Worse, the outbound sender *fabricates* an email when one is missing —
`{digits}@noemail.careerrai.app` — because Expedify 422s without one. **So the
email we give them is a function of the phone: it carries no independent
identity at all.**

### Q4 — Duplicate / shared / missing phones?

* **Duplicates: zero today.** 730 phones, 730 distinct. Good, but *not
  enforced* — I found no unique constraint proving it stays true.
* **Two stored formats: `+91XXXXXXXXXX` (665) and bare `XXXXXXXXXX` (65).**
  This is why `phoneVariants()` exists. A single-format lookup would silently
  miss 65 students — 8.9% of the base.
* **41 students have no phone.** They are **structurally uncallable** and
  cannot appear in any phone-keyed CRM. Nothing currently tells you that.
* Shared family numbers: **UNKNOWN.** Zero duplicates today means it has not
  happened yet, not that it cannot.

### Q5 — What happens when a call cannot be matched?

`/api/expedify/outcome`: the raw payload is **always** stored in
`expedify_events` with `student_id = NULL`, and the route returns success. The
audit row survives — good — but **nothing alerts, nothing queues it for repair,
and no surface anywhere lists unmatched events.** 239 of 239 inbound events are
effectively unmatched-or-wrong and this is the first document to say so.

`/api/expedify/callback` behaves differently: it returns **404 `no student with
that phone`** and stores nothing. **Two inbound routes, two opposite policies
for the same failure.**

### Q6 — Can the historical 236 be reconstructed?

**No — and there is nothing to reconstruct.** Every row is the identical string
`"first webhook test"` with no disposition, no outcome and no student. There is
no information in them to recover. **Recommended disposition: retain as an
audit record, mark them non-evidence, and never normalise them into the
activity ledger.**

### Bonus — why calling stopped on 12 August

I listed this as UNKNOWN yesterday. It is not:

```ts
// src/lib/expedify.ts
// ── OUTBOUND HARD-DISABLED — founder, 12 Aug 2026: "don't trigger any
// leads to Expedify."
const OUTBOUND_DISABLED = true;
```

**You turned it off yourself on 12 Aug**, the same day the 220 test deliveries
arrived. The gate is the single choke point for all three outbound paths, and
queued statuses keep accumulating so it resumes where it stopped. UNKNOWN #2
from yesterday is closed.

---

# 2. THE IDENTITY MAP AS IT STANDS TODAY

| Concept | Key in use | Canonical? |
|---|---|---|
| Student | `profiles.id` (uuid, = `auth.users.id`) | **YES** |
| Lead | `profiles.id` — a lead *is* a student row | YES, but see §3 |
| Pre-signup lead | `cat_test_leads.id` + phone | **NO — second universe** |
| Lead state | `lead_outreach.student_id` (uuid, PK) | YES |
| Activity | `sales_activity.student_id` (uuid) | YES |
| **Lead owner** | `lead_outreach.owner` — **TEXT EMAIL** | **NO** |
| Activity actor | `sales_activity.actor` — **TEXT EMAIL** | **NO** |
| Vendor contact | phone → `profiles.phone` via `phoneVariants` | **NO** |
| Auth identity | phone OTP → `auth.users` | YES |

**Two identity defects, both of the same shape — a person addressed by a
mutable string instead of a key:**

* **IDN-1 (P1) — ownership is keyed by email.** `lead_outreach.owner` and
  `sales_activity.actor` store `profiles.email`. Change a rep's email and her
  entire book silently detaches, and her whole history stops joining. Note the
  irony already visible in the data: **only 4 of 771 students have an email at
  all**, yet email is what we chose to identify *staff* by. `reassign-lead`
  already accepts a `newOwnerId` and resolves it to an email at write time —
  the correct key is *known at the boundary and then discarded*.
* **IDN-2 (P0 for sales) — the vendor boundary is keyed by phone.** With no
  outbound id and a fabricated email, phone is the only join, across two stored
  formats, for a base where 41 students have no phone.

**IDN-3 (P2) — `cat_test_leads` is a second lead universe.** 7 rows with name,
phone and scores that never become a `lead_outreach` row. Nothing bridges them.

---

# 3. WHAT "ONE LEAD RECORD" SHOULD MEAN HERE

I am **not** proposing a new `leads` table. Evidence for that choice:

* `lead_outreach` is already PK'd on `student_id` — one row per student,
  ownership single-valued by construction. That is exactly the invariant you
  asked for, already enforced by the schema.
* Every sales surface already joins on `student_id`.
* A separate `leads` table would immediately create a *third* identity
  (`lead_id`) and a mapping table to keep in sync — the precise failure mode
  this phase exists to remove.

**Proposal: a lead is a `profiles` row; `lead_outreach` is its sales state.**
The gaps to close are the keys, not the tables:

| # | Change | Kind |
|---|---|---|
| 1 | `lead_outreach.owner_id` + `sales_activity.actor_id` → `profiles.id`, backfilled from email, email retained as a display denormal | **DDL — needs your authorisation** |
| 2 | Send `external_ref = student_id` in the outbound Expedify payload; require it echoed on every inbound event | code + **vendor contract** |
| 3 | Inbound match order: `external_ref` → phone (all variants) → **UNMATCHED queue**. Never a silent success. | code |
| 4 | `UNIQUE` on normalised phone, and one stored format | **DDL — needs authorisation** |
| 5 | Bridge `cat_test_leads` → `profiles` on signup, or declare it retired | decision |
| 6 | Surface the 41 phone-less students as a named, uncallable cohort | read-only UI |

**Change 2 is the one that unblocks everything else, and it cannot be completed
by me alone — it needs Expedify to add one field to their post-call node.**

---

# 4. THE ONE THING I CANNOT DO, AND WHAT I NEED FROM YOU

Everything in Phase 1 that is *ours* I can build and test. But the vendor half
requires a decision only you can make, and it gates Phases 3–9:

> **Ask Expedify for exactly one thing: echo back the `external_ref` we send,
> on every post-call event, alongside a structured `disposition`.**

Concretely, what we start sending:

```jsonc
{ "external_ref": "<careerrai student uuid>", "phone": "+91…", "name": "…", … }
```

What we must receive:

```jsonc
{ "event": "call_report", "external_ref": "<same uuid>",
  "disposition": "connected|no_answer|interested|not_interested|callback",
  "callback_at": "…", "agent_summary": "…", "attempt_number": 2 }
```

**Until that exists, any CRM built on vendor calls is built on phone-matching a
payload that has never once carried a real outcome — and per your own rule I
will not build UI over it and call it evidence.**

**Three questions I need answered before Phase 2 starts:**

1. **Is the human sales team calling through Expedify at all, or by hand?** If
   by hand, the vendor pipe is not the priority — `/api/sales/log` already
   works and the gap is purely that nobody is using it. This changes the whole
   sequence and I have no evidence either way.
2. **DDL authorisation for changes 1 and 4** (owner/actor as `profiles.id`,
   phone uniqueness + single format). Additive, backfillable, reversible.
3. **`cat_test_leads`: bridge or retire?**

---

# 5. WHAT I AM DOING NEXT, WITHOUT WAITING

These need no DDL and no vendor answer, and none of them is UI over missing
data:

* **IDN-1 fix, prepared:** `owner_id` / `actor_id` migration + backfill written
  and tested, held unapplied pending your DDL word.
* **Unmatched-inbound queue:** make both Expedify routes agree — always audit,
  never silently succeed, and expose an `UNMATCHED` list with a repair action.
* **A guard test** that fails the build if any new sales code identifies a
  person by email or phone instead of a uuid — so this class of defect cannot
  return the way the 8-day window did.
* **Retire `student_crm`** once I have proven no external reader (this repo has
  none; I cannot see outside it — I need your confirmation no vendor or script
  reads it).

**Not started, per your ruling:** the Control Tower, the payment funnel events,
and the four frozen B3b paths. `payment_checkout_opened` is **de-prioritised
from #1 to Phase 9** — I accept the correction: it answers a narrower question
than lead→rep→interaction→payment, and shipping it first would have been
choosing the easy measurement over the load-bearing one.
