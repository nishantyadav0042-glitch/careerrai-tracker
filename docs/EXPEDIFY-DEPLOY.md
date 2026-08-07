# Riya — Expedify Deployment Pack (v1.0)

**The assembly.** The five assets are the source; this is the product. Every
section below maps to a field in the Expedify dashboard. Follow it top to
bottom and Riya is configured in under an hour. Nothing here requires
engineering — it is copy, paste, and settings.

---

## 1. Agent instruction (the system prompt)

Paste the ENTIRE contents of **`EXPEDIFY-RIYA-PROMPT.txt`** into the agent's
instruction/prompt field. It is self-contained — it references no other
document, because a live prompt cannot follow links.

What it is: the Behavior Engine + Prompt Rules compressed to ~800 words.
What it is NOT: the KB (that's retrieval, §3), the Qualification Framework
or Conversion Psychology (those are post-call and training layers — pasting
them into the prompt would slow every single turn and blur the laws).

Rule for the future: **edit the assets first, then re-compress into the
prompt.** Never patch the prompt directly and let the assets drift — that is
the two-copies failure, and we have paid for it four times in the app.

## 2. Greeting (first message)

> "Hi! Main Riya bol rahi hoon, CareerRai se. Aap ne humari site pe CAT ke
> liye register kiya tha — abhi do minute baat kar sakte hain?"

One breath, permission first, no pitch. If Expedify supports a variable,
insert the student's first name after "Hi".

## 3. Knowledge base (retrieval)

Upload **`EXPEDIFY-KB.md`** (v1.1) as the agent's knowledge document. Riya
answers factual questions from retrieval, not from the prompt. If the
dashboard accepts multiple documents, upload ONLY the KB — the thinking
documents (Qualification, Conversion) must not be retrievable, or Riya will
start reciting frameworks at students.

## 4. Post-call CRM fields

Configure these as the post-call analysis / custom fields. Enums exactly as
written — free text breaks the dashboard funnel we'll build on top:

| Field | Type / values |
|---|---|
| `lead_type` | enum: student · working · repeater · coaching · parent · wrong |
| `pain_verbatim` | short text — the student's OWN words, or empty |
| `installed` | boolean |
| `plan_opened` | boolean |
| `next_step` | short text — the one agreed action + time |
| `callback_window` | datetime range or empty |
| `buddy_readiness` | enum: asked_unprompted · receptive · flat_no · not_raised |
| `price_stated` | boolean |
| `do_not_call` | boolean |
| `escalate` | boolean + `escalate_reason`: otp_failure · payment_issue · refund_request · distress · parent_callback · kb_gap |
| `disposition` | enum — the twelve from KB §17 (Installed + Plan Seen, Installed only, Will self-install, Blocked, Callback Requested, Interested in Buddy, Parent Decision Pending, Wrong Time, No Answer, Already Using App, Not Interested, Do Not Call) |

Lead tier (Hot/Warm/Cold/Dead) and SCOPE scores are NOT Expedify fields —
they are computed later from these fields + the transcript, per the
Qualification Framework. Don't ask the voice agent to do math mid-call.

## 5. Call settings

- **Language:** Hinglish (Hindi-English mix), Indian female voice, natural
  pace. Pick the most natural-sounding voice available, not the clearest —
  "sounds like a person" beats diction (Moment of Truth #1).
- **Barge-in / interruption sensitivity:** ON, most sensitive setting.
  Riya stopping mid-word is the most trust-critical behavior in the system.
- **Max call duration:** 7 minutes hard cap (the design is a 5-minute call).
- **Silence handling:** wait ~4 seconds before re-prompting — thinking
  silence is good silence. One gentle "hello, sun paa rahe ho?" then a warm
  goodbye, never a monologue into dead air.
- **Recording:** ON for every call (the improvement loop is transcripts).
  The greeting territory requires no stealth — if compliance needs it, Riya
  saying "main CareerRai se bol rahi hoon" already identifies the call.
- **Human transfer:** wire to the founder's number for the pilot. Transfer
  live ONLY for distress or anger; everything else is "team aapko call
  karegi" + the `escalate` flag.
- **Calling hours:** 11:00–13:00 and 16:00–20:00 IST. Never before 10am,
  never after 9pm, never during standard coaching hours (18:00–20:00 is
  acceptable for non-coaching leads only if we can segment; if not, prefer
  11:00–13:00 and 16:00–18:00).
- **Retries:** max 2 attempts per lead per day, 3 days apart, stop at 3
  total unanswered. No voicemails.

## 6. The five test calls (before ANY real lead)

Call your own number and friendly numbers. One scenario each, played
straight:

| # | You play | Riya must |
|---|---|---|
| 1 | Fresh college student, vague, friendly | Full flow: story → pain → install live → plan open → one next step |
| 2 | Working professional, 3 minutes, mildly impatient | Detect it unprompted, switch to Short Mode, no Buddy, Saturday callback |
| 3 | Repeater who volunteers last year's failure | Zero probing, the "wapas aana" line, forward motion, dignity intact |
| 4 | Price interrogator ("kitne ka hai?" in minute 1) | Answer honestly once, bridge back to install, never repeat the price |
| 5 | Chaos: "ek sec" twice, a parent walks in, topic changes | Stop instantly every time, resume from the student's point, exit gracefully on the parent |

**Scoring — every call, against the Moments of Truth (Conversion Engine
§12):** first 10 seconds human? · first question a story, not an interview?
· stopped mid-word on interruption? · admitted a limit or a "pata nahi"
honestly? · install patient, one step at a time? · Buddy earned-or-absent
(never forced)? · closed on ONE next step, no parting pitch? · CRM fields
correctly filled afterward?

**Launch gate:** 4 of 5 calls pass all eight checks → dial real leads.
Anything less → the failing transcript comes to me, the responsible asset
gets a v1.1, the prompt gets re-compressed, re-test. Do not "soft launch"
past a failing gate — the leads list is finite and first impressions don't
retry.

## 7. Pilot scope

First real batch: 20 leads maximum, from the oldest cold registrations (the
cheapest leads to learn on — low downside if a call is clumsy). Review all
20 transcripts before batch two. Every transcript that surprises us updates
an asset; the assets version, the prompt re-compresses, and Riya gets
measurably better per batch — that's the loop this whole architecture
exists to feed.

---
*v1.0 — 7 Aug 2026. Founder-side to go live: paste §1–§2, upload §3,
configure §4–§5 in the Expedify dashboard, then run §6 with me reviewing
transcripts. Sources: EXPEDIFY-KB.md · EXPEDIFY-QUALIFICATION.md ·
EXPEDIFY-BEHAVIOR.md · EXPEDIFY-CONVERSION.md · EXPEDIFY-PROMPT-RULES.md.*
