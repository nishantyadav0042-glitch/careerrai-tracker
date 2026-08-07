# Riya — Expedify Setup, start to finish (v1.1)

**The one setup document.** Work top to bottom and Expedify is closed. Every
step says exactly what to paste, where, and how to know it worked.

> **What already exists (verified in code, 7 Aug):** the OUTBOUND pipe is
> live — every new signup is handed to Expedify with a full student brief
> (`lib/expedify.ts` → flush cron), and 173 calls have been dispatched. The
> INBOUND pipe is **built but has never fired**: `expedify_events` is empty
> because Expedify's side was never pointed back at us. Step 6 is therefore
> the highest-value step in this document — it is the entire "learning loop",
> and it is one URL.

---

## 0. What goes where (the whole map in one table)

| Document | Where it goes | Why |
|---|---|---|
| **EXPEDIFY-RIYA-PROMPT.txt** | Expedify → agent **instructions / prompt** field | Riya's behavior. Self-contained by design |
| **EXPEDIFY-KB.md** | Expedify → **knowledge base** upload (retrieval) | The facts she answers from |
| Greeting line (§2 below) | Expedify → **first message** | Permission before anything |
| CRM fields (§4) | Expedify → **post-call analysis / variables** | What every call must leave behind |
| Return webhook (§6) | Expedify → **post-call HTTP / webhook node** | Sends the outcome back to CareerRai |
| **EXPEDIFY-QUALIFICATION.md** | ❌ never uploaded — ours | Post-call scoring + CRM design |
| **EXPEDIFY-CONVERSION.md** | ❌ never uploaded — ours | Why students decide; trains us, not her |
| **EXPEDIFY-BEHAVIOR.md** | ❌ never uploaded — source | Already compressed into the prompt |
| **EXPEDIFY-PROMPT-RULES.md** | ❌ never uploaded — source | Already inside the prompt |

**Only two files ever enter Expedify: the prompt and the KB.** Uploading the
thinking documents makes Riya recite frameworks at students.

---

## 1. Agent instruction (the system prompt)

Paste the ENTIRE contents of **`EXPEDIFY-RIYA-PROMPT.txt`** into the agent's
instruction/prompt field. It references no other document, because a live
prompt cannot follow links.

**Maintenance rule:** edit the assets first, then re-compress into the
prompt. Never patch the prompt directly and let the sources drift — that is
the two-copies failure this codebase has paid for four times.

## 2. Greeting (first message)

> "Hi! Main Riya bol rahi hoon, CareerRai se. Aap ne humari site pe CAT ke
> liye register kiya tha — abhi do minute baat kar sakte hain?"

If Expedify supports variables, insert the student's first name after "Hi".
We already send `name` with every lead, so the variable will be populated.

## 3. Knowledge base (retrieval)

Upload **`EXPEDIFY-KB.md`** as the agent's knowledge document. If the
uploader rejects `.md`, rename the file to `.txt` — the content is plain
text either way. Upload ONLY this file.

## 4. Post-call fields

Configure these as post-call analysis fields / variables. The names on the
left are what our webhook already parses (§6), so keeping them exact means
zero mapping work:

| Field | Values |
|---|---|
| `lead_type` | student · working · repeater · coaching · parent · wrong |
| `installed` | true / false — app reached the home screen on this call |
| `plan_opened` | true / false — they saw today's plan (the Day-1 moment) |
| `next_step` | short text — the ONE agreed action with its time |
| `disposition` | HOT · WARM · COLD · NO_ANSWER · APP_ISSUE · DO_NOT_CALL |
| `drop_reason` | short text — why they stopped using the app (activation gold) |
| `emotional_trigger` | short text — the pain in THEIR words |
| `momentum_score` | 0–5 |
| `agent_summary` | 2–3 line summary of the call |
| `callback_at` | date-time, only when a callback was agreed |

Booleans may be sent as `true`/`false`, `"yes"`/`"no"`, or `1`/`0` — all are
accepted. A field left empty stays empty; it is never read as "no".

Lead tier (Hot/Warm/Cold) and SCOPE scores are NOT Expedify fields — they're
computed later from these plus the transcript. Never ask a voice agent to do
math mid-call.

## 5. Call settings

