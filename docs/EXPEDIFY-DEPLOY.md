# Riya — Expedify Setup, click by click (v1.2)

**The one setup document**, written against the real Expedify screens
(`app.expedify.ai`, 8 Aug). Work top to bottom and Expedify is closed.

> **State of the integration (verified in code + dashboard):** OUTBOUND
> works — a new signup POSTs a contact into Expedify with a full spoken-ready
> brief, the `Database Change Trigger` on Contacts/CREATE fires, and
> `AI Calling Agent Workflow` places the call. 173 calls dispatched. INBOUND
> has **never fired** — `expedify_events` is empty because no post-call node
> points back at us. Step 6 fixes that.

---

## 0. Which document goes where — the whole map

| Document | Where it goes | How |
|---|---|---|
| **EXPEDIFY-RIYA-PROMPT.txt** | `AI Calling Agent Workflow` → **VoiceAgent** node → *System Prompt* | **Pasted**, not uploaded |
| **EXPEDIFY-KB.md** | Automation → **Knowledge Bases** → new base `CareerRai — Riya KB` | **Uploaded** as a document |
| Greeting line | **VoiceAgent** node → **Messages** tab | Pasted |
| CRM fields | `Post Call - Lead Status Update Workflow` | Configured |
| Return webhook | `Post Call - Lead Status Update Workflow` → HTTP node | Configured |
| EXPEDIFY-QUALIFICATION.md | ❌ never — ours | Post-call scoring + CRM design |
| EXPEDIFY-CONVERSION.md | ❌ never — ours | Why students decide; trains us |
| EXPEDIFY-BEHAVIOR.md | ❌ never — source | Already compressed into the prompt |
| EXPEDIFY-PROMPT-RULES.md | ❌ never — source | Already inside the prompt |
| EXPEDIFY-DEPLOY.md (this) | ❌ never — the manual | For the founder |

**Exactly one file is ever uploaded into Expedify: `EXPEDIFY-KB.md`.** One
other file is pasted: the prompt. Everything else stays with us — uploading
the thinking documents makes Riya recite frameworks at students.

---

## 1. The prompt → VoiceAgent node

**Automation → Workflows → `AI Calling Agent Workflow` → click the
`VoiceAgent` node** (the purple phone-handset node).

- **System Prompt** — paste the entire `EXPEDIFY-RIYA-PROMPT.txt`.
- **Agent Name** — change `Voice Agent` to `Riya`.
- **Model** — `gpt-4o` is right: it's the fast one, and latency is the whole
  game on voice. Don't "upgrade" to a slower reasoning model.
- Click **Save to Library** and name it `Riya — CareerRai Admissions Caller
  v1.0`. Keep the version in the name — that's how we compare v1.0 calls to
  v1.1 calls later, and it's our substitute for A/B testing until volume
  justifies real tests.

## 2. The greeting → VoiceAgent → Messages tab

Bottom of the VoiceAgent node: **Messages · Voice · Timing · More**.

In **Messages**, set the first message:

> "Hi {{student_name}}! Main Riya bol rahi hoon, CareerRai se. Aap ne humari
> site pe CAT ke liye register kiya tha — abhi do minute baat kar sakte hain?"

## 3. Voice + interruption → VoiceAgent → Voice and Timing tabs

**Voice tab:** Indian female, Hinglish-capable, natural over crisp. "Sounds
like a person" beats diction — it decides the first ten seconds.

**Timing tab:** interruption / barge-in sensitivity to **maximum**. Riya
stopping mid-word the instant a student speaks is the most trust-critical
setting in the entire system. Silence before re-prompting: ~4 seconds
(thinking silence is good silence). Max call duration: 7 minutes.

## 4. The knowledge base → new base, then the Search node

**4a. Create the base.** Automation → **Knowledge Bases** → **+ Add
Knowledge Base**:
- Name: `CareerRai — Riya KB`
- Description: `CareerRai product truth: features, plans, pricing, install steps, student FAQs.`
- Create, then **+ Add Document** and upload `EXPEDIFY-KB.md`. If `.md` is
  rejected, rename the file to `.txt` — same content.

**4b. Point the agent at it.** In `AI Calling Agent Workflow`, click the
**Search Knowledge Base** node:
- **Knowledge Base Selection** — currently `1 KB (all docs)`. Change it to
  **only** `CareerRai — Riya KB`.
- **Tool description for the agent** — paste:
  > `Look up facts about CareerRai — features, plans, pricing, installation steps, and answers to student questions. Use this before answering any factual question about the product. If it returns nothing, say you don't know and the team will confirm.`

⚠️ **Do not leave this pointed at the shared/all-docs base.** The account
holds `Product Docs` (201 docs), `Onboarding Agent Knowledge`, `My Business`
and others. If Riya can retrieve those, she will confidently answer a CAT
student with content from an unrelated product — the single fastest way to
destroy the honesty this whole system is built on.

## 5. Pass the student brief → Voice Outbound Call node

Click the **Voice Outbound Call** node (orange). It already maps:
- Phone Number: `{{universaldatabasetrigger_1.new_data.phone}}`
- Variable `student_name`