- **Voice/language:** Hinglish, Indian female, natural pace. Pick the most
  natural-sounding voice, not the clearest — "sounds like a person" beats
  diction (Moment of Truth #1).
- **Barge-in / interruption sensitivity:** ON, most sensitive. Riya stopping
  mid-word is the most trust-critical behavior in the system.
- **Max call duration:** 7 minutes (the design is a 5-minute call).
- **Silence:** wait ~4 seconds before re-prompting; one gentle "hello, sun
  paa rahe ho?" then a warm goodbye. Never monologue into dead air.
- **Recording + transcripts:** ON for every call. This is the improvement
  loop; without it we're guessing.
- **Human transfer:** the founder's number, for distress or anger only.
  Everything else is "team aapko call karegi" + the escalate flag.
- **Calling hours:** 11:00–13:00 and 16:00–20:00 IST. Never before 10am or
  after 9pm.
- **Retries:** max 2 attempts per lead per day, 3 days apart, stop at 3
  unanswered. No voicemails.

## 6. Return webhook — the step that has never been done

In Expedify's post-call workflow, add an HTTP/webhook node pointing at:

```
POST https://careerrai.in/api/expedify/outcome?key=<EXPEDIFY_INBOUND_SECRET>
Content-Type: application/json
```

`<EXPEDIFY_INBOUND_SECRET>` is a Vercel environment variable on the
`careerrai-daily` project. Check whether it already has a value; if not,
create any long random string, save it in Vercel, redeploy, and use the same
value in the URL. **The secret goes in Vercel and in Expedify — never in
this repo, never in chat.**

Body: the §4 fields plus the student's phone. Phone is the only required
field — it is how the outcome finds the student:

```json
{
  "event": "call_report",
  "phone": "+919876543210",
  "lead_type": "student",
  "installed": true,
  "plan_opened": true,
  "next_step": "does the Start Here block tonight",
  "disposition": "HOT",
  "drop_reason": "",
  "emotional_trigger": "stops after two weeks",
  "momentum_score": 4,
  "agent_summary": "First attempt, no coaching. Installed on the call.",
  "callback_at": ""
}
```

Field-name variants are accepted (`lead_phone`/`contact_phone`/`mobile` for
phone; `app_installed` for installed; `plan_seen` for plan_opened;
`next_action` for next_step; `notes`/`summary` for agent_summary), so
whatever their builder emits will land. The raw payload is always stored in
`expedify_events` even if a field name is unrecognised — nothing is lost,
and we can wire new fields later without asking them to re-send.

**What this unlocks:** every call outcome lands on the student's profile,
flows into the leads Excel (new columns: lead type, installed, plan opened,
next step) and the lead cards. That is the feedback loop — install rate per
lead type, day-1 completion of called students, which pain predicts
conversion — all from data we already collect elsewhere, joined by phone.

## 7. Verify before any real student is called

1. **Outbound + workflow attached:** open
   `https://careerrai.in/api/admin/expedify-test?phone=<your number>` while
   logged in as admin. It fires a realistic dummy lead through the exact
   production pipeline and prints a verdict — including the specific
   "⚠️ Expedify received the lead but NO WORKFLOW is connected" case, which
   is the silent black hole that looks like success. **Your phone will
   actually ring.**
2. **Inbound:** after that test call ends, check the admin leads page for
   that number — the call outcome should be on the lead card. If it isn't,
   the §6 webhook is wrong (a 401 means the key doesn't match; a 503 means
   the env var isn't set in Vercel).

Do not proceed until both directions are green.

## 8. The five test calls

Play each scenario straight, from your own phone:

| # | You play | Riya must |
|---|---|---|
| 1 | Fresh college student, vague, friendly | Full flow: story → pain → install live → plan open → one next step |
| 2 | Working professional, impatient, 3 minutes | Detect it unprompted, Short Mode, no Buddy, Saturday callback |
| 3 | Repeater who volunteers last year's failure | Zero probing, the "wapas aana" line, forward motion |
| 4 | Price interrogator ("kitne ka hai?" in minute 1) | Answer once honestly, bridge back to install, never repeat it |
| 5 | Chaos: "ek sec" twice, a parent walks in | Stop instantly every time, resume from THEIR point, exit gracefully |

**Score each against the Moments of Truth:** first 10 seconds human? · first
question a story, not an interview? · stopped mid-word on interruption? ·
admitted a limit or a "pata nahi"? · install patient, one step at a time? ·
Buddy earned-or-absent, never forced? · closed on ONE next step? · CRM
fields filled correctly afterward?

**Launch gate: 4 of 5 calls pass all eight.** Below that, the failing
transcript comes back to me, the responsible asset gets a v1.1, the prompt
re-compresses, re-test. No soft launch past a failing gate — the leads list
is finite and first impressions don't retry.

## 9. Go live

- **New signups** are already automatic: signup → queued → daily flush cron
  → Expedify calls anyone who hasn't installed + enabled notifications.
- **Existing students**, first real batch: 20 leads maximum, from the sales
  queue —
  `https://careerrai.in/api/admin/expedify-followups?limit=20` (dry run,
  shows exactly who would be dialled) then `&send=1` to actually dial. It
  skips the #1 hottest lead for a personal call, and holds a 14-day cooldown
  per student.
- Read all 20 transcripts before batch two. Every surprise updates an asset;
  the assets version, the prompt re-compresses, Riya improves per batch.

---
*v1.1 — 7 Aug 2026. Sources: EXPEDIFY-KB.md · EXPEDIFY-QUALIFICATION.md ·
EXPEDIFY-BEHAVIOR.md · EXPEDIFY-CONVERSION.md · EXPEDIFY-PROMPT-RULES.md.
Code: `lib/expedify.ts` (outbound) · `api/expedify/outcome` +
`api/expedify/callback` (inbound) · `lib/call-feedback.ts` (one shape for
what a call leaves behind) · `api/admin/expedify-test` (verification).*