**Add one more variable** — this is a real upgrade, not housekeeping. Our
signup hand-off already sends a plain-language paragraph written to be spoken
by the agent (`summary` in `lib/student-brief.ts`): attempt number, coaching,
hours they can study, the pains they ticked, strongest/weakest section, even
which browser they signed up in. Today the workflow drops all of it and Riya
calls blind.

- **+ Add Variable** → Name: `student_brief` → Value:
  `{{universaldatabasetrigger_1.new_data.summary}}`

If `summary` isn't in the trigger's field list, check the Contacts table for
where our payload landed (our POST sends `summary`, `pain_points`,
`hours_per_day`, `coaching`, `attempt`, `weakest_section`) and map whichever
column exists. The prompt already consumes `{{student_brief}}` and is
instructed never to read it aloud and never to ask what it already answers.

## 6. The return webhook → Post Call - Lead Status Update Workflow

**This is the step that has never been done, and it is the whole learning
loop.** Open `Post Call - Lead Status Update Workflow` and add an HTTP
request node after the call completes:

```
POST https://careerrai.in/api/expedify/outcome?key=<EXPEDIFY_INBOUND_SECRET>
Content-Type: application/json
```

`<EXPEDIFY_INBOUND_SECRET>` is a Vercel environment variable on the
`careerrai-daily` project. Check whether it already has a value; if not,
create any long random string, save it in Vercel, redeploy, and use the same
value here. **That secret belongs in Vercel and Expedify only — never in the
repo, never in chat** (the repo is public).

Body — `phone` is the only required field; everything else is what the call
learned:

```json
{
  "event": "call_report",
  "phone": "{{contact.phone}}",
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

Field-name variants are accepted (`lead_phone`/`contact_phone`/`mobile`;
`app_installed`; `plan_seen`; `next_action`; `notes`/`summary`), booleans may
be `true`/`"yes"`/`1`, and the raw payload is always stored in
`expedify_events` even if a name is unrecognised. Nothing is lost.

**What it unlocks:** every outcome lands on the student's profile → lead
cards and the leads Excel (new columns: lead type, installed, plan opened,
next step) → install rate per lead type, day-1 completion of called students,
which pain predicts conversion. All joined by phone to data we already have.

## 7. Activate, then verify both directions

- **Activate** `AI Calling Agent Workflow` — several workflows in the list
  show **Inactive**. An inactive workflow is the silent black hole where
  every lead is accepted and nobody is ever called.
- **Outbound test:** logged in as admin, open
  `https://careerrai.in/api/admin/expedify-test?phone=<your number>`. It fires
  a realistic dummy lead through the exact production pipeline and prints a
  verdict — including the specific "⚠️ received but NO WORKFLOW connected"
  case. **Your phone will actually ring.**
- **Inbound test:** after that call, open that number's lead card in
  `/admin/leads`. The outcome should be there. If not: 401 = key mismatch,
  503 = env var not set in Vercel.

Do not proceed until both are green.

## 8. The five test calls

| # | You play | Riya must |
|---|---|---|
| 1 | Fresh college student, vague, friendly | Full flow: story → pain → install live → plan open → one next step |
| 2 | Working professional, impatient, 3 minutes | Detect it unprompted, Short Mode, no Buddy, Saturday callback |
| 3 | Repeater who volunteers last year's failure | Zero probing, the "wapas aana" line, forward motion |
| 4 | Price interrogator ("kitne ka hai?" in minute 1) | Answer once honestly, bridge back to install, never repeat it |
| 5 | Chaos: "ek sec" twice, a parent walks in | Stop instantly every time, resume from THEIR point, exit gracefully |

**Score each on the Moments of Truth:** first 10 seconds human? · first
question a story, not an interview? · stopped mid-word on interruption? ·
admitted a limit or a "pata nahi"? · install patient, one step at a time? ·
Buddy earned-or-absent? · closed on ONE next step? · CRM fields filled?

**Launch gate: 4 of 5 pass all eight.** Below that, the failing transcript
comes back to me, the responsible asset gets a v1.1, the prompt
re-compresses, re-test. No soft launch past a failing gate.

## 9. Go live

- **New signups** are already automatic: signup → queued → daily flush cron →
  Expedify calls anyone who hasn't installed and enabled notifications.
- **Existing students**, first batch of 20:
  `https://careerrai.in/api/admin/expedify-followups?limit=20` (dry run —
  shows exactly who would be dialled), then `&send=1` to dial. Skips the #1
  hottest lead for a personal call; 14-day cooldown per student.
- Read all 20 transcripts before batch two. Every surprise updates an asset;
  assets version, prompt re-compresses, Riya improves per batch.
- **Automation → Executions** holds the run history of the 173 calls already
  placed. If recordings or transcripts are kept there, that is real data we
  can learn from tonight — worth more than another document.

---
*v1.2 — 8 Aug 2026. Written against the live dashboard. Sources:
EXPEDIFY-KB.md · EXPEDIFY-QUALIFICATION.md · EXPEDIFY-BEHAVIOR.md ·
EXPEDIFY-CONVERSION.md · EXPEDIFY-PROMPT-RULES.md. Code: `lib/expedify.ts` ·
`lib/student-brief.ts` · `api/expedify/outcome` · `api/expedify/callback` ·
`lib/call-feedback.ts` · `api/admin/expedify-test`.*
